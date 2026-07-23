import "server-only";
import type { TenantDb } from "@/lib/tenant-db";
import { csvEscape } from "@/lib/csv";
import { loadCore } from "@/lib/dashboard/load";
import type { DashboardScope } from "@/lib/dashboard/scope";
import {
  revenueBySource,
  revenueByType,
  expenditureByFunction,
  expenditureByObjectType,
  byFund,
  type Breakdown,
} from "@/lib/finance/breakdown";
import { num, type Sheet, type CellValue } from "@/lib/export/workbook";

/**
 * What each dashboard exports, in one place.
 *
 * The same builder feeds the CSV and the Excel route, so the two can never disagree about
 * what "export this dashboard" means — the mistake the periodic-data export avoided by
 * sharing its query builder with its page, and worth repeating here.
 */

export type DashboardKind = "dashboard" | "revenues" | "expenditures" | "fund-balance" | "cash";

const BREAKDOWN_COLUMNS = [
  { header: "Code", format: "text" as const, width: 14 },
  { header: "Name", format: "text" as const, width: 34 },
  { header: "Budget (full year)", format: "money" as const },
  { header: "Actual (YTD)", format: "money" as const },
  { header: "Encumbrances", format: "money" as const },
  { header: "Available", format: "money" as const },
  { header: "% of budget", format: "percent" as const },
  { header: "Budget to date", format: "money" as const },
  { header: "Variance to date", format: "money" as const },
  { header: "Variance %", format: "percent" as const },
];

function breakdownRows(b: Breakdown): CellValue[][] {
  return b.rows.map((r) => [
    r.code,
    r.name,
    num(r.budget),
    num(r.actualYtd),
    num(r.encumbrances),
    num(r.available),
    num(r.consumption.percent),
    num(r.pace.budget),
    num(r.pace.amount),
    num(r.pace.percent),
  ]);
}

function breakdownTotal(b: Breakdown): CellValue[] {
  const r = b.total;
  return [
    "",
    r.name,
    num(r.budget),
    num(r.actualYtd),
    num(r.encumbrances),
    num(r.available),
    num(r.consumption.percent),
    num(r.pace.budget),
    num(r.pace.amount),
    num(r.pace.percent),
  ];
}

