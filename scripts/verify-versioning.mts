import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { makeTenantExtension } from "@/lib/tenant-scope";

/**
 * Checks the DatasetVersion invariants that live in raw SQL rather than in the schema,
 * plus that the M2 models are actually tenant-scoped.
 *
 * These cannot be unit-tested — they are database constraints, so they need a database.
 * Everything here runs inside a transaction that is rolled back; nothing persists.
 *
 * Grows in M2.6 to cover replace / new-version / restore round-trips.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  }),
});
const tenantDb = (districtId: string) =>
  prisma.$extends(makeTenantExtension(districtId)) as unknown as typeof prisma;

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

const ROLLBACK = "__verify_rollback__";

// A fiscal year no real district will have. These tests build CURRENT versions, and the
// one-current index will (correctly) refuse them if they collide with seeded data — as
// they did the day the sample data landed on 2026-27. verify-commit and verify-finance
// use 2099-00 and 2098-99 for the same reason.
const FY = "2095-96";
const isUniqueViolation = (e: unknown) =>
  /Unique constraint|duplicate key value/i.test((e as Error).message);

/** Runs `fn` in a transaction that always rolls back. */
async function inRollback(
  db: ReturnType<typeof tenantDb>,
  fn: (tx: typeof db) => Promise<void>,
): Promise<void> {
  try {
    await db.$transaction(async (tx) => {
      await fn(tx as typeof db);
      throw new Error(ROLLBACK);
    });
  } catch (e) {
    if ((e as Error).message !== ROLLBACK) throw e;
  }
}

function versionData(over: Record<string, unknown> = {}) {
  return {
    dataset: "REVENUE_DETAIL",
    fiscalYear: FY,
    periodType: "MONTHLY",
    period: 2,
    version: 1,
    isCurrent: true,
    action: "INITIAL",
    rowCount: 0,
    errorCount: 0,
    warningCount: 0,
    fileName: "verify.csv",
    committedByUserId: "verify-script",
    ...over,
  };
}

