import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { makeTenantExtension } from "@/lib/tenant-scope";
import type { TenantDb } from "@/lib/tenant-db";
import { DATASET_DEFS } from "@/lib/datasets/registry";
import { parseFile } from "@/lib/import/parse/rows";
import { matchHeaders } from "@/lib/import/parse/headers";
import type { DatasetSlug } from "@/lib/datasets/kinds";

/**
 * Checks that the sample files actually import.
 *
 * Generating a file proves nothing — a sample that fails validation is worse than none,
 * because the first thing anyone does with it is upload it. This parses every generated
 * file through the real reader and checks its headers against the real registry, in both
 * formats.
 *
 * It does NOT commit: that would need the district's master data loaded, which is the
 * README's step 1 and a human decision. What it proves is that the files are readable and
 * shaped correctly.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL }),
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

const DIR = join(process.cwd(), "public", "sample-data");

const FILES: { file: string; slug: DatasetSlug; rows: number }[] = [
  { file: "01-revenue-budget-FY2026-27", slug: "revenue-budget", rows: 7 },
  { file: "02-expenditure-budget-FY2026-27", slug: "expenditure-budget", rows: 20 },
  { file: "03-opening-fund-balance-FY2026-27", slug: "opening-fund-balance", rows: 3 },
  { file: "04-revenue-detail-FY2026-27-P1-July", slug: "revenue-detail", rows: 7 },
  { file: "05-expenditure-detail-FY2026-27-P1-July", slug: "expenditure-detail", rows: 20 },
  { file: "06-cash-position-FY2026-27-P1-July", slug: "cash-position", rows: 3 },
  { file: "04-revenue-detail-FY2026-27-P2-August", slug: "revenue-detail", rows: 7 },
  { file: "05-expenditure-detail-FY2026-27-P2-August", slug: "expenditure-detail", rows: 20 },
  { file: "06-cash-position-FY2026-27-P2-August", slug: "cash-position", rows: 3 },
];

async function main() {
  console.log("\nEvery sample file is readable, in both formats");
  for (const { file, slug, rows } of FILES) {
    const def = DATASET_DEFS[slug];

    for (const ext of ["csv", "xlsx"] as const) {
      const buf = readFileSync(join(DIR, `${file}.${ext}`));
      const parsed = await parseFile(def, `${file}.${ext}`, buf);

      const ok =
        parsed.headers.missingRequired.length === 0 &&
        parsed.headers.unknown.length === 0 &&
        parsed.rowCount === rows;

      assert(
        ok,
        `${file}.${ext} — ${parsed.rowCount}/${rows} rows` +
          (parsed.headers.missingRequired.length
            ? `, MISSING ${parsed.headers.missingRequired.map((f) => f.label).join(", ")}`
            : "") +
          (parsed.headers.unknown.length ? `, UNKNOWN ${parsed.headers.unknown.join(", ")}` : ""),
      );
    }
  }

  console.log("\nThe two formats agree");
  for (const { file, slug } of FILES) {
    const def = DATASET_DEFS[slug];
    const a = await parseFile(def, `${file}.csv`, readFileSync(join(DIR, `${file}.csv`)));
    const b = await parseFile(def, `${file}.xlsx`, readFileSync(join(DIR, `${file}.xlsx`)));
    const same =
      a.rowCount === b.rowCount &&
      a.rows.every((r, i) =>
        Object.keys(r.raw).every((k) => r.raw[k] === b.rows[i].raw[k]),
      );
    assert(same, `${file}: csv ≡ xlsx`);
  }

  console.log("\nHeaders come from the registry, so they cannot drift");
  for (const { file, slug } of FILES) {
    const def = DATASET_DEFS[slug];
    const buf = readFileSync(join(DIR, `${file}.csv`));
    const text = buf.toString("utf8").split("\n")[0].split(",");
    const m = matchHeaders(def, text);
    assert(
      m.columns.size === def.fields.length,
      `${file}: all ${def.fields.length} columns match (${m.columns.size})`,
    );
  }

  // ---- the numbers are internally consistent ----
  console.log("\nThe figures hold together");
  const cashAug = await parseFile(
    DATASET_DEFS["cash-position"],
    "c.csv",
    readFileSync(join(DIR, "06-cash-position-FY2026-27-P2-August.csv")),
  );
  const gf = cashAug.rows.find((r) => r.raw.fundId === "1000")!;
  assert(
    gf.raw.beginningCash === "72000000" &&
      gf.raw.receiptsMtd === "48500000" &&
      gf.raw.disbursementsMtd === "44200000" &&
      gf.raw.endingCash === "76300000",
    "August cash reproduces the workbook's example: 72.0 + 48.5 − 44.2 = 76.3M",
  );

  const cashJul = await parseFile(
    DATASET_DEFS["cash-position"],
    "c.csv",
    readFileSync(join(DIR, "06-cash-position-FY2026-27-P1-July.csv")),
  );
  const gfJul = cashJul.rows.find((r) => r.raw.fundId === "1000")!;
  assert(
    gfJul.raw.endingCash === gf.raw.beginningCash,
    "and July's ending cash IS August's beginning cash — the months chain",
  );

  // Available Budget is supplied in the file, so the calculation layer recomputes and
  // compares it. If the generator's arithmetic disagreed with the platform's, every row
  // would raise an error — so this checks the sample won't do that.
  const exp = await parseFile(
    DATASET_DEFS["expenditure-detail"],
    "e.csv",
    readFileSync(join(DIR, "05-expenditure-detail-FY2026-27-P2-August.csv")),
  );
  const badMath = exp.rows.filter((r) => {
    const b = Number(r.raw.budget);
    const y = Number(r.raw.actualYtd);
    const e = Number(r.raw.encumbrances);
    return Number(r.raw.availableBudget) !== b - y - e;
  });
  assert(
    badMath.length === 0,
    `every Available Budget equals Budget − Actual YTD − Encumbrances (${badMath.length} wrong)`,
  );

  const ofb = await parseFile(
    DATASET_DEFS["opening-fund-balance"],
    "o.csv",
    readFileSync(join(DIR, "03-opening-fund-balance-FY2026-27.csv")),
  );
  const badTotals = ofb.rows.filter((r) => {
    const sum =
      Number(r.raw.begNonspendable) +
      Number(r.raw.begRestricted) +
      Number(r.raw.begCommitted) +
      Number(r.raw.begAssigned) +
      Number(r.raw.begUnassigned);
    return sum !== Number(r.raw.begTotal);
  });
  assert(badTotals.length === 0, "every Beginning Total is the sum of its five components");

  // ---- every code the files reference is in the master-data files ----
  console.log("\nEvery code the files use exists in the master data beside them");
  const masterCodes = (file: string, col = 0) =>
    new Set(
      readFileSync(join(DIR, "master-data", file), "utf8")
        .split("\n")
        .slice(1)
        .filter(Boolean)
        .map((l) => l.split(",")[col].trim()),
    );

  const funds = masterCodes("01-funds.csv");
  const sources = masterCodes("02-revenue-sources.csv");
  const functions = masterCodes("03-functions.csv");
  const objects = masterCodes("04-objects.csv");
  const centers = masterCodes("05-cost-centers.csv");
  const grants = masterCodes("06-grants.csv");
  const projects = masterCodes("07-capital-projects.csv");
  const projectsOrGrants = new Set([...grants, ...projects]);

  const dangling: string[] = [];
  for (const { file, slug } of FILES) {
    const def = DATASET_DEFS[slug];
    const parsed = await parseFile(def, `${file}.csv`, readFileSync(join(DIR, `${file}.csv`)));
    for (const row of parsed.rows) {
      const check = (field: string, set: Set<string>, what: string) => {
        const v = row.raw[field];
        if (v && !set.has(v)) dangling.push(`${file} row ${row.rowNumber}: ${what} "${v}"`);
      };
      check("fundId", funds, "fund");
      check("revenueSourceId", sources, "revenue source");
      check("functionId", functions, "function");
      check("objectId", objects, "object");
      check("costCenterId", centers, "cost center");
      check("projectOrGrant", projectsOrGrants, "project/grant");
    }
  }
  assert(
    dangling.length === 0,
    `no dangling references${dangling.length ? ` (${dangling.slice(0, 3).join("; ")}${dangling.length > 3 ? `, +${dangling.length - 3} more` : ""})` : ""}`,
  );

  // ---- the status the opening balance names must be a real one ----
  const statuses = new Set((await prisma.status.findMany({ select: { name: true } })).map((s) => s.name));
  const badStatus = ofb.rows.filter((r) => r.raw.statusId && !statuses.has(r.raw.statusId));
  assert(
    badStatus.length === 0,
    `the Status column uses a name from the platform's own list (${[...new Set(ofb.rows.map((r) => r.raw.statusId))].join(", ")})`,
  );

  // ---- the district can actually receive this ----
  console.log("\nThe demo district");
  const district = await prisma.district.findFirst({ orderBy: { createdAt: "asc" } });
  if (district) {
    const db = tenantDb(district.id);
    assert(
      district.fiscalYearStartMonth === 7,
      `${district.name} starts its year in month ${district.fiscalYearStartMonth} — July, so P1=July and P2=August as the filenames say`,
    );
    const funds = await db.fund.count();
    if (funds === 0) {
      console.log(
        `  ℹ ${district.name} has no master data yet — import public/sample-data/master-data first, or every row will (correctly) fail referential validation.`,
      );
    } else {
      console.log(`  ℹ ${district.name} already has ${funds} funds.`);
    }
  }

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
