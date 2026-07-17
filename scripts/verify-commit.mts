import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { makeTenantExtension } from "@/lib/tenant-scope";
import type { TenantDb } from "@/lib/tenant-db";
import { DATASET_DEFS } from "@/lib/datasets/registry";
import { parseFile } from "@/lib/import/parse/rows";
import { stageRows } from "@/lib/import/stage";
import { validateBatch } from "@/lib/validation/import/engine";
import { commitBatch, restoreVersion, CommitError } from "@/lib/import/commit";
import { checkDuplicate, DUPLICATE_PROMPT, isChoiceAllowed } from "@/lib/import/duplicate";
import { toModelRow } from "@/lib/import/rows-to-model";

/**
 * Checks the upload -> validate -> replace -> restore round trip, and that a failed
 * commit leaves nothing behind.
 *
 * Unlike the other verify scripts this one COMMITS — a transaction that rolls back cannot
 * test transactions. It cleans up after itself in a finally, and everything it creates is
 * tagged so the cleanup can find it even if the run dies half way.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  }),
});
const tenantDb = (districtId: string) =>
  prisma.$extends(makeTenantExtension(districtId)) as unknown as TenantDb;

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const scoped = <T,>(rows: T[]): any => rows as any;

const USER = "verify-commit-script";
const FY = "2099-00"; // a fiscal year no real district will have, so cleanup is unambiguous
const CASH = DATASET_DEFS["cash-position"];

const csv = (rows: string[][]) =>
  [
    ["Fund Code", "Beginning Cash Balance", "Cash Receipts MTD", "Cash Disbursements MTD"],
    ...rows,
  ]
    .map((r) => r.join(","))
    .join("\n");

/** The workbook's own example: $72.0M + $48.5M − $44.2M = $76.3M. */
const V1 = [["0101", "72000000", "48500000", "44200000"]];
const V2 = [["0101", "72000000", "50000000", "44200000"]];

