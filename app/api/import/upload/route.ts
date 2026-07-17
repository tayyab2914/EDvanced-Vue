import { resolveTenantDb, userCan } from "@/lib/auth/dal";
import { writeAudit } from "@/lib/audit";
import { datasetBySlug } from "@/lib/datasets/kinds";
import { datasetDef } from "@/lib/datasets/registry";
import { isFiscalYear, isValidPeriod } from "@/lib/periods/fiscal";
import { parseFile, UnsupportedFileError } from "@/lib/import/parse/rows";
import { stageRows } from "@/lib/import/stage";
import { structureFindings } from "@/lib/validation/import/layers/structure";
import { validateBatch } from "@/lib/validation/import/engine";
import { PeriodType } from "@/lib/enums";

/**
 * Receives an upload, parses it, and stages the rows. Validation is a separate step
 * (M2.5) that reads from staging.
 *
 * A ROUTE HANDLER, not a Server Action, and that is the whole reason this file exists.
 * Next caps Server Action request bodies at 1MB by default — every M1 import goes through
 * one, which is fine for a master-data CSV and hopeless for a district's finance
 * workbook. Route Handlers are not subject to that cap. We use the right primitive rather
 * than raising a limit.
 *
 * Vercel's 4.5MB platform cap on a serverless request body still applies: roughly 30k
 * rows of CSV, or 80k+ of xlsx once compression is counted. Comfortably past a realistic
 * district-month. When a file does outgrow it, the answer is a chunked upload appending
 * to the same batch — which the staging table is already shaped for.
 */

/** Refused before reading the body — no point buffering 200MB to say no. */
const MAX_BYTES = 4 * 1024 * 1024;

function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return bad("Could not read the upload. Please try again.");
  }

  // ---- what is being uploaded ----
  const slug = String(form.get("dataset") ?? "");
  const meta = datasetBySlug(slug);
  if (!meta) return bad(`Unknown import type "${slug}".`);
  const def = datasetDef(meta.slug);

  const fiscalYear = String(form.get("fiscalYear") ?? "").trim();
  if (!isFiscalYear(fiscalYear)) {
    return bad(`"${fiscalYear}" is not a fiscal year. Use the form 2026-27.`);
  }

  const rawPeriod = String(form.get("period") ?? "").trim();
  const period = rawPeriod === "" ? null : Number(rawPeriod);
  if (!isValidPeriod(meta.periodType, period)) {
    return bad(
      meta.periodType === PeriodType.ANNUAL
        ? `${meta.label} is an annual import — it covers the whole year, so it takes no reporting period.`
        : `"${rawPeriod}" is not a reporting period for ${meta.label}.`,
    );
  }

  // ---- who is uploading ----
  // districtId is only honoured for a Platform Admin; for everyone else resolveTenantDb
  // ignores it and uses the session's own district.
  const requested = form.get("districtId");
  const { db, user, districtId } = await resolveTenantDb(
    typeof requested === "string" && requested ? requested : undefined,
  );

  // userCan, not hasPermission: an external user's granted level decides this, so a
  // View Only auditor is refused here even though they can read the same screens.
  if (!userCan(user, "upload_data")) {
    return bad("You are not authorized to upload data for this district.", 403);
  }

  // ---- the file ----
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return bad("Choose a file to upload.");
  }
  if (file.size > MAX_BYTES) {
    return bad(
      `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is ${MAX_BYTES / 1024 / 1024}MB — ` +
        `split it by fund, or save it as .xlsx, which compresses.`,
      413,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // The batch exists before parsing, so a file that blows up still leaves a record of
  // having been tried. A district asking "did my upload go through?" deserves an answer.
  const batch = await db.importBatch.create({
    data: {
      dataset: meta.kind,
      fiscalYear,
      periodType: meta.periodType,
      period,
      budgetType: meta.budgetType ?? null,
      status: "PARSING",
      fileName: file.name,
      fileSize: file.size,
      uploadedByUserId: user.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  });

  try {
    const parsed = await parseFile(def, file.name, buffer);

    // A missing required column is fatal: there is no point staging 40,000 rows to say
    // the file is unreadable. Reported here rather than as a finding, because there is
    // no batch worth reviewing.
    if (parsed.headers.missingRequired.length > 0) {
      const names = parsed.headers.missingRequired.map((f) => `"${f.label}"`).join(", ");
      await fail(db, batch.id);
      return bad(
        `This file is missing ${parsed.headers.missingRequired.length === 1 ? "a required column" : "required columns"}: ${names}.` +
          (parsed.headers.unknown.length
            ? ` It does have ${parsed.headers.unknown.map((u) => `"${u}"`).join(", ")}, which we don't recognise — check for a renamed column.`
            : ""),
      );
    }

    if (parsed.rowCount === 0) {
      await fail(db, batch.id);
      return bad("That file has headers but no rows.");
    }

    const staged = await stageRows(db, batch.id, parsed.rows);
    await db.importBatch.updateMany({
      where: { id: batch.id },
      data: { rowsParsed: staged },
    });

    // Structure findings are persisted HERE rather than in the engine, because they are
    // the only ones about the file: once parsing is done the headers are gone, and
    // staging keeps rows keyed by field. The engine adds the row-level layers on top.
    const structural = structureFindings(def, parsed.headers);
    if (structural.length > 0) {
      await db.validationFinding.createMany({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: structural.map((f) => ({ ...f, batchId: batch.id })) as any,
      });
    }

    await writeAudit({
      action: "DATA_UPLOADED",
      actorUserId: user.id,
      districtId,
      entityType: meta.label,
      entityId: batch.id,
      metadata: { dataset: meta.kind, fiscalYear, period, rows: staged, fileName: file.name },
    });

    // Validate in the same request. The lifecycle (Spec §7) puts validation immediately
    // after upload with no decision in between, and a district's actual question is "is it
    // clean?" — not "did the bytes arrive?". Leaving the batch at PARSING would also mean
    // the report showed only structure findings and the commit guard refused a file
    // nobody had told it was fine.
    const summary = await validateBatch(db, batch.id);

    await writeAudit({
      action: "DATA_VALIDATED",
      actorUserId: user.id,
      districtId,
      entityType: meta.label,
      entityId: batch.id,
      metadata: {
        rows: summary.rowsParsed,
        valid: summary.rowsValid,
        errors: summary.errorCount,
        warnings: summary.warningCount,
      },
    });

    return Response.json({
      batchId: batch.id,
      rowsParsed: staged,
      errorCount: summary.errorCount,
      warningCount: summary.warningCount,
      canProceed: summary.canProceed,
      // Not fatal, but the district should see them: a column we ignored may be one they
      // meant us to read.
      unknownColumns: parsed.headers.unknown,
      missingRecommended: parsed.headers.missingRecommended.map((f) => f.label),
    });
  } catch (e) {
    await fail(db, batch.id);
    if (e instanceof UnsupportedFileError) return bad(e.message);
    console.error("[import] parse failed:", e);
    return bad("We couldn't read that file. Check it opens in Excel, then try again.", 500);
  }
}

/** Marks a batch failed. updateMany, not update — the tenant extension allows only that. */
async function fail(
  db: Awaited<ReturnType<typeof resolveTenantDb>>["db"],
  batchId: string,
): Promise<void> {
  await db.importBatch.updateMany({ where: { id: batchId }, data: { status: "FAILED" } });
}
