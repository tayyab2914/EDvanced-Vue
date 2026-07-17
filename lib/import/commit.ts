import type { TenantDb } from "@/lib/tenant-db";
import { datasetByKind, type DatasetSlug } from "@/lib/datasets/kinds";
import { datasetDef } from "@/lib/datasets/registry";
import { toModelRows, type ResolvedPayload } from "@/lib/import/rows-to-model";
import { checkDuplicate, isChoiceAllowed } from "@/lib/import/duplicate";
import type { DatasetKind, ImportAction } from "@/lib/enums";

/**
 * Steps 6 and 7 of the lifecycle: commit and version.
 *
 * Everything here happens in ONE transaction, and that is the point of the module. A
 * half-committed reporting period is worse than a failed one: the district sees numbers,
 * believes them, and they are a fragment of a file.
 *
 * Three constraints shape the implementation, and none is negotiable:
 *
 *   1. The tenant extension THROWS on upsert/update/delete for tenant models. So Replace
 *      is deleteMany + createMany, not an upsert. (lib/tenant-scope.ts:52)
 *   2. The extension DOES still inject districtId inside a transaction — verified against
 *      the live database, not assumed. That is what lets this code stay ignorant of the
 *      district entirely.
 *   3. A partial unique index enforces exactly one current version per period. So
 *      isCurrent must be cleared BEFORE the new one is set, or Postgres refuses the
 *      write — which is the invariant doing its job.
 */

export class CommitError extends Error {}

export interface CommitResult {
  versionId: string;
  version: number;
  action: ImportAction;
  rowCount: number;
  /** Set when a Replace superseded a previous version. */
  supersededVersion?: number;
}

export async function commitBatch(
  db: TenantDb,
  args: {
    batchId: string;
    action: ImportAction;
    userId: string;
  },
): Promise<CommitResult> {
  const batch = await db.importBatch.findFirst({ where: { id: args.batchId } });
  if (!batch) throw new CommitError("That upload no longer exists.");

  if (batch.status === "COMMITTED") {
    throw new CommitError("That upload has already been committed.");
  }
  // Errors block the import until the file is fixed (Spec §5.6). Checked here as well as
  // in the UI: the button being hidden is not a guarantee.
  if (batch.errorCount > 0) {
    throw new CommitError(
      `This file still has ${batch.errorCount} error${batch.errorCount === 1 ? "" : "s"} to fix before it can be imported.`,
    );
  }
  if (batch.status !== "VALIDATED") {
    throw new CommitError("This file hasn't been validated yet.");
  }
  // Warnings can be acknowledged and passed — but they must actually BE acknowledged.
  if (batch.warningCount > 0 && !batch.warningsAckedAt) {
    throw new CommitError(
      `Review the ${batch.warningCount} warning${batch.warningCount === 1 ? "" : "s"} before importing.`,
    );
  }

  const meta = datasetByKind(batch.dataset as DatasetKind);
  const def = datasetDef(meta.slug);

  const check = await checkDuplicate(db, {
    dataset: batch.dataset as DatasetKind,
    fiscalYear: batch.fiscalYear,
    period: batch.period,
  });
  if (!isChoiceAllowed(check, args.action)) {
    throw new CommitError(
      check.exists
        ? "This period already has data. Choose whether to replace it or keep this as a new version."
        : "This period has no data yet, so there is nothing to replace.",
    );
  }

  // Read the rows BEFORE opening the transaction. They are already validated and
  // resolved; pulling them inside would hold the transaction open across a read that
  // does not need its isolation, and interactive transactions are on a timer.
  const staged = await db.importStagingRow.findMany({
    where: { batchId: args.batchId },
    orderBy: { rowNumber: "asc" },
    select: { resolved: true },
  });
  const payloads = staged
    .map((s) => s.resolved as ResolvedPayload | null)
    .filter((r): r is ResolvedPayload => r !== null);

  if (payloads.length === 0) {
    throw new CommitError("There are no valid rows to import.");
  }

  return db.$transaction(async (tx) => {
    const t = tx as TenantDb;

    // Clear the current flag first — the partial unique index will reject an overlap.
    if (check.exists) {
      await t.datasetVersion.updateMany({
        where: {
          dataset: batch.dataset,
          fiscalYear: batch.fiscalYear,
          period: batch.period,
          isCurrent: true,
        },
        data: { isCurrent: false },
      });
    }

    // Replace supersedes the previous version's DATA. The version row itself survives:
    // history is what makes a replace recoverable, and dropping it would make "replace"
    // mean "delete", which is not what the district was offered.
    if (args.action === "REPLACED" && check.existing) {
      await deleteRowsOfVersion(t, meta.slug, check.existing.id);
    }

    const version = await t.datasetVersion.create({
      data: {
        dataset: batch.dataset,
        fiscalYear: batch.fiscalYear,
        periodType: batch.periodType,
        period: batch.period,
        budgetType: batch.budgetType,
        version: check.nextVersion,
        isCurrent: true,
        action: args.action,
        batchId: batch.id,
        rowCount: payloads.length,
        errorCount: batch.errorCount,
        warningCount: batch.warningCount,
        fileName: batch.fileName,
        committedByUserId: args.userId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    });

    await insertRows(t, meta.slug, payloads, {
      versionId: version.id,
      fiscalYear: batch.fiscalYear,
      period: batch.period,
    });

    // Staging is scratch space. Leaving a district's whole file in it after the data has
    // landed is how "we don't retain your file" quietly stops being true in spirit.
    await t.importStagingRow.deleteMany({ where: { batchId: batch.id } });
    await t.importBatch.updateMany({
      where: { id: batch.id },
      data: { status: "COMMITTED" },
    });

    return {
      versionId: version.id,
      version: version.version,
      action: args.action,
      rowCount: payloads.length,
      supersededVersion: args.action === "REPLACED" ? check.existing?.version : undefined,
    };
  }, {
    // Generous, and deliberately so: a 40,000-row insert against a hosted database is
    // slow in a way that has nothing to do with anything being wrong. Prisma's 5s default
    // is sized for a two-statement transaction.
    timeout: 120_000,
    maxWait: 20_000,
  });
}

/** ~1,000 rows per statement, for Postgres's 65,535 bind-parameter cap. */
const INSERT_CHUNK = 1_000;

async function insertRows(
  tx: TenantDb,
  slug: DatasetSlug,
  payloads: ResolvedPayload[],
  ctx: { versionId: string; fiscalYear: string; period: number | null },
): Promise<void> {
  const model = datasetDef(slug).model;
  const rows = toModelRows(slug, payloads, ctx);

  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (tx as any)[model].createMany({ data: rows.slice(i, i + INSERT_CHUNK) });
  }
}

