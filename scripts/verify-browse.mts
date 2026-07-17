import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { makeTenantExtension } from "@/lib/tenant-scope";
import type { TenantDb } from "@/lib/tenant-db";
import {
  browse,
  browseAll,
  browseColumns,
  browseInclude,
  cellOf,
  nameOf,
  PAGE_SIZE,
} from "@/lib/datasets/browse";
import { DATASET_SLUGS, DATASETS, type DatasetSlug } from "@/lib/datasets/kinds";
import { datasetDef } from "@/lib/datasets/registry";

const kindOf = (slug: DatasetSlug) => DATASETS[slug].kind;

/**
 * Checks server-side browse: paging, sorting, searching and export over committed rows.
 *
 * The point of this module is that it does NOT load everything into memory, so the test
 * builds a dataset big enough that doing so would be obvious, and asserts on what the
 * database returns rather than on what a browser would have filtered.
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
const FY = "2097-98";
const PERIOD = 3;
const USER = "verify-browse-script";
const ROWS = 2_500;

async function main() {
  // ---- columns, derived from the registry ----
  console.log("\nColumns come from the registry");
  for (const slug of DATASET_SLUGS) {
    const cols = browseColumns(slug);
    const def = datasetDef(slug);
    assert(
      cols.length === def.fields.length,
      `${slug}: a column per field (${cols.length}/${def.fields.length})`,
    );
  }
  const expCols = browseColumns("expenditure-detail");
  assert(
    expCols.find((c) => c.key === "fundId")?.relation === "fund",
    "a code column knows its relation, so it can sort by the code and not the id",
  );
  assert(
    expCols.find((c) => c.key === "projectOrGrant")?.relation === undefined,
    "Project / Grant has no single relation — it fanned out into two ids",
  );
  assert(
    expCols.find((c) => c.key === "availableBudget")?.type === "amount",
    "a calculated field is still a browsable column",
  );

  const inc = browseInclude("expenditure-detail") as Record<string, unknown>;
  assert(
    "fund" in inc && "function" in inc && "object" in inc,
    "the include pulls every relation in one query, not one per row",
  );
  assert("grant" in inc && "capitalProject" in inc, "and both halves of Project / Grant");

  // ---- against the database ----
  const district = await prisma.district.findFirst({ orderBy: { createdAt: "asc" } });
  if (!district) {
    console.log("No district found — run `npm run seed:demo` first.");
    process.exit(1);
  }
  console.log(`\nDistrict: ${district.name}`);
  const db = tenantDb(district.id);

  await cleanup(district.id);
  const seed = await seedRows(db, district.id);

  try {
    console.log(`\nPaging over ${ROWS.toLocaleString()} rows`);
    const first = await browse(db, { slug: "expenditure-detail", versionId: seed.versionId });
    assert(first.total === ROWS, `counts every row (${first.total})`);
    assert(first.rows.length === PAGE_SIZE, `returns one page of ${PAGE_SIZE}, not ${ROWS}`);
    assert(first.pageCount === Math.ceil(ROWS / PAGE_SIZE), `${first.pageCount} pages`);
    assert(first.page === 1, "page 1 by default");

    const second = await browse(db, {
      slug: "expenditure-detail",
      versionId: seed.versionId,
      page: 2,
    });
    assert(second.rows.length === PAGE_SIZE, "page 2 returns a full page");
    assert(
      String(second.rows[0].id) !== String(first.rows[0].id),
      "and different rows to page 1",
    );

    const last = await browse(db, {
      slug: "expenditure-detail",
      versionId: seed.versionId,
      page: 9_999,
    });
    assert(
      last.page === last.pageCount,
      "asking past the end lands on the last page rather than an empty one",
    );

    console.log("\nSorting happens in the database");
    const asc = await browse(db, {
      slug: "expenditure-detail",
      versionId: seed.versionId,
      sort: "actualYtd",
      dir: "asc",
    });
    const desc = await browse(db, {
      slug: "expenditure-detail",
      versionId: seed.versionId,
      sort: "actualYtd",
      dir: "desc",
    });
    const lowest = Number(asc.rows[0].actualYtd);
    const highest = Number(desc.rows[0].actualYtd);
    assert(highest > lowest, "descending starts where ascending ends");
    // The row with the largest value is on page 1 descending — which it could not be if
    // sorting happened after paging.
    assert(highest === seed.maxYtd, `the true maximum (${highest}) is on page 1 descending`);
    assert(lowest === seed.minYtd, `and the true minimum (${lowest}) on page 1 ascending`);

    const byCode = await browse(db, {
      slug: "expenditure-detail",
      versionId: seed.versionId,
      sort: "fundId",
      dir: "asc",
    });
    // Sorting a code column by its ID would order by cuid — effectively random.
    const codes = byCode.rows.map((r) => (r.fund as { code: string }).code);
    assert(
      codes.every((c, i) => i === 0 || codes[i - 1] <= c),
      "a code column sorts by the CODE, not by the id behind it",
    );

    console.log("\nSearching happens in the database");
    const hit = await browse(db, {
      slug: "expenditure-detail",
      versionId: seed.versionId,
      q: "BRW-F2",
    });
    assert(hit.total > 0 && hit.total < ROWS, `search narrows the set (${hit.total} of ${ROWS})`);
    assert(
      hit.rows.every((r) => (r.fund as { code: string }).code === "BRW-F2"),
      "and every row matches",
    );
    const byName = await browse(db, {
      slug: "expenditure-detail",
      versionId: seed.versionId,
      q: "Second Fund",
    });
    assert(byName.total === hit.total, "a code's NAME finds the same rows — districts search either");
    const miss = await browse(db, {
      slug: "expenditure-detail",
      versionId: seed.versionId,
      q: "nothing-matches-this",
    });
    assert(miss.total === 0 && miss.rows.length === 0, "no match returns nothing, not everything");

    console.log("\nCells render the district's own codes");
    const cols = browseColumns("expenditure-detail");
    const row = first.rows[0];
    const fundCol = cols.find((c) => c.key === "fundId")!;
    assert(/^BRW-F/.test(cellOf("expenditure-detail", row, fundCol)), "a code column shows the code");
    assert(
      (nameOf("expenditure-detail", row, fundCol) ?? "").length > 0,
      "and carries the name for the tooltip",
    );
    const projCol = cols.find((c) => c.key === "projectOrGrant")!;
    assert(
      cellOf("expenditure-detail", row, projCol) === "BRW-P1",
      "Project / Grant renders as one column again, whichever id it became",
    );
    const availCol = cols.find((c) => c.key === "availableBudget")!;
    assert(
      cellOf("expenditure-detail", row, availCol).includes("."),
      "an amount renders at cent precision",
    );

    console.log("\nExport");
    const all = await browseAll(db, { slug: "expenditure-detail", versionId: seed.versionId });
    assert(all.length === ROWS, `the export returns every row (${all.length}), not one page`);

    const filtered = await browseAll(db, {
      slug: "expenditure-detail",
      versionId: seed.versionId,
      q: "BRW-F2",
    });
    assert(
      filtered.length === hit.total,
      "and the export honours the search — the file matches the screen",
    );

    const sortedExport = await browseAll(db, {
      slug: "expenditure-detail",
      versionId: seed.versionId,
      sort: "actualYtd",
      dir: "desc",
    });
    assert(
      Number(sortedExport[0].actualYtd) === seed.maxYtd,
      "and the sort — you export exactly what you are looking at",
    );

    console.log("\nVersion isolation");
    const otherVersion = await browse(db, {
      slug: "expenditure-detail",
      versionId: seed.otherVersionId,
    });
    assert(
      otherVersion.total === 1,
      "a different version returns only its own rows — browsing shows one answer, not two",
    );

    // Prisma refuses `nulls: "last"` on a required column, and the client exposes no DMMF
    // to ask which are nullable — so browse.ts infers it from the registry's
    // requiredness. This is what proves the inference: every column of every dataset,
    // both directions. A field that turns nullable without its requiredness changing
    // fails here rather than on a district's ledger.
    console.log("\nEvery column of every dataset can be sorted");
    let sortFailure: string | null = null;
    for (const slug of DATASET_SLUGS) {
      const v = await db.datasetVersion.findFirst({
        where: { dataset: kindOf(slug), fiscalYear: FY },
      });
      for (const col of browseColumns(slug)) {
        for (const d of ["asc", "desc"] as const) {
          try {
            await browse(db, {
              slug,
              // A version that holds no rows still exercises the ORDER BY: Postgres
              // validates the clause before it discovers there is nothing to order.
              versionId: v?.id ?? seed.versionId,
              sort: col.key,
              dir: d,
              pageSize: 1,
            });
          } catch (e) {
            sortFailure = `${slug}.${col.key} ${d}: ${(e as Error).message.split("\n")[0]}`;
          }
        }
      }
    }
    assert(sortFailure === null, `every column sorts in both directions${sortFailure ? ` (${sortFailure})` : ""}`);
  } finally {
    await cleanup(district.id);
    await teardown();
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
}

async function seedRows(db: TenantDb, districtId: string) {
  await db.fund.createMany({
    data: scoped([
      { code: "BRW-F1", name: "First Fund" },
      { code: "BRW-F2", name: "Second Fund" },
    ]),
  });
  await db.accountFunction.createMany({ data: scoped([{ code: "BRW-FN1", name: "Instruction" }]) });
  await db.accountObject.createMany({ data: scoped([{ code: "BRW-O1", name: "Salaries" }]) });
  await db.capitalProject.createMany({ data: scoped([{ projectId: "BRW-P1", name: "Project" }]) });

  const [f1, f2] = await Promise.all([
    db.fund.findFirst({ where: { code: "BRW-F1" } }),
    db.fund.findFirst({ where: { code: "BRW-F2" } }),
  ]);
  const fn = await db.accountFunction.findFirst({ where: { code: "BRW-FN1" } });
  const ob = await db.accountObject.findFirst({ where: { code: "BRW-O1" } });
  const pj = await db.capitalProject.findFirst({ where: { projectId: "BRW-P1" } });

  const mkVersion = async (period: number) => {
    const batch = await db.importBatch.create({
      data: scoped([
        {
          dataset: "EXPENDITURE_DETAIL",
          fiscalYear: FY,
          periodType: "MONTHLY",
          period,
          fileName: "seed.csv",
          fileSize: 1,
          uploadedByUserId: USER,
          status: "COMMITTED",
        },
      ])[0],
    });
    const v = await db.datasetVersion.create({
      data: scoped([
        {
          dataset: "EXPENDITURE_DETAIL",
          fiscalYear: FY,
          periodType: "MONTHLY",
          period,
          version: 1,
          isCurrent: true,
          action: "INITIAL",
          batchId: batch.id,
          rowCount: 0,
          errorCount: 0,
          warningCount: 0,
          fileName: "seed.csv",
          committedByUserId: USER,
        },
      ])[0],
    });
    return v.id;
  };

  const versionId = await mkVersion(PERIOD);
  const otherVersionId = await mkVersion(PERIOD + 1);

  // Enough rows that returning them all would be conspicuous. Cost centre is null, so the
  // grain stays unique on (fund, function, object, project) — which it would not, so the
  // rows differ only by amount, which is all this test needs.
  let minYtd = Infinity;
  let maxYtd = -Infinity;
  const rows = Array.from({ length: ROWS }, (_, i) => {
    const ytd = 1000 + i;
    minYtd = Math.min(minYtd, ytd);
    maxYtd = Math.max(maxYtd, ytd);
    return {
      districtId,
      versionId,
      fiscalYear: FY,
      period: PERIOD,
      fundId: i % 3 === 0 ? f2!.id : f1!.id,
      functionId: fn!.id,
      objectId: ob!.id,
      capitalProjectId: pj!.id,
      budget: "100000",
      actualMtd: "0",
      actualYtd: String(ytd),
      encumbrances: "0",
      availableBudget: String(100000 - ytd),
    };
  });

  for (let i = 0; i < rows.length; i += 1000) {
    await db.expenditureActual.createMany({ data: scoped(rows.slice(i, i + 1000)) });
  }
  await db.expenditureActual.createMany({
    data: scoped([{ ...rows[0], versionId: otherVersionId }]),
  });

  return { versionId, otherVersionId, minYtd, maxYtd };
}

async function cleanup(districtId: string) {
  const db = tenantDb(districtId);
  const versions = await db.datasetVersion.findMany({
    where: { fiscalYear: FY },
    select: { id: true },
  });
  await db.expenditureActual.deleteMany({
    where: { versionId: { in: versions.map((v) => v.id) } },
  });
  await db.datasetVersion.deleteMany({ where: { fiscalYear: FY } });
  await db.importBatch.deleteMany({ where: { fiscalYear: FY } });
}

async function teardown() {
  await prisma.capitalProject.deleteMany({ where: { projectId: { startsWith: "BRW-" } } });
  await prisma.accountObject.deleteMany({ where: { code: { startsWith: "BRW-" } } });
  await prisma.accountFunction.deleteMany({ where: { code: { startsWith: "BRW-" } } });
  await prisma.fund.deleteMany({ where: { code: { startsWith: "BRW-" } } });
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
