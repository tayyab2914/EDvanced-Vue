import "dotenv/config";
import ExcelJS from "exceljs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { makeTenantExtension } from "@/lib/tenant-scope";
import type { TenantDb } from "@/lib/tenant-db";
import { DATASET_DEFS } from "@/lib/datasets/registry";
import { parseFile, formatOf, UnsupportedFileError } from "@/lib/import/parse/rows";
import { matchHeaders, normalizeHeader, suggestFor } from "@/lib/import/parse/headers";
import { coerceCell, excelSerialToISO, isExcelSerial } from "@/lib/import/parse/values";
import { loadResolveMaps, resolveCode, resolveProjectOrGrant } from "@/lib/import/resolve";
import { readStagedRows, stageRows } from "@/lib/import/stage";

/**
 * Checks the ingestion path: both formats produce the same rows, Excel's damage is
 * survivable, and staged rows come back as they went in.
 *
 * The pure parts need no database. The resolution and staging parts do, and run inside a
 * transaction that is always rolled back.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  }),
});
// Typed as the app's TenantDb, not this script's local client: lib/db.ts configures
// `log`, which makes its PrismaClient a different generic instantiation, and the import
// helpers are written against the real one.
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

const ROLLBACK = "__verify_rollback__";
const def = DATASET_DEFS["revenue-detail"];

// ===================== Fixtures =====================
// Built in memory rather than committed as binaries: a checked-in .xlsx is opaque in a
// diff, and nobody would notice it drifting from the registry.

const HEADERS = [
  "Fund Code",
  "Revenue Source / Object Code",
  "Project / Grant",
  "School / Cost Center",
  "Budget",
  "Actual MTD",
  "Actual YTD",
];

/** The same three rows, as a district would send them. */
const ROWS = [
  ["0101", "3310", "TITLE-I", "0001", "1000000", "80000", "500000"],
  ["0102", "3310", "TITLE-I", "", "250000", "20000", "125000"],
  ["0101", "3399", "PROJ-A", "0001", "50000", "0", "0"],
];

function csvFixture(): string {
  return [HEADERS, ...ROWS].map((r) => r.join(",")).join("\n");
}

/**
 * The same data, but written the way a real ERP export does it — and that is the point.
 *
 * Row 1 writes the fund as TEXT, so "0101" survives. Row 2 writes it as a NUMBER, which
 * is what an ERP does by default, and Excel stores 102 — the leading zero is gone from
 * the file itself, before we ever open it. No read mode recovers it.
 */
