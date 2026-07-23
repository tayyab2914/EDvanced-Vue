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
import { PERIOD_LABELS } from "@/lib/sample-data";

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
  // Every one of the twelve monthly periods, derived rather than listed. The old version
  // named two files by hand; at twelve, a hand-written list is how a period goes missing
  // from the sample and from every trend chart while this script still reports success.
  ...PERIOD_LABELS.flatMap((label) => [
    { file: `04-revenue-detail-FY2026-27-${label}`, slug: "revenue-detail" as const, rows: 7 },
    { file: `05-expenditure-detail-FY2026-27-${label}`, slug: "expenditure-detail" as const, rows: 20 },
    { file: `06-cash-position-FY2026-27-${label}`, slug: "cash-position" as const, rows: 3 },
  ]),
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
    // The template carries every field the district supplies; compute-only fields (the
    // Opening Fund Balance totals) are legitimately absent, so count against those.
    const expected = def.fields.filter((f) => !f.computeOnly).length;
    assert(
      m.columns.size === expected && m.unknown.length === 0,
      `${file}: all ${expected} columns match (${m.columns.size})`,
    );
  }

  // ---- the numbers are internally consistent ----
  console.log("\nThe figures hold together");
  /**
   * The cash chain, across ALL twelve months rather than one pair.
   *
   * This replaces two assertions written when the sample had two periods: one checked the
   * workbook's own worked example in August, the other that July's ending cash equalled
   * August's beginning. Both were true of a two-month file and neither would have noticed a
   * break at, say, February.
   *
   * The workbook's arithmetic is not lost — `verify:finance` still reproduces the client's
   * worked example against its own fixture, which is where an ENGINE assertion belongs.
   * What matters here is a property of the sample: every month begins where the last one
   * ended, and every month's ending cash is its own arithmetic. If either fails, the trend
   * chart, the 12-month high/low and the volatility figure are all quietly wrong.
   */
  const cashByPeriod: { raw: Record<string, unknown> }[] = [];
  for (const label of PERIOD_LABELS) {
    const parsed = await parseFile(
      DATASET_DEFS["cash-position"],
      "c.csv",
      readFileSync(join(DIR, `06-cash-position-FY2026-27-${label}.csv`)),
    );
    cashByPeriod.push(parsed.rows.filter((r) => r.raw.fundId === "1000")[0]!);
  }

  const n = (v: unknown) => Number(String(v ?? "0"));

  const footsEveryMonth = cashByPeriod.every(
    (r) =>
      Math.abs(
        n(r.raw.beginningCash) + n(r.raw.receiptsMtd) - n(r.raw.disbursementsMtd) - n(r.raw.endingCash),
      ) < 0.01,
  );
  assert(
    footsEveryMonth,
    `every one of the ${PERIOD_LABELS.length} months foots: beginning + receipts − disbursements = ending`,
  );

  const chains = cashByPeriod.every(
    (r, i) => i === 0 || Math.abs(n(r.raw.beginningCash) - n(cashByPeriod[i - 1].raw.endingCash)) < 0.01,
  );
  assert(chains, "and each month begins exactly where the previous one ended — the chain holds");

  // The story the demo is meant to tell: cash falls across the year, which is what puts
  // days-cash under policy and gives the §3.2c gauge something to point at.
  assert(
    n(cashByPeriod[cashByPeriod.length - 1].raw.endingCash) < n(cashByPeriod[0].raw.beginningCash),
    "and the district ends the year with less cash than it started — the demo's own story",
  );

  // Available Budget is supplied in the file, so the calculation layer recomputes and
  // compares it. If the generator's arithmetic disagreed with the platform's, every row
  // would raise an error — so this checks the sample won't do that.
  const exp = await parseFile(
    DATASET_DEFS["expenditure-detail"],
    "e.csv",
    readFileSync(join(DIR, "05-expenditure-detail-FY2026-27-P12-June.csv")),
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
  // The totals are the platform's to compute, so the sample file must not carry them — and
  // every row must still supply five numeric beginning components for that computation.
  assert(
    ofb.rows.every((r) => r.raw.begTotal === undefined && r.raw.pyTotal === undefined),
    "the Opening Fund Balance sample omits the computed totals",
  );
  const badComponents = ofb.rows.filter((r) =>
    ["begNonspendable", "begRestricted", "begCommitted", "begAssigned", "begUnassigned"].some(
      (c) => Number.isNaN(Number(r.raw[c])),
    ),
  );
  assert(
    badComponents.length === 0,
    "every Opening Fund Balance row supplies five numeric beginning components",
  );

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
  const projects = new Set(masterCodes("06-projects.csv"));

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
      check("projectId", projects, "project");
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
