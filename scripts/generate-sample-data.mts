import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { csvEscape } from "@/lib/csv";
import { PERIOD_LABELS, SAMPLE_PERIODS } from "@/lib/sample-data";
import { DATASET_DEFS } from "@/lib/datasets/registry";
import { templateHeaders } from "@/lib/datasets/registry";
import type { DatasetSlug } from "@/lib/datasets/kinds";

/**
 * Generates the sample files under public/sample-data.
 *
 * A generator rather than hand-written CSVs, for three reasons:
 *
 *   1. Headers come from the registry, so a sample file cannot drift from the importer
 *      that reads it. Hand-written fixtures rot the first time a label changes.
 *   2. The numbers are computed, so they stay internally consistent — the cash chains
 *      month to month, the budget matches the detail, the reserve percentage is a real
 *      division rather than a number someone typed.
 *   3. Both formats come from one source, so the .csv and the .xlsx cannot disagree.
 *
 * Run: npm run sample:data
 *
 * THE DATA IS ILLUSTRATIVE. The account codes are shaped like Florida's chart of accounts
 * and the expenditure categories match the client's workbook, but the figures are
 * invented for a demonstration and are not any real district's.
 */

const OUT = join(process.cwd(), "public", "sample-data");

// ===================== master data =====================
// Uploaded first, under Master data. Nothing else resolves without it: every code in
// every file below has to exist here, or validation refuses the row — correctly.

const FUNDS = [
  ["1000", "General Fund", "General"],
  ["2100", "Debt Service Fund", "Debt Service"],
  ["3200", "Capital Projects Fund", "Capital Projects"],
  ["4100", "Food Service Fund", "Special Revenue"],
];

// Revenue "sources" ARE object codes in the client's workbook — which is what lets the
// engine tell a transfer from earned revenue without a new column. 3600 and 3730 below
// are exactly the codes the platform console classifies.
const REVENUE_SOURCES = [
  ["3310", "Florida Education Finance Program", "Revenues from State Sources"],
  ["3355", "Class Size Reduction", "Revenues from State Sources"],
  ["1110", "Ad Valorem Taxes", "Revenues from Local Sources"],
  ["1310", "Food Service Sales", "Revenues from Local Sources"],
  ["3202", "Title I Part A", "Federal Through State and Local"],
  ["3600", "Transfers In", "Transfers"],
  ["3730", "Sale of Capital Assets", "Other Financing Sources"],
];

// Function Types is deliberately short in the platform — the M1 README calls it "a
// representative starter set... intentionally short pending the client's full list" — so
// these map onto the three that exist rather than inventing categories.
const FUNCTIONS = [
  ["5000", "Instruction", "Instruction"],
  ["6100", "Pupil Personnel Services", "Student and Instructional Support Services"],
  ["6200", "Instructional Media Services", "Instructional Media Services"],
  ["6300", "Instructional Staff Training", "Student and Instructional Support Services"],
  ["7300", "School Administration", "Student and Instructional Support Services"],
];

// These map one-to-one onto the workbook's own expenditure categories, which is what lets
// the forecast roll actuals up by the same category a district types an assumption
// against. 9700 is the transfer out.
const OBJECTS = [
  ["100", "Salaries", "Salaries"],
  ["200", "Employee Benefits", "Employee Benefits"],
  ["300", "Purchased Services", "Purchased Services"],
  ["400", "Energy Services", "Energy Services"],
  ["500", "Materials and Supplies", "Materials and Supplies"],
  ["600", "Capital Outlay", "Capital Outlay"],
  ["700", "Other Expenses", "Other"],
  ["9700", "Transfers Out", "Other"],
];

// Leading zeros on purpose: this is the column an ERP exports as a number, and it is what
// the importer's leading-zero recovery exists for.
const COST_CENTERS = [
  ["0011", "Demo High School", "School", "High"],
  ["0021", "Demo Elementary", "School", "Elementary"],
  ["0031", "Demo Middle School", "School", "Middle"],
  ["9001", "District Office", "Department", "Administration"],
  ["9002", "Transportation", "Operations", "Transportation"],
];