async function xlsxFixture(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow(HEADERS);
  ws.addRow(["0101", "3310", "TITLE-I", "0001", 1000000, 80000, 500000]); // fund as text
  ws.addRow([102, "3310", "TITLE-I", null, 250000, 20000, 125000]); // fund as NUMBER
  ws.addRow(["0101", "3399", "PROJ-A", "0001", 50000, 0, 0]);
  ws.addRow([]); // a trailing blank row, as districts leave behind
  // ExcelJS returns its own Buffer type, not Node's.
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * The tenant extension injects districtId at runtime, but the client is typed as the
 * base one, so TypeScript still demands it. The app has the same tension and answers it
 * the same way — see AnyDelegate in app/actions/master-data.ts.
 */
// The trailing comma in <T,> is required: in a .mts file a bare <T> reads as JSX.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const scoped = <T,>(rows: T[]): any => rows as any;

async function main() {
  // ---- format detection ----
  console.log("\nFormat detection");
  assert(formatOf("revenue.csv") === "csv", "recognises .csv");
  assert(formatOf("Revenue Detail.XLSX") === "xlsx", "recognises .xlsx, case-insensitively");
  let xlsMsg = "";
  try {
    formatOf("old.xls");
  } catch (e) {
    xlsMsg = (e as Error).message;
  }
  assert(/Save As/.test(xlsMsg), ".xls is refused with instructions, not a stack trace");
  let badMsg = false;
  try {
    formatOf("notes.pdf");
  } catch (e) {
    badMsg = e instanceof UnsupportedFileError && /\.xlsx or \.csv/.test((e as Error).message);
  }
  assert(badMsg, "an unsupported type names what IS supported");

  // ---- headers ----
  console.log("\nHeader matching");
  assert(normalizeHeader("  Revenue Source / Object Code ") === "revenue source object code", "normalises case, space and punctuation");
  assert(
    normalizeHeader("Revenue_Source_Object_Code") === normalizeHeader("Revenue Source / Object Code"),
    "underscores and slashes are the same column",
  );

  const m = matchHeaders(def, HEADERS);
  assert(m.columns.size === 7, "matches all seven columns");
  assert(m.missingRequired.length === 0, "nothing required is missing");
  assert(m.unknown.length === 0, "no unknown columns");

  // The client's OTHER label for the same column, from the annual sheet.
  const aliased = matchHeaders(def, [
    "Fund Code",
    "Revenue Object / Source Code",
    "Project / Grant",
    "Budget",
    "Actual MTD",
    "Actual YTD",
  ]);
  assert(aliased.columns.has("revenueSourceId"), "the workbook's other revenue-source header also matches");
  assert(
    aliased.missingRecommended.length === 0 && aliased.missingRequired.length === 0,
    "an optional column may simply be absent",
  );

  const broken = matchHeaders(def, ["Fund Code", "YTD Revenue", "Project / Grant"]);
  assert(broken.missingRequired.some((f) => f.name === "actualYtd"), "a renamed required column is reported missing");
  assert(broken.unknown.includes("YTD Revenue"), "the unrecognised column is reported too");
  assert(
    suggestFor("YTD Revenue", broken.missingRequired) === "Actual YTD",
    "and we suggest what it probably meant",
  );

  // ---- excel serials ----
  console.log("\nExcel serial dates");
  assert(isExcelSerial(46234), "46234 is in serial range");
  assert(!isExcelSerial(0), "0 is not");
  assert(!isExcelSerial(9_999_999), "an absurd number is not");
  // Real pairs, checked against Excel's own numbering — not invented to match the code.
  assert(excelSerialToISO(46234) === "2026-07-31", "the spec's example serial 46234 is 31 Jul 2026");
  assert(excelSerialToISO(46204) === "2026-07-01", "46204 is 1 Jul 2026 — the start of FY2026-27");
  assert(excelSerialToISO(45292) === "2024-01-01", "45292 is 1 Jan 2024");
  assert(excelSerialToISO(61) === "1900-03-01", "serial 61 is 1 Mar 1900 — past Excel's phantom leap day");
  assert(coerceCell(46234, "date") === "2026-07-31", "a numeric date cell is converted");
  assert(coerceCell("46234", "date") === "2026-07-31", "a serial from CSV is converted too");
  assert(coerceCell("2026-07-01", "date") === "2026-07-01", "a real date is left alone");
  assert(coerceCell(new Date(Date.UTC(2026, 6, 1)), "date") === "2026-07-01", "a Date object is normalised");
  // A serial in a code column must NOT be date-converted — only `date` fields are.
  assert(coerceCell(46234, "code") === "46234", "only date fields are serial-converted");
  assert(coerceCell(101, "code") === "101", "a numeric code keeps its digits (the zero is already gone)");
  assert(coerceCell({ result: 1234 }, "amount") === "1234", "a formula cell reads its cached result");
  assert(coerceCell({ error: "#REF!" }, "amount") === "#REF!", "an error cell surfaces its error text");
  assert(coerceCell(null, "text") === "", "a blank cell is an empty string");

  // ---- csv === xlsx ----
  console.log("\nBoth formats produce the same rows");
  const fromCsv = await parseFile(def, "rev.csv", Buffer.from(csvFixture(), "utf8"));
  const fromXlsx = await parseFile(def, "rev.xlsx", await xlsxFixture());

  assert(fromCsv.rowCount === 3, `csv read 3 rows (got ${fromCsv.rowCount})`);
  assert(fromXlsx.rowCount === 3, `xlsx read 3 rows, ignoring the trailing blank (got ${fromXlsx.rowCount})`);
  assert(
    fromCsv.rows[0].rowNumber === 2 && fromXlsx.rows[0].rowNumber === 2,
    "both number the first data row as 2 — what the district sees in Excel",
  );

  // Every column EXCEPT the deliberately damaged fund must be identical.
  const sameExceptFund = fromCsv.rows.every((r, i) => {
    const x = fromXlsx.rows[i].raw;
    return (Object.keys(r.raw) as string[])
      .filter((k) => k !== "fundId")
      .every((k) => r.raw[k] === x[k]);
  });
  assert(sameExceptFund, "csv and xlsx agree on every column that Excel did not damage");
  assert(
    fromCsv.rows[0].raw.budget === "1000000" && fromXlsx.rows[0].raw.budget === "1000000",
    "a number typed as text and a real number read the same",
  );
  assert(fromCsv.rows[1].raw.costCenterId === "" && fromXlsx.rows[1].raw.costCenterId === "", "a blank optional cell is empty in both");

  // The damage, stated plainly.
  assert(fromCsv.rows[1].raw.fundId === "0102", "csv preserved the leading zero: 0102");
  assert(
    fromXlsx.rows[1].raw.fundId === "102",
    "xlsx LOST it: the numeric cell holds 102 — this is why reading 'as text' cannot fix it",
  );

  // ---- resolution, incl. the recovery ----
  const district = await prisma.district.findFirst({ orderBy: { createdAt: "asc" } });
  if (!district) {
    console.log("\nNo district found — run `npm run seed:demo` first.");
    process.exit(1);
  }
  console.log(`\nCode resolution (district: ${district.name})`);
  const db = tenantDb(district.id);

  try {
    await db.$transaction(async (tx) => {
      const t = tx as typeof db;
      await t.fund.createMany({
        data: scoped([
          { code: "0101", name: "General Fund" },
          { code: "0102", name: "Special Revenue" },
          { code: "900", name: "Ambiguity Bait" }, // strips to "900"
          { code: "0900", name: "Also Strips To 900" }, // ...as does this
        ]),
      });
      await t.grant.createMany({ data: scoped([{ grantId: "TITLE-I", name: "Title I" }]) });
      await t.capitalProject.createMany({ data: scoped([{ projectId: "PROJ-A", name: "Roof" }]) });

      const maps = await loadResolveMaps(t);

      const exact = resolveCode(maps, "fund", "0101");
      assert(exact.ok, "an exact code resolves");
      assert(exact.ok && !exact.recovered, "and is not reported as recovered");

      // The whole point: Excel ate the zero, master data puts it back.
      const recovered = resolveCode(maps, "fund", "102");
      assert(recovered.ok, "a fund whose leading zero Excel ate still resolves");
      assert(recovered.ok && recovered.recovered === "0102", "and reports the canonical code it matched");
      assert(
        exact.ok && recovered.ok && resolveCode(maps, "fund", "0102").ok &&
          recovered.id === (resolveCode(maps, "fund", "0102") as { id: string }).id,
        "the damaged and undamaged codes resolve to the SAME fund",
      );

      assert(resolveCode(maps, "fund", "9999").ok === false, "an unknown code does not resolve");
      const unknown = resolveCode(maps, "fund", "9999");
      assert(!unknown.ok && unknown.reason === "unknown", "and says why");

      // Two real codes that strip to the same thing must not be guessed between.
      const ambiguous = resolveCode(maps, "fund", "900");
      assert(ambiguous.ok, "an exact match wins even when stripping would be ambiguous");
      const forced = resolveCode(maps, "fund", "00900");
      assert(!forced.ok && forced.reason === "ambiguous", "but a code that only strips to two candidates is refused, not guessed");

      assert(resolveCode(maps, "fund", "0101").ok, "codes are matched case- and space-insensitively");
      assert(resolveCode(maps, "fund", " 0101 ").ok, "surrounding whitespace is tolerated");

      // The single Project / Grant column resolves against both tables.
      const asGrant = resolveProjectOrGrant(maps, "TITLE-I");
      assert(asGrant.ok && asGrant.grantId !== undefined, "Project / Grant resolves a grant");
      const asProject = resolveProjectOrGrant(maps, "PROJ-A");
      assert(asProject.ok && asProject.capitalProjectId !== undefined, "Project / Grant resolves a capital project");
      const neither = resolveProjectOrGrant(maps, "NOPE");
      assert(!neither.ok && neither.reason === "unknown", "and refuses a value that is neither");

      await t.capitalProject.createMany({ data: scoped([{ projectId: "TITLE-I", name: "Name Clash" }]) });
      const clash = resolveProjectOrGrant(await loadResolveMaps(t), "TITLE-I");
      assert(
        !clash.ok && clash.reason === "ambiguous",
        "a code that is BOTH a grant and a project is refused — guessing would file money against the wrong thing",
      );

      // ---- staging ----
      console.log("\nStaging");
      const batch = await t.importBatch.create({
        data: {
          dataset: "REVENUE_DETAIL",
          fiscalYear: "2026-27",
          periodType: "MONTHLY",
          period: 2,
          fileName: "rev.csv",
          fileSize: 123,
          uploadedByUserId: "verify-script",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      });

      const written = await stageRows(t, batch.id, fromCsv.rows);
      assert(written === 3, `staged all 3 rows (got ${written})`);

      const back = await readStagedRows(t, batch.id);
      assert(back.length === 3, "reads them back");
      assert(
        back.every((r, i) => r.rowNumber === fromCsv.rows[i].rowNumber),
        "in file order — the order the report must list them in",
      );
      // Compared key by key, NOT as stringified JSON: the column is jsonb, and jsonb
      // normalises key order on the way in. The values are what matter; the order they
      // are stored in is Postgres's business.
      const sent = fromCsv.rows[0].raw;
      const stored = back[0].raw;
      assert(
        Object.keys(sent).length === Object.keys(stored).length &&
          Object.keys(sent).every((k) => sent[k] === stored[k]),
        "every value survives the round trip — what went in is what comes out",
      );
      assert(back[1].raw.fundId === "0102", "the district's own value is preserved for the report to quote");

      throw new Error(ROLLBACK);
    });
  } catch (e) {
    if ((e as Error).message !== ROLLBACK) throw e;
  }

  console.log("\nRollback");
  const leaked = await prisma.importBatch.count({ where: { uploadedByUserId: "verify-script" } });
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
