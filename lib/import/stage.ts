import type { TenantDb } from "@/lib/tenant-db";
import type { RawRow } from "@/lib/import/parse/rows";

/**
 * Parking parsed rows between the requests that produced them and the request that
 * commits them.
 *
 * Staging is not an optimisation for large files — it is what the lifecycle requires.
 * Spec §7 spans several round trips: upload -> validate -> show report -> acknowledge
 * warnings -> duplicate prompt -> choose -> commit. The parsed rows have to survive
 * between the report and the user's decision, or the district would re-upload the file
 * just to commit it. Large files simply make it obvious sooner.
 *
 * Because rows are keyed to a batch, a chunked upload can append to the same batch later
 * without any of this changing.
 */

/**
 * Postgres has a hard cap on bind parameters per statement (65,535). Each staging row
 * binds 5 columns, so ~13,000 rows would be the ceiling; 1,000 keeps a wide margin and
 * still turns 40,000 rows into 40 statements instead of 40,000.
 */
const BATCH_SIZE = 1_000;

export async function stageRows(
  db: TenantDb,
  batchId: string,
  rows: { rowNumber: number; raw: RawRow }[],
): Promise<number> {
  let written = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const result = await db.importStagingRow.createMany({
      // districtId is injected by the tenant extension at runtime — verified, including
      // inside a transaction (scripts/verify-versioning.mts). But `db` is typed as the
      // BASE client (the extension only filters; it does not change model shapes), so
      // TypeScript still demands the column. The app has the same tension and answers it
      // the same way — see AnyDelegate in app/actions/master-data.ts.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: chunk.map((r) => ({ batchId, rowNumber: r.rowNumber, raw: r.raw })) as any,
    });
    written += result.count;
  }

  return written;
}

/** Reads a batch's staged rows in file order — the order the report must list them in. */
export async function readStagedRows(
  db: TenantDb,
  batchId: string,
): Promise<{ rowNumber: number; raw: RawRow }[]> {
  const rows = await db.importStagingRow.findMany({
    where: { batchId },
    orderBy: { rowNumber: "asc" },
    select: { rowNumber: true, raw: true },
  });
  return rows.map((r) => ({ rowNumber: r.rowNumber, raw: r.raw as RawRow }));
}

/**
 * Drops a batch's staged rows. Called on commit and on cancel.
 *
 * Not strictly required on commit — the FK cascades from ImportBatch — but staging is
 * scratch space, and leaving a district's whole file sitting in it after the data has
 * landed in the real tables is how a "we don't retain your file" promise quietly stops
 * being true in spirit.
 */
export async function clearStagedRows(db: TenantDb, batchId: string): Promise<number> {
  const { count } = await db.importStagingRow.deleteMany({ where: { batchId } });
  return count;
}