// The unified Projects master (MVP): just Project Number and Project Name. What used to
// be split across Grants and Capital Projects now lives in one list — the first two rows
// were grants, the next two capital projects — because a detail row tags one Project
// regardless of which V2 module will later claim it.
const PROJECTS = [
  ["TITLE-I-2627", "Title I Part A"],
  ["IDEA-B-2627", "IDEA Part B"],
  ["PECO-2627", "PECO Maintenance"],
  ["ROOF-0021", "Demo Elementary roof replacement"],
  // The workbook marks Project / Grant as REQUIRED on both detail imports, but most of a
  // district's money — FEFP, ad valorem, salaries — belongs to no project. This shared
  // "no project" row is what keeps the sample importable while that column stays required.
  ["GENERAL", "General operations (no project)"],
];

// ===================== the annual budget =====================
// Adopted. Sized so the General Fund roughly balances at ~$198M, and so the categories
// echo the workbook's own example table (Salaries & Benefits $150M, Purchased Services
// $18M, Energy $8.5M, and so on).

type Row = (string | number)[];

const REVENUE_BUDGET: Row[] = [
  // fund, source, cost centre, project, amount
  ["1000", "3310", "", "", 120_000_000],
  ["1000", "3355", "", "", 15_000_000],
  ["1000", "1110", "", "", 60_000_000],
  ["1000", "3202", "", "TITLE-I-2627", 2_400_000],
  ["1000", "3600", "", "", 1_000_000], // transfer in
  ["4100", "1310", "", "", 6_500_000],
  ["3200", "3730", "", "PECO-2627", 4_000_000], // other financing source
];

const EXPENDITURE_BUDGET: Row[] = [
  // fund, function, object, cost centre, project, amount
  ["1000", "5000", "100", "0011", "", 42_000_000],
  ["1000", "5000", "100", "0021", "", 31_000_000],
  ["1000", "5000", "100", "0031", "", 22_000_000],
  ["1000", "5000", "200", "0011", "", 13_500_000],
  ["1000", "5000", "200", "0021", "", 10_000_000],
  ["1000", "5000", "200", "0031", "", 7_000_000],
  ["1000", "6100", "100", "9001", "", 12_000_000],
  ["1000", "6100", "200", "9001", "", 4_000_000],
  ["1000", "7300", "100", "9001", "", 6_500_000],
  ["1000", "7300", "200", "9001", "", 2_000_000],
  ["1000", "5000", "300", "0011", "", 4_000_000],
  ["1000", "7300", "300", "9001", "", 14_000_000],
  ["1000", "7300", "400", "9002", "", 8_500_000], // energy
  ["1000", "5000", "500", "0011", "", 3_200_000],
  ["1000", "6200", "500", "0021", "", 4_000_000],
  ["1000", "5000", "600", "0011", "", 7_200_000], // capital outlay
  ["1000", "6300", "700", "9001", "", 5_200_000],
  ["1000", "7300", "9700", "9001", "", 2_000_000], // transfer out
  ["4100", "7300", "500", "9001", "", 6_400_000],
  ["3200", "7300", "600", "0021", "ROOF-0021", 3_800_000],
];

// ===================== opening fund balance =====================
// Unassigned is set so the General Fund reserve lands just under the 5% target: it trips
// one warning and reads "Acceptable". A demo where nothing ever fires teaches nobody what
// the thresholds do.
//
// 9,500,000 / 198,100,000 budgeted general-fund expenditure ≈ 4.8%.

// The two totals (Prior Year Total, Beginning Total) are computed by the platform and are
// no longer columns on the file — the district supplies the components and nothing else.
const OPENING_FUND_BALANCE: Row[] = [
  // fund, py x5, beg x4, begUnassigned, effective, status, notes
  ["1000", 500_000, 2_000_000, 3_000_000, 4_000_000, 9_500_000, 500_000, 2_000_000, 3_000_000, 4_000_000, 9_500_000, "2026-07-01", "Final", "Audited close of FY2025-26"],
  ["4100", 0, 850_000, 0, 0, 1_200_000, 0, 850_000, 0, 0, 1_200_000, "2026-07-01", "Final", ""],
  ["3200", 0, 6_400_000, 0, 0, 900_000, 0, 6_400_000, 0, 0, 900_000, "2026-07-01", "Final", ""],
];