async function main() {
  const district = await prisma.district.findFirst({ orderBy: { createdAt: "asc" } });
  if (!district) {
    console.log("No district found — run `npm run seed:demo` first.");
    process.exit(1);
  }
  console.log(`\nDistrict: ${district.name}`);
  const db = tenantDb(district.id);

  await cleanup(district.id);

  // Master data this fixture resolves against. Reused if a previous run left it.
  let fund = await db.fund.findFirst({ where: { code: "0101" } });
  let madeFund = false;
  if (!fund) {
    await db.fund.createMany({ data: scoped([{ code: "0101", name: "General Fund" }]) });
    fund = await db.fund.findFirst({ where: { code: "0101" } });
    madeFund = true;
  }

  try {
    // ---- the mapper, checked without a database ----
    console.log("\nResolved row -> model row");
    const mapped = toModelRow(
      "cash-position",
      {
        fundId: "fund-id",
        beginningCash: "72000000",
        receiptsMtd: "48500000",
        disbursementsMtd: "44200000",
        endingCash: "76300000.00",
      },
      { versionId: "v1", fiscalYear: FY, period: 2 },
    );
    assert(mapped.endingCash === "76300000.00", "the workbook's arithmetic survives: 72.0 + 48.5 − 44.2 = 76.3M");
    assert(mapped.investmentBalance === null, "an absent optional amount becomes null, not zero");
    assert(mapped.period === 2, "the period comes from context, not the row");

    // ---- first upload ----
    console.log("\nFirst upload for a fresh period");
    const before = await checkDuplicate(db, { dataset: "CASH_POSITION", fiscalYear: FY, period: 2 });
    assert(!before.exists, "no existing version");
    assert(before.nextVersion === 1, "this upload would be v1");
    assert(isChoiceAllowed(before, "INITIAL"), "INITIAL is allowed");
    assert(!isChoiceAllowed(before, "REPLACED"), "REPLACED is refused — there is nothing to replace");

    const b1 = await upload(db, V1);
    const r1 = await commitBatch(db, { batchId: b1, action: "INITIAL", userId: USER });
    assert(r1.version === 1, "committed as v1");
    assert(r1.rowCount === 1, "one row landed");

    const rows1 = await db.cashPosition.findMany({ where: { versionId: r1.versionId } });
    assert(rows1.length === 1, "the row is in the real table");
    assert(rows1[0].endingCash.toString() === "76300000", "Ending Cash was computed, not taken from the file");
    assert(
      (await db.importStagingRow.count({ where: { batchId: b1 } })) === 0,
      "staging was cleared — the file's contents don't linger",
    );

    // ---- the duplicate prompt ----
    console.log("\nRe-uploading the same period");
    const dup = await checkDuplicate(db, { dataset: "CASH_POSITION", fiscalYear: FY, period: 2 });
    assert(dup.exists, "the period is now recognised as already having data");
    assert(dup.existing?.version === 1, "and names v1 as what is there");
    assert(dup.nextVersion === 2, "the next upload would be v2");
    assert(
      dup.choices.includes("REPLACED") && dup.choices.includes("NEW_VERSION"),
      "both replace and keep-as-new-version are offered",
    );
    assert(!isChoiceAllowed(dup, "INITIAL"), "INITIAL is no longer allowed");
    assert(
      DUPLICATE_PROMPT ===
        "This reporting period already has data uploaded. Do you want to replace the existing data, cancel the upload, or keep it as a new version?",
      "the prompt is the client's exact sentence, not a paraphrase",
    );

    // ---- keep as a new version ----
    console.log("\nKeep as a new version");
    const b2 = await upload(db, V2);
    const r2 = await commitBatch(db, { batchId: b2, action: "NEW_VERSION", userId: USER });
    assert(r2.version === 2, "committed as v2");

    const versions = await db.datasetVersion.findMany({
      where: { dataset: "CASH_POSITION", fiscalYear: FY, period: 2 },
      orderBy: { version: "asc" },
    });
    assert(versions.length === 2, "both versions exist");
    assert(versions[0].isCurrent === false, "v1 is no longer current");
    assert(versions[1].isCurrent === true, "v2 is current");
    assert(
      (await db.cashPosition.count({ where: { versionId: versions[0].id } })) === 1,
      "v1's DATA is retained — a new version does not destroy the old one",
    );

    // ---- replace ----
    console.log("\nReplace");
    const b3 = await upload(db, V1);
    const r3 = await commitBatch(db, { batchId: b3, action: "REPLACED", userId: USER });
    assert(r3.version === 3, "committed as v3");
    assert(r3.supersededVersion === 2, "and reports that it superseded v2");
    assert(
      (await db.cashPosition.count({ where: { versionId: versions[1].id } })) === 0,
      "v2's data is gone — that is what replace means",
    );
    assert(
      (await db.datasetVersion.count({ where: { id: versions[1].id } })) === 1,
      "but v2's version record survives, so the history still says it happened",
    );
    assert(
      (await db.cashPosition.count({ where: { versionId: versions[0].id } })) === 1,
      "and v1, which was not the one replaced, is untouched",
    );

    // ---- exactly one current, always ----
    console.log("\nThe invariant holds throughout");
    const currents = await db.datasetVersion.count({
      where: { dataset: "CASH_POSITION", fiscalYear: FY, period: 2, isCurrent: true },
    });
    assert(currents === 1, `exactly one current version after three commits (found ${currents})`);

    // ---- restore ----
    console.log("\nRestore");
    const restored = await restoreVersion(db, { versionId: versions[0].id, userId: USER });
    assert(restored.version === 4, "a restore writes a NEW version (v4) — history is never mutated");
    assert(restored.rowCount === 1, "carrying the old rows");
    const afterRestore = await db.datasetVersion.findMany({
      where: { dataset: "CASH_POSITION", fiscalYear: FY, period: 2, isCurrent: true },
    });
    assert(afterRestore.length === 1, "still exactly one current");
    assert(afterRestore[0].version === 4, "and it is the restore");
    assert(
      (await db.cashPosition.count({ where: { versionId: versions[0].id } })) === 1,
      "the source version keeps its own rows — a restore copies, it does not move",
    );

    let restoreCurrent = "";
    try {
      await restoreVersion(db, { versionId: afterRestore[0].id, userId: USER });
    } catch (e) {
      restoreCurrent = (e as Error).message;
    }
    assert(/already the current/.test(restoreCurrent), "restoring the current version is refused");

    let restoreEmpty = "";
    try {
      await restoreVersion(db, { versionId: versions[1].id, userId: USER });
    } catch (e) {
      restoreEmpty = (e as Error).message;
    }
    assert(
      /superseded by a replace/.test(restoreEmpty),
      "restoring a version whose data a replace destroyed says so, rather than restoring nothing",
    );

    // ---- a commit that fails leaves nothing behind ----
    console.log("\nAtomicity");
    const versionsBefore = await db.datasetVersion.count({
      where: { dataset: "CASH_POSITION", fiscalYear: FY },
    });
    const rowsBefore = await db.cashPosition.count({});

    // A row referencing a fund that does not exist. Resolution cannot catch it — the id
    // is well-formed — so it fails at the FK, mid-transaction, exactly as a real
    // infrastructure failure would.
    const b4 = await upload(db, V1);
    await db.importStagingRow.updateMany({
      where: { batchId: b4 },
      data: scoped([
        {
          resolved: {
            fundId: "cl00000000000000000000000",
            beginningCash: "1",
            receiptsMtd: "1",
            disbursementsMtd: "1",
            endingCash: "1.00",
          },
        },
      ])[0],
    });

    let threw = false;
    try {
      await commitBatch(db, { batchId: b4, action: "NEW_VERSION", userId: USER });
    } catch {
      threw = true;
    }
    assert(threw, "a commit that hits a bad reference throws");
    assert(
      (await db.datasetVersion.count({ where: { dataset: "CASH_POSITION", fiscalYear: FY } })) ===
        versionsBefore,
      "no version row survives the failure",
    );
    assert((await db.cashPosition.count({})) === rowsBefore, "and no data rows survive it either");
    const stillCurrent = await db.datasetVersion.count({
      where: { dataset: "CASH_POSITION", fiscalYear: FY, period: 2, isCurrent: true },
    });
    assert(stillCurrent === 1, "the previous current version is still current — the rollback restored it");

    // ---- the guards ----
    console.log("\nGuards");
    let twice = "";
    try {
      await commitBatch(db, { batchId: b1, action: "NEW_VERSION", userId: USER });
    } catch (e) {
      twice = (e as Error).message;
    }
    assert(/already been committed/.test(twice), "a batch cannot be committed twice");

    const bErr = await upload(db, [["9999", "1", "1", "1"]]); // unknown fund -> an error
    let blocked = "";
    try {
      await commitBatch(db, { batchId: bErr, action: "NEW_VERSION", userId: USER });
    } catch (e) {
      blocked = (e as Error).message;
    }
    assert(/error/.test(blocked), "a batch with errors cannot be committed");
    assert(blocked.includes("1 error"), "and the message counts them, in singular");

    let wrongChoice = "";
    try {
      const b5 = await upload(db, V1);
      await commitBatch(db, { batchId: b5, action: "INITIAL", userId: USER });
    } catch (e) {
      wrongChoice = (e as Error).message;
    }
    assert(
      /already has data/.test(wrongChoice),
      "INITIAL over an existing period is refused with a sentence, not a database error",
    );
    assert(wrongChoice.length > 0 && !/prisma|constraint/i.test(wrongChoice), "the refusal is human, not technical");
  } finally {
    await cleanup(district.id);
    if (madeFund && fund) {
      await prisma.fund.deleteMany({ where: { id: fund.id } });
    }
  }

  console.log("\nCleanup");
  assert(
    (await prisma.datasetVersion.count({ where: { committedByUserId: USER } })) === 0,
    "nothing this script created is left behind",
  );

  console.log(`\n${passed} passed, ${failed} failed\n`);
}

