import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { csvEscape } from "@/lib/csv";
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
// Two months, so month-over-month alerts and trends have something to compare. Period 1 is
// July (the district's fiscal year starts in July); period 2 is August.
//
// August's beginning cash is July's ending cash — the workbook's own example reproduced:
// $72.0M + $48.5M − $44.2M = $76.3M.

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
function revenueDetail(period: 1 | 2): Row[] {
  const m = period;
  const rows: Row[] = [
    ["1000", "3310", "GENERAL", "", 120_000_000, 10_000_000, 10_000_000 * m],
    ["1000", "3355", "GENERAL", "", 15_000_000, 1_250_000, 1_250_000 * m],
    ["1000", "1110", "GENERAL", "", 60_000_000, 5_000_000, 5_000_000 * m],
    ["1000", "3202", "TITLE-I-2627", "0021", 2_400_000, 180_000, 180_000 * m],
    ["4100", "1310", "GENERAL", "", 6_500_000, 210_000, 210_000 * m],
  ];

  // A one-off transfer in, and the sale of a surplus site — both land in August. They are
  // the rows the activity-code console classifies, and the reason the sample has something
  // to classify at all.
  rows.push(
    period === 2
      ? ["1000", "3600", "GENERAL", "", 1_000_000, 1_000_000, 1_000_000]
      : ["1000", "3600", "GENERAL", "", 1_000_000, 0, 0],
  );
  rows.push(
    period === 2
      ? ["3200", "3730", "PECO-2627", "", 4_000_000, 4_000_000, 4_000_000]
      : ["3200", "3730", "PECO-2627", "", 4_000_000, 0, 0],
  );

  return rows;
}

/**
 * Expenditure detail: fund, function, object, cost centre, project/grant, budget, MTD,
 * YTD, encumbrances. Available Budget is left out — the platform computes it, and a
 * template that omitted it would imply otherwise. It is included in the file below with a
 * correct value, to show the recompute-and-compare passing.
 */
function expenditureDetail(period: 1 | 2): Row[] {
  const m = period;
  const rows: Row[] = [
    ["1000", "5000", "100", "0011", "GENERAL", 42_000_000, 3_500_000, 3_500_000 * m, 0],
    ["1000", "5000", "100", "0021", "GENERAL", 31_000_000, 2_580_000, 2_580_000 * m, 0],
    ["1000", "5000", "100", "0031", "GENERAL", 22_000_000, 1_830_000, 1_830_000 * m, 0],
    ["1000", "5000", "200", "0011", "GENERAL", 13_500_000, 1_120_000, 1_120_000 * m, 0],
    ["1000", "5000", "200", "0021", "GENERAL", 10_000_000, 830_000, 830_000 * m, 0],
    ["1000", "5000", "200", "0031", "GENERAL", 7_000_000, 580_000, 580_000 * m, 0],
    ["1000", "6100", "100", "9001", "GENERAL", 12_000_000, 1_000_000, 1_000_000 * m, 0],
    ["1000", "6100", "200", "9001", "GENERAL", 4_000_000, 330_000, 330_000 * m, 0],
    ["1000", "7300", "100", "9001", "GENERAL", 6_500_000, 540_000, 540_000 * m, 0],
    ["1000", "7300", "200", "9001", "GENERAL", 2_000_000, 160_000, 160_000 * m, 0],
    ["1000", "5000", "300", "0011", "GENERAL", 4_000_000, 300_000, 300_000 * m, 250_000],
    ["1000", "7300", "300", "9001", "GENERAL", 14_000_000, 1_100_000, 1_100_000 * m, 900_000],
    // Energy: a hot Florida August. In period 2 this line runs well ahead of a straight
    // twelfth, which is what a real utility bill does — and what the month-over-month
    // alert exists to notice.
    ["1000", "7300", "400", "9002", "GENERAL", 8_500_000, period === 2 ? 1_400_000 : 620_000, period === 2 ? 2_020_000 : 620_000, 0],
    ["1000", "5000", "500", "0011", "GENERAL", 3_200_000, 260_000, 260_000 * m, 140_000],
    ["1000", "6200", "500", "0021", "GENERAL", 4_000_000, 330_000, 330_000 * m, 0],
    ["1000", "5000", "600", "0011", "GENERAL", 7_200_000, 300_000, 300_000 * m, 5_800_000],
    ["1000", "6300", "700", "9001", "GENERAL", 5_200_000, 430_000, 430_000 * m, 0],
    ["1000", "7300", "9700", "9001", "GENERAL", 2_000_000, period === 2 ? 2_000_000 : 0, period === 2 ? 2_000_000 : 0, 0],
    ["4100", "7300", "500", "9001", "GENERAL", 6_400_000, 530_000, 530_000 * m, 0],
  ];

  // Period 2 only: the roof project is committed almost in full — encumbrances plus spend
  // exceed the budget on that line. It raises a WARNING on the validation report and
  // demonstrates the two-tier split: a real state, acknowledged, not a rejected file.
  rows.push(
    period === 2
      ? ["3200", "7300", "600", "0021", "ROOF-0021", 3_800_000, 1_900_000, 1_900_000, 2_100_000]
      : ["3200", "7300", "600", "0021", "ROOF-0021", 3_800_000, 0, 0, 0],
  );

  // Append Available Budget = Budget − Actual YTD − Encumbrances, computed rather than
  // typed, so the file agrees with what the platform recomputes.
  return rows.map((r) => {
    const [budget, , ytd, enc] = [r[5] as number, r[6] as number, r[7] as number, r[8] as number];
    return [...r, budget - ytd - enc];
  });
}

/** Cash position: fund, beginning, receipts MTD, disbursements MTD, ending, investment, restricted, unrestricted. */
function cashPosition(period: 1 | 2): Row[] {
  // The workbook's own worked example lands in period 2 for the General Fund.
  const gf =
    period === 1
      ? { begin: 70_000_000, receipts: 25_000_000, disburse: 23_000_000 }
      : { begin: 72_000_000, receipts: 48_500_000, disburse: 44_200_000 }; // -> 76.3M

  const fs =
    period === 1
      ? { begin: 2_000_000, receipts: 210_000, disburse: 530_000 }
      : { begin: 1_680_000, receipts: 210_000, disburse: 530_000 };

  const cp =
    period === 1
      ? { begin: 7_300_000, receipts: 0, disburse: 0 }
      : { begin: 7_300_000, receipts: 4_000_000, disburse: 1_900_000 };

  return [
    ["1000", gf.begin, gf.receipts, gf.disburse, gf.begin + gf.receipts - gf.disburse, 12_000_000, "", ""],
    ["4100", fs.begin, fs.receipts, fs.disburse, fs.begin + fs.receipts - fs.disburse, "", "", ""],
    ["3200", cp.begin, cp.receipts, cp.disburse, cp.begin + cp.receipts - cp.disburse, 5_000_000, "", ""],
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
  for (const p of [1, 2] as const) {
    const label = p === 1 ? "P1-July" : "P2-August";
    await emit(`04-revenue-detail-FY2026-27-${label}`, "revenue-detail", revenueDetail(p));
    await emit(`05-expenditure-detail-FY2026-27-${label}`, "expenditure-detail", expenditureDetail(p));
    await emit(`06-cash-position-FY2026-27-${label}`, "cash-position", cashPosition(p));
  }

  console.log(`\nWritten to public/sample-data\n`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