// ===================== monthly detail =====================
//
// TWELVE periods, July through June. Two was enough to prove the pipeline; it is not
// enough to review a dashboard. Every trend chart, sparkline, 12-month high/low and
// volatility figure in Milestone 3 wants a year, and against two points they all render as
// a line segment that looks correct and tests nothing.
//
// ---------------------------------------------------------------------------
// THE SHAPE OF THE STORY
//
// The old sample produced an almost entirely green district: reserve 4.52%, days cash 140,
// utilisation 21%, zero critical alerts. That demonstrates the alert engine can stay quiet.
// It does not demonstrate that it works, and it is not what a district reviewing this
// product wants to see.
//
// So the year is shaped as a district in MILD DIFFICULTY — the position the client's own
// reference screenshots show:
//
//   * revenue lands slightly under budget,
//   * spending runs slightly hot, so utilisation crosses the 80% warning late in the year,
//   * cash declines through the year and finishes under the 60-day policy,
//   * the reserve ends just below the 5% target — the single most important number on the
//     Executive dashboard, and the one worth showing in its interesting state.
//
// Nothing is catastrophic. A demo full of red is as uninformative as a demo full of green.
// ---------------------------------------------------------------------------
//
// SEASONALITY IS THE POINT OF TWELVE MONTHS. The old generator computed YTD as `mtd * m`,
// an identity that silently requires every month to be identical — which is exactly the
// assumption a straight-line forecast makes and exactly what a district's real calendar
// breaks. Here each month has a weight, YTD is the accumulated weight, and the two cannot
// drift apart because both come from the same array.

/** Fraction of the year's activity landing in each period. Each array sums to 1. */
const REVENUE_SHAPE = [
  0.055, // Jul — the year starts slowly
  0.070, // Aug
  0.080, // Sep
  0.085, // Oct
  0.115, // Nov — ad valorem taxes arrive
  0.130, // Dec — and peak
  0.095, // Jan
  0.085, // Feb
  0.080, // Mar
  0.075, // Apr
  0.070, // May
  0.060, // Jun
];

const SPEND_SHAPE = [
  0.060, // Jul — payroll not yet at full strength
  0.078, // Aug — schools open, energy peaks in the Florida heat
  0.088, // Sep
  0.086, // Oct
  0.084, // Nov
  0.088, // Dec
  0.086, // Jan
  0.084, // Feb
  0.086, // Mar
  0.086, // Apr
  0.087, // May
  0.087, // Jun
];

/** Energy runs on its own calendar — hot months cost more, and the MoM alert should see it. */
const ENERGY_SHAPE = [
  0.115, 0.135, 0.120, 0.095, 0.060, 0.045, 0.045, 0.050, 0.065, 0.080, 0.095, 0.095,
];

export type Period = number;

const cumulative = (shape: number[], period: Period): number =>
  shape.slice(0, period).reduce((a, b) => a + b, 0);

/** Rounded to cents, so the file carries figures a district could actually reconcile. */
const at = (annual: number, shape: number[], period: Period, cum: boolean): number =>
  Math.round(annual * (cum ? cumulative(shape, period) : shape[period - 1]) * 100) / 100;

/**
 * How much of the budget is realised across the whole year.
 *
 * These two numbers carry the story. Revenue at 0.965 and spending at 0.995 puts the
 * district a little behind on collections and a little hot on spending — enough for the
 * variance and utilisation thresholds to have something to say by the spring, and not
 * enough to look like a crisis.
 */
const REVENUE_REALISATION = 0.9477;
const SPEND_REALISATION = 0.9431;

/**
 * Revenue detail: fund, source, project/grant, cost centre, budget, MTD, YTD.
 *
 * Everything runs at roughly a twelfth a month. That is a demo choice, not a claim about
 * Florida: a real district collects ad valorem in November and looks badly behind every
 * August, which is exactly the seasonality a straight-line forecast cannot see. Pacing it
 * evenly here keeps the sample about the platform rather than about one quirk of the
 * property-tax calendar.
 *
 * MTD and YTD are kept consistent — YTD is MTD accumulated. A row whose YTD jumps while
 * its MTD reads zero is impossible, and the month-over-month alerts read MTD.
 */