/** Uploads, stages and validates a fixture, returning the batch id. */
async function upload(db: TenantDb, rows: string[][]): Promise<string> {
  const parsed = await parseFile(CASH, "cash.csv", Buffer.from(csv(rows), "utf8"));
  const batch = await db.importBatch.create({
    data: scoped([
      {
        dataset: "CASH_POSITION",
        fiscalYear: FY,
        periodType: "MONTHLY",
        period: 2,
        fileName: "cash.csv",
        fileSize: 1,
        uploadedByUserId: USER,
      },
    ])[0],
  });
  await stageRows(db, batch.id, parsed.rows);
  await validateBatch(db, batch.id);
  return batch.id;
}

/** Removes everything this script creates. Keyed on the impossible fiscal year. */
async function cleanup(districtId: string): Promise<void> {
  const db = tenantDb(districtId);
  const versions = await db.datasetVersion.findMany({
    where: { fiscalYear: FY },
    select: { id: true },
  });
  for (const v of versions) {
    await db.cashPosition.deleteMany({ where: { versionId: v.id } });
  }
  await db.datasetVersion.deleteMany({ where: { fiscalYear: FY } });
  await db.importBatch.deleteMany({ where: { fiscalYear: FY } });
}

main()
  .catch((e) => {
    console.error("\nVERIFY ERROR:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    if (failed > 0) process.exitCode = 1;
  });