export async function buildDashboardSheets(
  db: TenantDb,
  districtId: string,
  scope: DashboardScope,
  kind: DashboardKind,
): Promise<Sheet[]> {
  const core = await loadCore(db, districtId, scope);
  const revVersion = core.versions.get("REVENUE_DETAIL");
  const expVersion = core.versions.get("EXPENDITURE_DETAIL");
  const args = { fundId: scope.fundId, periodsElapsed: scope.period };
  const sheets: Sheet[] = [];

  // Every export leads with the trend, because it is the part a spreadsheet genuinely
  // improves on — a district can chart it themselves however they like.
  sheets.push({
    name: "Monthly trend",
    caption: "One row per reporting period. Blank rows are periods with no committed data.",
    columns: [
      { header: "Period", format: "text", width: 10 },
      { header: "Revenue budget", format: "money" },
      { header: "Revenue MTD", format: "money" },
      { header: "Revenue YTD", format: "money" },
      { header: "Expenditure budget", format: "money" },
      { header: "Expenditure MTD", format: "money" },
      { header: "Expenditure YTD", format: "money" },
      { header: "Encumbrances", format: "money" },
      { header: "Ending cash", format: "money" },
      { header: "Fund balance", format: "money" },
      { header: "Unassigned", format: "money" },
    ],
    rows: core.series.points.map((p) => [
      p.period,
      p.hasData ? num(p.revenueBudget) : null,
      p.hasData ? num(p.revenueMtd) : null,
      p.hasData ? num(p.revenueYtd) : null,
      p.hasData ? num(p.expenditureBudget) : null,
      p.hasData ? num(p.expenditureMtd) : null,
      p.hasData ? num(p.expenditureYtd) : null,
      p.hasData ? num(p.encumbrances) : null,
      num(p.endingCash),
      num(p.fundBalance),
      num(p.unassignedFundBalance),
    ]),
  });

  if ((kind === "dashboard" || kind === "revenues") && revVersion) {
    const [bySource, byType] = await Promise.all([
      revenueBySource(db, { versionId: revVersion, ...args }),
      revenueByType(db, { versionId: revVersion, ...args }),
    ]);
    sheets.push({
      name: "Revenue by source",
      columns: BREAKDOWN_COLUMNS,
      rows: breakdownRows(bySource),
      total: breakdownTotal(bySource),
    });
    sheets.push({
      name: "Revenue by category",
      columns: BREAKDOWN_COLUMNS,
      rows: breakdownRows(byType),
      total: breakdownTotal(byType),
    });
  }

  if ((kind === "dashboard" || kind === "expenditures") && expVersion) {
    const [byFunction, byObject] = await Promise.all([
      expenditureByFunction(db, { versionId: expVersion, ...args }),
      expenditureByObjectType(db, { versionId: expVersion, ...args }),
    ]);
    sheets.push({
      name: "Spending by function",
      columns: BREAKDOWN_COLUMNS,
      rows: breakdownRows(byFunction),
      total: breakdownTotal(byFunction),
    });
    sheets.push({
      name: "Spending by object",
      columns: BREAKDOWN_COLUMNS,
      rows: breakdownRows(byObject),
      total: breakdownTotal(byObject),
    });
  }

  if (kind === "dashboard" || kind === "fund-balance" || kind === "cash") {
    const funds = await byFund(db, {
      revenueVersionId: revVersion,
      expenditureVersionId: expVersion,
      cashVersionId: core.versions.get("CASH_POSITION"),
      openingVersionId: core.versions.get("OPENING_FUND_BALANCE"),
    });
    sheets.push({
      name: "By fund",
      columns: [
        { header: "Code", format: "text", width: 14 },
        { header: "Fund", format: "text", width: 30 },
        { header: "Type", format: "text", width: 20 },
        { header: "Revenue (YTD)", format: "money" },
        { header: "Spending (YTD)", format: "money" },
        { header: "Fund balance", format: "money" },
        { header: "Ending cash", format: "money" },
      ],
      rows: funds.map((f) => [
        f.code,
        f.name,
        f.typeName ?? "",
        num(f.revenueYtd),
        num(f.expenditureYtd),
        num(f.fundBalance),
        num(f.endingCash),
      ]),
    });
  }

  // The alerts travel with the figures. A spreadsheet of numbers with no note of which
  // thresholds they crossed makes the reader re-derive the judgement themselves.
  if (core.alerts) {
    sheets.push({
      name: "Alerts",
      caption: `Evaluated for ${scope.label} against this district's own thresholds.`,
      columns: [
        { header: "Severity", format: "text", width: 14 },
        { header: "Group", format: "text", width: 16 },
        { header: "Alert", format: "text", width: 34 },
        { header: "Detail", format: "text", width: 80 },
      ],
      rows: [
        ...core.alerts.alerts.map((a) => [a.severity, a.group, a.title, a.message]),
        ...core.alerts.observations.map((o) => ["INFORMATIONAL", "—", o.title, o.message]),
      ],
    });
  }

  return sheets;
}

/** The same sheets, flattened to one CSV — each sheet becomes a titled block. */
export function sheetsToCsv(sheets: Sheet[]): string {
  // Numbers go out BARE — 1234.56, never "$1,234.56". Master data's round-trip rule
  // (lib/datasets/browse.ts) is that an exported file can be edited in Excel and read
  // straight back, and a currency symbol breaks that on re-import.
  const cell = (v: CellValue): string => csvEscape(v === null ? "" : String(v));

  const out: string[] = [];
  for (const s of sheets) {
    out.push(csvEscape(s.name));
    if (s.caption) out.push(csvEscape(s.caption));
    out.push(s.columns.map((c) => csvEscape(c.header)).join(","));
    for (const row of s.rows) out.push(row.map(cell).join(","));
    if (s.total) out.push(s.total.map(cell).join(","));
    out.push("");
  }
  return out.join("\n");
}