function revenueDetail(period: Period): Row[] {
  // fund, source, project, cost centre, budget, and the share realised this year.
  // Federal Title I lags badly — it is the line the "top negative variance" card names.
  const lines: [string, string, string, string, number, number][] = [
    ["1000", "3310", "GENERAL", "", 120_000_000, 0.99],
    ["1000", "3355", "GENERAL", "", 15_000_000, 0.97],
    ["1000", "1110", "GENERAL", "", 60_000_000, 0.98],
    ["1000", "3202", "TITLE-I-2627", "0021", 2_400_000, 0.76],
    ["4100", "1310", "GENERAL", "", 6_500_000, 0.93],
  ];

  const rows: Row[] = lines.map(([fund, source, project, cc, budget, realise]) => {
    const annual = budget * realise * REVENUE_REALISATION;
    return [fund, source, project, cc, budget, at(annual, REVENUE_SHAPE, period, false), at(annual, REVENUE_SHAPE, period, true)];
  });

  // A one-off transfer in, and the sale of a surplus site. Both are single events rather
  // than a monthly stream — they are the rows the activity-code console classifies, and
  // the reason the sample has something to classify at all.
  const once = (landsIn: Period, amount: number): [number, number] => [
    period === landsIn ? amount : 0,
    period >= landsIn ? amount : 0,
  ];

  const transfer = once(2, 1_000_000);
  const saleOfSite = once(4, 4_000_000);

  rows.push(["1000", "3600", "GENERAL", "", 1_000_000, transfer[0], transfer[1]]);
  rows.push(["3200", "3730", "PECO-2627", "", 4_000_000, saleOfSite[0], saleOfSite[1]]);

  return rows;
}

/**
 * Expenditure detail: fund, function, object, cost centre, project/grant, budget, MTD,
 * YTD, encumbrances. Available Budget is left out — the platform computes it, and a
 * template that omitted it would imply otherwise. It is included in the file below with a
 * correct value, to show the recompute-and-compare passing.
 */
function expenditureDetail(period: Period): Row[] {
  // fund, function, object, cost centre, project, budget, realised share, encumbrance.
  // Salaries and benefits overrun slightly — they are the largest lines, so they are what
  // pushes utilisation past the warning threshold late in the year.
  const lines: [string, string, string, string, string, number, number, number][] = [
    ["1000", "5000", "100", "0011", "GENERAL", 42_000_000, 1.03, 0],
    ["1000", "5000", "100", "0021", "GENERAL", 31_000_000, 1.02, 0],
    ["1000", "5000", "100", "0031", "GENERAL", 22_000_000, 1.01, 0],
    ["1000", "5000", "200", "0011", "GENERAL", 13_500_000, 1.04, 0],
    ["1000", "5000", "200", "0021", "GENERAL", 10_000_000, 1.03, 0],
    ["1000", "5000", "200", "0031", "GENERAL", 7_000_000, 1.0, 0],
    ["1000", "6100", "100", "9001", "GENERAL", 12_000_000, 0.99, 0],
    ["1000", "6100", "200", "9001", "GENERAL", 4_000_000, 0.98, 0],
    ["1000", "7300", "100", "9001", "GENERAL", 6_500_000, 0.97, 0],
    ["1000", "7300", "200", "9001", "GENERAL", 2_000_000, 0.96, 0],
    ["1000", "5000", "300", "0011", "GENERAL", 4_000_000, 0.92, 250_000],
    ["1000", "7300", "300", "9001", "GENERAL", 14_000_000, 0.95, 900_000],
    ["1000", "5000", "500", "0011", "GENERAL", 3_200_000, 0.94, 140_000],
    ["1000", "6200", "500", "0021", "GENERAL", 4_000_000, 0.9, 0],
    ["1000", "5000", "600", "0011", "GENERAL", 7_200_000, 0.55, 5_800_000],
    ["1000", "6300", "700", "9001", "GENERAL", 5_200_000, 0.93, 0],
    ["4100", "7300", "500", "9001", "GENERAL", 6_400_000, 0.98, 0],
  ];

  const rows: Row[] = lines.map(([fund, fn, obj, cc, project, budget, realise, enc]) => {
    const annual = budget * realise * SPEND_REALISATION;
    return [
      fund,
      fn,
      obj,
      cc,
      project,
      budget,
      at(annual, SPEND_SHAPE, period, false),
      at(annual, SPEND_SHAPE, period, true),
      // Encumbrances build early and are drawn down as the year runs — a purchase order
      // raised in August is invoiced by spring. Holding them flat across twelve months
      // would drive available budget negative and bury the validation report in warnings.
      Math.round(enc * Math.max(0, 1 - period / 14)),
    ];
  });

  // Energy runs on its own calendar. In the hot months this line runs well ahead of a
  // straight twelfth, which is what a Florida utility bill does — and what the
  // month-over-month alert exists to notice.
  const energyAnnual = 8_500_000 * 0.99;
  rows.push([
    "1000",
    "7300",
    "400",
    "9002",
    "GENERAL",
    8_500_000,
    at(energyAnnual, ENERGY_SHAPE, period, false),
    at(energyAnnual, ENERGY_SHAPE, period, true),
    0,
  ]);

  // The interfund transfer out, a single event in August, matching the transfer in.
  rows.push([
    "1000",
    "7300",
    "9700",
    "9001",
    "GENERAL",
    2_000_000,
    period === 2 ? 2_000_000 : 0,
    period >= 2 ? 2_000_000 : 0,
    0,
  ]);

  // The roof project: committed almost in full from period 2, so encumbrances plus spend
  // exceed the budget on that line. It raises a WARNING on the validation report and
  // demonstrates the two-tier split — a real state, acknowledged, not a rejected file.
  const roofSpent = period < 2 ? 0 : Math.min(3_600_000, 1_900_000 + (period - 2) * 210_000);
  rows.push([
    "3200",
    "7300",
    "600",
    "0021",
    "ROOF-0021",
    3_800_000,
    period === 2 ? 1_900_000 : period > 2 ? 210_000 : 0,
    roofSpent,
    period < 2 ? 0 : Math.max(0, 2_100_000 - (period - 2) * 190_000),
  ]);

  // Append Available Budget = Budget − Actual YTD − Encumbrances, computed rather than
  // typed, so the file agrees with what the platform recomputes.
  return rows.map((r) => {
    const [budget, , ytd, enc] = [r[5] as number, r[6] as number, r[7] as number, r[8] as number];
    return [...r, budget - ytd - enc];
  });
}

