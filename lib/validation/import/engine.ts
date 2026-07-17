// The validation engine: runs the row layers over a staged batch and persists what it
// finds.
//
// Structure (layer 1) is not here — it is about the FILE and runs at upload, where the
// headers still exist. See ./layers/structure.ts.
//
// Order is deliberate and load-bearing. Each layer depends on the last having passed:
// you cannot resolve a code in a row whose Fund Code is blank, cannot recompute Available
// Budget when Budget is the word "pending", and cannot spot a duplicate account before
// you know which account it is. A row that fails a layer is dropped from the ones after
// it, so one typo produces one finding instead of six consequential ones.

import type { TenantDb } from "@/lib/tenant-db";
import { datasetByKind } from "@/lib/datasets/kinds";
import { datasetDef } from "@/lib/datasets/registry";
import { loadResolveMaps } from "@/lib/import/resolve";
import { readStagedRows } from "@/lib/import/stage";
import type { Finding } from "@/lib/validation/import/findings";
import { typeFindings } from "@/lib/validation/import/layers/types";
import { referentialFindings, type ResolvedRow } from "@/lib/validation/import/layers/referential";
import { calculationFindings, computedValues } from "@/lib/validation/import/layers/calculation";
import { businessRuleFindings, type BusinessRuleThresholds } from "@/lib/validation/import/layers/business-rules";
import { duplicateFindings } from "@/lib/validation/import/layers/duplicates";
import { loadPolicy } from "@/lib/policies/load";
import { toBusinessRules } from "@/lib/policies/load";
import type { DatasetKind } from "@/lib/enums";

export interface ValidationSummary {
  batchId: string;
  rowsParsed: number;
  /** Rows that survived every layer — what would commit. */
  rowsValid: number;
  errorCount: number;
  warningCount: number;
  /** Errors block the import until the file is fixed (Spec §5.6). */
  canProceed: boolean;
}

/** Findings are written in this many rows at a time — same reasoning as staging. */
const WRITE_CHUNK = 1_000;

/**
 * Validates a staged batch, writes its findings, and records the outcome on the batch.
 *
 * Findings go to the database rather than being returned and held: the report outlives
 * the request that produced it, because the district reads it, fixes their file, and
 * comes back — possibly tomorrow.
 */
export async function validateBatch(
  db: TenantDb,
  batchId: string,
  /**
   * Overrides the district's own policy. Only tests pass this — in the app the rules come
   * from the district, which is the whole point of M2.10.
   */
  thresholds?: BusinessRuleThresholds,
): Promise<ValidationSummary> {
  const batch = await db.importBatch.findFirst({ where: { id: batchId } });
  if (!batch) throw new Error(`Import batch ${batchId} not found.`);

  const def = datasetDef(datasetByKind(batch.dataset as DatasetKind).slug);
  const staged = await readStagedRows(db, batchId);

  // Re-validating clears what a previous run said, or the report would accumulate the
  // history of every attempt and show the district findings they already fixed.
  //
  // EXCEPT the structure layer. Those are written once, at upload, by the route — they
  // are about the FILE, and once parsing is done the headers are gone, so this function
  // cannot recreate them. Deleting them here would silently drop "we ignored a column
  // called YTD Revenue" the moment anyone re-validated.
  await db.validationFinding.deleteMany({
    where: { batchId, layer: { not: "structure" } },
  });

  const findings: Finding[] = [];

  // Layer 2 — types & format.
  const typed = typeFindings(def, staged);
  findings.push(...typed.findings);

  // Layers 3 & 4 — vocabulary and referential integrity.
  const maps = await loadResolveMaps(db);
  const referential = referentialFindings(def, typed.typed, maps);
  findings.push(...referential.findings);

  const resolved = referential.resolved;

  // Layers 5, 6, 7 — all read the same resolved rows and are independent of each other.
  findings.push(...calculationFindings(def, resolved));
  // The district's own thresholds, not the workbook's constants — M2.10 swapped the
  // source behind this interface without the rule itself changing.
  const rules = thresholds ?? toBusinessRules(await loadPolicy(db, batch.districtId));
  findings.push(...businessRuleFindings(def, resolved, rules));
  findings.push(...duplicateFindings(def, resolved));

  await writeFindings(db, batchId, batch.districtId, findings);

  // Rows carrying an error of their own are not committable. Counted per row rather than
  // per finding, because one row can fail several ways.
  const failedRows = new Set(
    findings.filter((f) => f.severity === "ERROR" && f.rowNumber).map((f) => f.rowNumber!),
  );
  const committable = resolved.filter((r) => !failedRows.has(r.rowNumber));

  await rewriteStaging(db, batchId, staged, committable, def);

  // Counted from the DATABASE, not from `findings`, so the structure layer's warnings are
  // included. It wrote its findings at upload and they are not in this run's array — a
  // count taken from memory would tell the district "0 warnings" while the report above it
  // listed two.
  const [errors, warnings] = await Promise.all([
    db.validationFinding.count({ where: { batchId, severity: "ERROR" } }),
    db.validationFinding.count({ where: { batchId, severity: "WARNING" } }),
  ]);
  const canProceed = errors === 0;

  await db.importBatch.updateMany({
    where: { id: batchId },
    data: {
      status: canProceed ? "VALIDATED" : "FAILED",
      errorCount: errors,
      warningCount: warnings,
    },
  });

  return {
    batchId,
    rowsParsed: staged.length,
    rowsValid: committable.length,
    errorCount: errors,
    warningCount: warnings,
    canProceed,
  };
}