async function deleteRowsOfVersion(
  tx: TenantDb,
  slug: DatasetSlug,
  versionId: string,
): Promise<void> {
  const model = datasetDef(slug).model;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (tx as any)[model].deleteMany({ where: { versionId } });
}

/**
 * Makes an earlier version current again.
 *
 * A restore writes a NEW version that copies the old rows; it never mutates history or
 * simply flips a flag back. Two reasons, and the second is the real one:
 *
 *   - the audit trail should say a restore happened, with who and when;
 *   - "the numbers changed back" and "someone deliberately restored v1 on Tuesday" are
 *     different facts, and only one of them survives a flag flip.
 */
export async function restoreVersion(
  db: TenantDb,
  args: { versionId: string; userId: string },
): Promise<CommitResult> {
  const source = await db.datasetVersion.findFirst({ where: { id: args.versionId } });
  if (!source) throw new CommitError("That version no longer exists.");
  if (source.isCurrent) throw new CommitError("That version is already the current one.");

  const meta = datasetByKind(source.dataset as DatasetKind);
  const model = datasetDef(meta.slug).model;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oldRows: Record<string, unknown>[] = await (db as any)[model].findMany({
    where: { versionId: source.id },
  });
  if (oldRows.length === 0) {
    throw new CommitError(
      "That version's data was superseded by a replace, so there is nothing to restore.",
    );
  }

  const check = await checkDuplicate(db, {
    dataset: source.dataset as DatasetKind,
    fiscalYear: source.fiscalYear,
    period: source.period,
  });

  return db.$transaction(async (tx) => {
    const t = tx as TenantDb;

    await t.datasetVersion.updateMany({
      where: {
        dataset: source.dataset,
        fiscalYear: source.fiscalYear,
        period: source.period,
        isCurrent: true,
      },
      data: { isCurrent: false },
    });

    const version = await t.datasetVersion.create({
      data: {
        dataset: source.dataset,
        fiscalYear: source.fiscalYear,
        periodType: source.periodType,
        period: source.period,
        budgetType: source.budgetType,
        version: check.nextVersion,
        isCurrent: true,
        action: "NEW_VERSION",
        // No batch: a restore imports no file. Borrowing the source's batch id would
        // collide on batchId's unique index — and would also claim this version came
        // from an upload that produced a different version entirely.
        batchId: null,
        restoredFromVersionId: source.id,
        rowCount: oldRows.length,
        errorCount: source.errorCount,
        warningCount: source.warningCount,
        // The name of the file the data originally came from, carried forward so the
        // version list can still say where these numbers started.
        fileName: source.fileName,
        committedByUserId: args.userId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    });

    // Copy the rows, dropping the identity columns so they become new rows rather than
    // an attempt to move the old ones.
    const copies = oldRows.map((r) => {
      const { id: _id, districtId: _d, versionId: _v, ...rest } = r;
      return { ...rest, versionId: version.id };
    });

    for (let i = 0; i < copies.length; i += INSERT_CHUNK) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (tx as any)[model].createMany({ data: copies.slice(i, i + INSERT_CHUNK) });
    }

    return {
      versionId: version.id,
      version: version.version,
      action: "NEW_VERSION" as ImportAction,
      rowCount: copies.length,
    };
  }, { timeout: 120_000, maxWait: 20_000 });
}