/**
 * Cash position: fund, beginning, receipts MTD, disbursements MTD, ending, investment,
 * restricted, unrestricted.
 *
 * CHAINED, month to month: each period's beginning cash is the previous period's ending
 * cash, exactly. That is not decoration — the platform recomputes Ending = Beginning +
 * Receipts − Disbursements and compares to a cent, so a chain that did not hold would
 * fail its own validation layer. It is also what makes the 12-month high/low, the average
 * and the volatility figure on §7.2 mean anything.
 *
 * The district ends the year with materially less cash than it started, which is what puts
 * days-cash under the 60-day policy and gives the gauge something to point at.
 */
function cashChain(period: Period): Record<string, { begin: number; receipts: number; disburse: number }> {
  // Walk from the opening balance to the requested period. Cheap (12 iterations) and it
  // guarantees the chain rather than asserting it.
  const state = {
    "1000": 40_000_000,
    "4100": 2_000_000,
    "3200": 7_300_000,
  };

  let out: Record<string, { begin: number; receipts: number; disburse: number }> = {};

  for (let p = 1 as Period; p <= period; p++) {
    const gfReceipts = Math.round(191_000_000 * REVENUE_SHAPE[p - 1]);
    // Disbursements outrun receipts across the year — the reason cash declines.
    const gfDisburse = Math.round(203_000_000 * SPEND_SHAPE[p - 1]);
    const fsReceipts = Math.round(6_050_000 * REVENUE_SHAPE[p - 1]);
    const fsDisburse = Math.round(6_270_000 * SPEND_SHAPE[p - 1]);
    const cpReceipts = p === 4 ? 4_000_000 : 0;
    const cpDisburse = p < 2 ? 0 : Math.round(3_400_000 * 0.09);

    out = {
      "1000": { begin: state["1000"], receipts: gfReceipts, disburse: gfDisburse },
      "4100": { begin: state["4100"], receipts: fsReceipts, disburse: fsDisburse },
      "3200": { begin: state["3200"], receipts: cpReceipts, disburse: cpDisburse },
    };

    state["1000"] += gfReceipts - gfDisburse;
    state["4100"] += fsReceipts - fsDisburse;
    state["3200"] += cpReceipts - cpDisburse;
  }

  return out;
}