/** A DatasetVersion needs an ImportBatch (1:1). Makes a throwaway one. */
async function makeBatch(tx: ReturnType<typeof tenantDb>, over: Record<string, unknown> = {}) {
  return tx.importBatch.create({
    data: {
      dataset: "REVENUE_DETAIL",
      fiscalYear: FY,
      periodType: "MONTHLY",
      period: 2,
      status: "COMMITTED",
      fileName: "verify.csv",
      fileSize: 1,
      uploadedByUserId: "verify-script",
      ...over,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  });
}

async function main() {
  const district = await prisma.district.findFirst({ orderBy: { createdAt: "asc" } });
  if (!district) {
    console.log("No district found — run `npm run seed:demo` first.");
    process.exit(1);
  }
  console.log(`\nDistrict: ${district.name}`);
  const db = tenantDb(district.id);

  // ---- 1. one current version per period ----
  console.log("\nExactly one current version per period");
  await inRollback(db, async (tx) => {
    const b1 = await makeBatch(tx);
    const b2 = await makeBatch(tx);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tx.datasetVersion.create({ data: { ...versionData({ batchId: b1.id }) } as any });

    let rejected = false;
    try {
      await tx.datasetVersion.create({
        // A second CURRENT v2 for the same period — must be refused.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { ...versionData({ batchId: b2.id, version: 2, isCurrent: true }) } as any,
      });
    } catch (e) {
      rejected = isUniqueViolation(e);
    }
    assert(rejected, "a second CURRENT version for the same period is rejected");
  });

  // ---- 2. a non-current sibling is fine ----
  console.log("\nSuperseded versions coexist");
  await inRollback(db, async (tx) => {
    const b1 = await makeBatch(tx);
    const b2 = await makeBatch(tx);
    await tx.datasetVersion.create({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { ...versionData({ batchId: b1.id, isCurrent: false }) } as any,
    });
    await tx.datasetVersion.create({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { ...versionData({ batchId: b2.id, version: 2, isCurrent: true }) } as any,
    });
    const n = await tx.datasetVersion.count({
      where: { fiscalYear: FY, period: 2, dataset: "REVENUE_DETAIL" },
    });
    assert(n === 2, "v1 (superseded) and v2 (current) coexist — history is retained");
  });

  // ---- 3. duplicate version numbers ----
  console.log("\nVersion numbers are unique per period");
  await inRollback(db, async (tx) => {
    const b1 = await makeBatch(tx);
    const b2 = await makeBatch(tx);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tx.datasetVersion.create({ data: { ...versionData({ batchId: b1.id }) } as any });

    let rejected = false;
    try {
      await tx.datasetVersion.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { ...versionData({ batchId: b2.id, isCurrent: false }) } as any, // same version: 1
      });
    } catch (e) {
      rejected = isUniqueViolation(e);
    }
    assert(rejected, "a duplicate version number for the same period is rejected");
  });

  // ---- 4. the annual NULL case — the reason both indexes COALESCE ----
  console.log("\nAnnual datasets (period IS NULL) — the COALESCE case");
  await inRollback(db, async (tx) => {
    const b1 = await makeBatch(tx, {
      dataset: "REVENUE_BUDGET",
      periodType: "ANNUAL",
      period: null,
    });
    const b2 = await makeBatch(tx, {
      dataset: "REVENUE_BUDGET",
      periodType: "ANNUAL",
      period: null,
    });
    await tx.datasetVersion.create({
      data: {
        ...versionData({
          batchId: b1.id,
          dataset: "REVENUE_BUDGET",
          periodType: "ANNUAL",
          period: null,
          budgetType: "ADOPTED",
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    });

    // Postgres treats every NULL as distinct, so a plain UNIQUE containing `period`
    // would happily accept this. Three of the six importers are annual, so this is
    // the case that actually bites.
    let rejectedCurrent = false;
    try {
      await tx.datasetVersion.create({
        data: {
          ...versionData({
            batchId: b2.id,
            dataset: "REVENUE_BUDGET",
            periodType: "ANNUAL",
            period: null,
            version: 2,
            isCurrent: true,
            budgetType: "ADOPTED",
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      });
    } catch (e) {
      rejectedCurrent = isUniqueViolation(e);
    }
    assert(
      rejectedCurrent,
      "a second CURRENT annual version is rejected despite period being NULL",
    );
  });

  await inRollback(db, async (tx) => {
    const b1 = await makeBatch(tx, { dataset: "REVENUE_BUDGET", periodType: "ANNUAL", period: null });
    const b2 = await makeBatch(tx, { dataset: "REVENUE_BUDGET", periodType: "ANNUAL", period: null });
    const annual = (over: Record<string, unknown>) =>
      versionData({
        dataset: "REVENUE_BUDGET",
        periodType: "ANNUAL",
        period: null,
        budgetType: "ADOPTED",
        ...over,
      });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tx.datasetVersion.create({ data: annual({ batchId: b1.id }) as any });

    let rejectedVersion = false;
    try {
      await tx.datasetVersion.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: annual({ batchId: b2.id, isCurrent: false }) as any, // same version: 1
      });
    } catch (e) {
      rejectedVersion = isUniqueViolation(e);
    }
    assert(
      rejectedVersion,
      "a duplicate annual version number is rejected despite period being NULL",
    );
  });

  // ---- 5. different periods don't collide ----
  console.log("\nDifferent periods are independent");
  await inRollback(db, async (tx) => {
    const b1 = await makeBatch(tx, { period: 2 });
    const b2 = await makeBatch(tx, { period: 3 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tx.datasetVersion.create({ data: versionData({ batchId: b1.id, period: 2 }) as any });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tx.datasetVersion.create({ data: versionData({ batchId: b2.id, period: 3 }) as any });
    const n = await tx.datasetVersion.count({ where: { fiscalYear: FY } });
    assert(n === 2, "August and September can both be current — they are different periods");
  });

  // ---- 6. tenant scoping on the new models ----
  console.log("\nTenant scoping reaches the M2 models");
  await inRollback(db, async (tx) => {
    const b = await makeBatch(tx);
    assert(b.districtId === district.id, "ImportBatch.create injected districtId");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = await tx.datasetVersion.create({ data: versionData({ batchId: b.id }) as any });
    assert(v.districtId === district.id, "DatasetVersion.create injected districtId");

    await tx.importStagingRow.createMany({
      data: [
        { batchId: b.id, rowNumber: 1, raw: { fund: "0101" } },
        { batchId: b.id, rowNumber: 2, raw: { fund: "0102" } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
    });
    const rows = await tx.importStagingRow.findMany({ where: { batchId: b.id } });
    assert(
      rows.length === 2 && rows.every((r) => r.districtId === district.id),
      "ImportStagingRow.createMany injected districtId on every row",
    );
  });

  // ---- 7. the guard still refuses upsert on the new models ----
  console.log("\nGuard rails");
  let guarded = false;
  try {
    await db.datasetVersion.upsert({
      where: { id: "nope" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: versionData({ batchId: "nope" }) as any,
      update: {},
    });
  } catch (e) {
    guarded = /is not allowed on tenant model/.test((e as Error).message);
  }
  assert(guarded, "upsert on DatasetVersion throws — commit must use deleteMany + createMany");

  // ---- 8. nothing leaked ----
  console.log("\nRollback");
  const leaked = await prisma.datasetVersion.count({
    where: { committedByUserId: "verify-script" },
  });
  assert(leaked === 0, `no verify rows persisted (found ${leaked})`);

  console.log(`\n${passed} passed, ${failed} failed\n`);
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