async function writeFindings(
  db: TenantDb,
  batchId: string,
  districtId: string,
  findings: Finding[],
): Promise<void> {
  for (let i = 0; i < findings.length; i += WRITE_CHUNK) {
    await db.validationFinding.createMany({
      // districtId is injected by the tenant extension, but the client is typed as the
      // base one — same tension and same answer as AnyDelegate in app/actions.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: findings.slice(i, i + WRITE_CHUNK).map((f) => ({ ...f, batchId })) as any,
    });
  }
}

/**
 * Writes the resolved rows back to staging, so commit does not re-resolve codes it has
 * already resolved — and, more importantly, so the rows it commits are exactly the ones
 * validation approved rather than a second interpretation of the same file.
 *
 * Calculated fields are computed here too, by `computedValues` — the same evaluator the
 * calculation layer compared the file against. One evaluator means the figure we store
 * and the figure we checked cannot disagree.
 *
 * DELETE-then-INSERT rather than an update per row. A per-row payload cannot be expressed
 * as a single updateMany, and the extension forbids `update` on a tenant model — so the
 * obvious loop is one round trip PER ROW. At 40,000 rows against a hosted database that
 * is not slow, it is broken: it blew a 5-second transaction timeout in testing at nine
 * rows. This is 1 delete plus one insert per 1,000 rows.
 *
 * Every row is rewritten, not just the valid ones: a row that failed still needs its
 * `raw` for the report, and for the next validation run after the district fixes the file.
 */
async function rewriteStaging(
  db: TenantDb,
  batchId: string,
  staged: { rowNumber: number; raw: Record<string, string> }[],
  committable: ResolvedRow[],
  def: ReturnType<typeof datasetDef>,
): Promise<void> {
  const resolvedByRow = new Map(
    committable.map((r) => [
      r.rowNumber,
      { ...r.value, ...r.ids, ...computedValues(def, r.value) },
    ]),
  );

  await db.importStagingRow.deleteMany({ where: { batchId } });

  for (let i = 0; i < staged.length; i += WRITE_CHUNK) {
    await db.importStagingRow.createMany({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: staged.slice(i, i + WRITE_CHUNK).map((s) => ({
        batchId,
        rowNumber: s.rowNumber,
        raw: s.raw,
        resolved: resolvedByRow.get(s.rowNumber) ?? undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      })) as any,
    });
  }
}