function cashPosition(period: Period): Row[] {
  const c = cashChain(period);
  const end = (k: string) => c[k].begin + c[k].receipts - c[k].disburse;

  // The composition columns feed §7.2's cash donut. Investment and restricted are reported
  // separately; unrestricted is what is left, and the platform shows the remainder as
  // "Other" rather than inferring it.
  return [
    ["1000", c["1000"].begin, c["1000"].receipts, c["1000"].disburse, end("1000"), 12_000_000, 2_100_000, Math.max(0, end("1000") - 12_000_000 - 2_100_000)],
    ["4100", c["4100"].begin, c["4100"].receipts, c["4100"].disburse, end("4100"), "", "", ""],
    ["3200", c["3200"].begin, c["3200"].receipts, c["3200"].disburse, end("3200"), 5_000_000, "", ""],
  ];
}


// ===================== writers =====================

function writeCsv(file: string, headers: string[], rows: Row[]): void {
  const lines = [headers.map((h) => csvEscape(h)).join(",")];
  for (const r of rows) lines.push(r.map((c) => csvEscape(String(c))).join(","));
  // No UTF-8 BOM, matching lib/csv-export.ts — Excel would like one, but it corrupts the
  // first header on re-import, and these files are meant to round-trip.
  writeFileSync(join(OUT, file), lines.join("\n"), "utf8");
}

async function writeXlsx(file: string, headers: string[], rows: Row[]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(r);

  // Widths only — no number formatting. Formatting an account code as a number is exactly
  // how a real ERP eats its leading zeros, and these files are meant to import cleanly.
  ws.columns.forEach((c, i) => {
    c.width = Math.max(12, headers[i].length + 2);
  });
  await wb.xlsx.writeFile(join(OUT, file));
}

async function emit(name: string, slug: DatasetSlug, rows: Row[]): Promise<void> {
  // Headers from the registry, so a sample file cannot drift from the importer.
  const headers = templateHeaders(DATASET_DEFS[slug]);
  writeCsv(`${name}.csv`, headers, rows);
  await writeXlsx(`${name}.xlsx`, headers, rows);
  console.log(`  ${name}.csv / .xlsx  — ${rows.length} rows`);
}

async function main() {
  mkdirSync(join(OUT, "master-data"), { recursive: true });

  console.log("\nMaster data (import these first, under Master data)");
  const master: [string, string[], Row[]][] = [
    ["01-funds", ["Code", "Name", "Fund type"], FUNDS],
    ["02-revenue-sources", ["Code", "Name", "Revenue type"], REVENUE_SOURCES],
    ["03-functions", ["Code", "Name", "Function type"], FUNCTIONS],
    ["04-objects", ["Code", "Name", "Object type"], OBJECTS],
    ["05-cost-centers", ["Cost center number", "Name", "Category", "Cost Center Type"], COST_CENTERS],
    ["06-projects", ["Project Number", "Project Name"], PROJECTS],
  ];
  for (const [name, headers, rows] of master) {
    writeCsv(join("master-data", `${name}.csv`), headers, rows);
    console.log(`  master-data/${name}.csv  — ${rows.length} rows`);
  }

  console.log("\nAnnual — once a year");
  await emit("01-revenue-budget-FY2026-27", "revenue-budget", REVENUE_BUDGET);
  await emit("02-expenditure-budget-FY2026-27", "expenditure-budget", EXPENDITURE_BUDGET);
  await emit("03-opening-fund-balance-FY2026-27", "opening-fund-balance", OPENING_FUND_BALANCE);

  console.log("\nMonthly — every reporting period");
  for (let p = 1; p <= SAMPLE_PERIODS; p++) {
    const label = PERIOD_LABELS[p - 1];
    await emit(`04-revenue-detail-FY2026-27-${label}`, "revenue-detail", revenueDetail(p));
    await emit(`05-expenditure-detail-FY2026-27-${label}`, "expenditure-detail", expenditureDetail(p));
    await emit(`06-cash-position-FY2026-27-${label}`, "cash-position", cashPosition(p));
  }

  console.log(`\nWritten to public/sample-data\n`);
}

// Only generate when this script is RUN — importing it must not rewrite every sample file
// as a side effect.
const runDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (runDirectly) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
