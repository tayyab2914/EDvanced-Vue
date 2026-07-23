import { Prisma } from "@/lib/generated/prisma/client";
import type { TenantDb } from "@/lib/tenant-db";
import type { DatasetKind } from "@/lib/enums";

/**
 * Every figure a trend chart needs, for a whole fiscal year, in four queries.
 *
 * ---------------------------------------------------------------------------
 * THE TRAP THIS MODULE EXISTS TO AVOID
 *
 * The Milestone 2 engines answer "one figure, one period, one fund". Written the obvious
 * way, a twelve-period trend calls them in a loop — and each one begins by resolving its
 * own current-version ids, so twelve points across four datasets is ninety-six queries for
 * one chart. There are eight such charts in the spec.
 *
 * The fix rests on the partial unique index on DatasetVersion: exactly one version per
 * (dataset, period) is current, enforced by the database rather than by application code.
 * So a single query with NO period filter returns the whole year's current versions at
 * once — and because every periodic row carries `versionId`, one grouped aggregate per
 * dataset then covers every period simultaneously.
 *
 *     versions:  1 query   (all datasets, all periods, isCurrent)
 *     revenue:   1 groupBy (all periods at once)
 *     spending:  1 groupBy
 *     cash:      1 groupBy
 *     opening:   1 aggregate (annual — one version for the year)
 * ---------------------------------------------------------------------------
 *
 * AND THE RULE THAT MAKES IT CORRECT: filter periodic data by `versionId`, NEVER by
 * `(fiscalYear, period)`. Filtering by period sweeps in SUPERSEDED versions and
 * double-counts every re-upload the district ever made. The schema's own index comments
 * suggest the period key is the one to use for reporting; for a dashboard it is not.
 */

const D = Prisma.Decimal;
const ZERO = new D(0);

/** One period's worth of every figure the dashboards trend. */
export interface PeriodPoint {
  period: number;

  // Revenue detail
  revenueBudget: Prisma.Decimal;
  revenueMtd: Prisma.Decimal;
  revenueYtd: Prisma.Decimal;

  // Expenditure detail
  expenditureBudget: Prisma.Decimal;
  expenditureMtd: Prisma.Decimal;
  expenditureYtd: Prisma.Decimal;
  encumbrances: Prisma.Decimal;

  // Cash position
  beginningCash: Prisma.Decimal | null;
  receiptsMtd: Prisma.Decimal | null;
  disbursementsMtd: Prisma.Decimal | null;
  endingCash: Prisma.Decimal | null;
  investmentBalance: Prisma.Decimal | null;
  restrictedCash: Prisma.Decimal | null;
  unrestrictedCash: Prisma.Decimal | null;

  /**
   * Derived: beginning fund balance + revenue YTD − expenditure YTD.
   *
   * Null when the year has no Opening Fund Balance, because without a starting point this
   * is only the year's net change — a different number wearing the same label.
   */
  fundBalance: Prisma.Decimal | null;
  unassignedFundBalance: Prisma.Decimal | null;

  /** True when this period has any committed data at all. */
  hasData: boolean;
  /** True when a cash file was committed for this period specifically. */
  hasCash: boolean;
}

export interface YearSeries {
  fiscalYear: string;
  points: PeriodPoint[];
  /** The year's opening balances, from the annual import. Null when none was uploaded. */
  opening: {
    total: Prisma.Decimal;
    unassigned: Prisma.Decimal;
    nonspendable: Prisma.Decimal;
    restricted: Prisma.Decimal;
    committed: Prisma.Decimal;
    assigned: Prisma.Decimal;
  } | null;
  /** The adopted full-year expenditure budget — the divisor for days-cash and reserve %. */
  adoptedExpenditureBudget: Prisma.Decimal;
  adoptedRevenueBudget: Prisma.Decimal;
}

/**
 * Current version ids for a whole fiscal year, keyed by dataset and then by period.
 *
 * Deliberately omits `period` from the where clause — that omission is the whole point.
 * Annual datasets come back under period `null`.
 */
export async function currentVersionsForYear(
  db: TenantDb,
  fiscalYear: string,
): Promise<Map<DatasetKind, Map<number | null, string>>> {
  const rows = await db.datasetVersion.findMany({
    where: { fiscalYear, isCurrent: true },
    select: { id: true, dataset: true, period: true },
  });

  const out = new Map<DatasetKind, Map<number | null, string>>();
  for (const r of rows) {
    const kind = r.dataset as DatasetKind;
    let byPeriod = out.get(kind);
    if (!byPeriod) {
      byPeriod = new Map();
      out.set(kind, byPeriod);
    }
    byPeriod.set(r.period, r.id);
  }
  return out;
}

/** Inverts a period→versionId map so a grouped aggregate can be read back by period. */
function periodOf(byPeriod: Map<number | null, string> | undefined): Map<string, number> {
  const out = new Map<string, number>();
  if (!byPeriod) return out;
  for (const [period, id] of byPeriod) {
    if (period !== null) out.set(id, period);
  }
  return out;
}

/**
 * The whole fiscal year, ready to trend.
 *
 * `throughPeriod` caps the series at the period the dashboard is scoped to, so a chart
 * never draws months the user has "gone back before". Periods with no committed data are
 * present but flagged `hasData: false` — the chart draws a gap there rather than
 * interpolating across a month nobody reported.
 */
export async function yearSeries(
  db: TenantDb,
  args: { fiscalYear: string; fundId?: string; throughPeriod?: number },
): Promise<YearSeries> {
  const { fiscalYear, fundId } = args;
  const through = Math.max(1, Math.min(12, args.throughPeriod ?? 12));
  const fund = fundId ? { fundId } : {};

  const versions = await currentVersionsForYear(db, fiscalYear);

  const revenueByPeriod = periodOf(versions.get("REVENUE_DETAIL"));
  const spendByPeriod = periodOf(versions.get("EXPENDITURE_DETAIL"));
  const cashByPeriod = periodOf(versions.get("CASH_POSITION"));
  const openingVersion = versions.get("OPENING_FUND_BALANCE")?.get(null);
  const expBudgetVersion = versions.get("EXPENDITURE_BUDGET")?.get(null);
  const revBudgetVersion = versions.get("REVENUE_BUDGET")?.get(null);

  const ids = (m: Map<string, number>) => [...m.keys()];

  const [revenue, spending, cash, opening, expBudget, revBudget] = await Promise.all([
    revenueByPeriod.size
      ? db.revenueActual.groupBy({
          by: ["versionId"],
          where: { versionId: { in: ids(revenueByPeriod) }, ...fund },
          _sum: { budget: true, actualMtd: true, actualYtd: true },
        })
      : Promise.resolve([]),

    spendByPeriod.size
      ? db.expenditureActual.groupBy({
          by: ["versionId"],
          where: { versionId: { in: ids(spendByPeriod) }, ...fund },
          _sum: { budget: true, actualMtd: true, actualYtd: true, encumbrances: true },
        })
      : Promise.resolve([]),

    cashByPeriod.size
      ? db.cashPosition.groupBy({
          by: ["versionId"],
          where: { versionId: { in: ids(cashByPeriod) }, ...fund },
          _sum: {
            beginningCash: true,
            receiptsMtd: true,
            disbursementsMtd: true,
            endingCash: true,
            investmentBalance: true,
            restrictedCash: true,
            unrestrictedCash: true,
          },
        })
      : Promise.resolve([]),

    openingVersion
      ? db.openingFundBalance.aggregate({
          where: { versionId: openingVersion, ...fund },
          _sum: {
            begTotal: true,
            begUnassigned: true,
            begNonspendable: true,
            begRestricted: true,
            begCommitted: true,
            begAssigned: true,
          },
        })
      : Promise.resolve(null),

    expBudgetVersion
      ? db.budgetLine.aggregate({
          where: { versionId: expBudgetVersion, kind: "EXPENDITURE", ...fund },
          _sum: { amount: true },
        })
      : Promise.resolve(null),

    revBudgetVersion
      ? db.budgetLine.aggregate({
          where: { versionId: revBudgetVersion, kind: "REVENUE", ...fund },
          _sum: { amount: true },
        })
      : Promise.resolve(null),
  ]);

  const index = <T extends { versionId: string }>(rows: T[], map: Map<string, number>) => {
    const out = new Map<number, T>();
    for (const r of rows) {
      const p = map.get(r.versionId);
      if (p !== undefined) out.set(p, r);
    }
    return out;
  };

  const rev = index(revenue, revenueByPeriod);
  const exp = index(spending, spendByPeriod);
  const csh = index(cash, cashByPeriod);

  const openingTotals =
    opening && opening._sum.begTotal !== null
      ? {
          total: opening._sum.begTotal ?? ZERO,
          unassigned: opening._sum.begUnassigned ?? ZERO,
          nonspendable: opening._sum.begNonspendable ?? ZERO,
          restricted: opening._sum.begRestricted ?? ZERO,
          committed: opening._sum.begCommitted ?? ZERO,
          assigned: opening._sum.begAssigned ?? ZERO,
        }
      : null;

  const points: PeriodPoint[] = [];
  for (let period = 1; period <= through; period++) {
    const r = rev.get(period);
    const e = exp.get(period);
    const c = csh.get(period);

    const revenueYtd = r?._sum.actualYtd ?? ZERO;
    const expenditureYtd = e?._sum.actualYtd ?? ZERO;
    const hasData = Boolean(r || e || c);

    // Beginning + all revenue − all expenditure. The transfer classification cancels out
    // of this line entirely — see the derivation in lib/finance/fund-balance.ts.
    const fundBalance = openingTotals
      ? openingTotals.total.plus(revenueYtd).minus(expenditureYtd)
      : null;
    const unassignedFundBalance = openingTotals
      ? openingTotals.unassigned.plus(revenueYtd).minus(expenditureYtd)
      : null;

    points.push({
      period,
      revenueBudget: r?._sum.budget ?? ZERO,
      revenueMtd: r?._sum.actualMtd ?? ZERO,
      revenueYtd,
      expenditureBudget: e?._sum.budget ?? ZERO,
      expenditureMtd: e?._sum.actualMtd ?? ZERO,
      expenditureYtd,
      encumbrances: e?._sum.encumbrances ?? ZERO,
      beginningCash: c?._sum.beginningCash ?? null,
      receiptsMtd: c?._sum.receiptsMtd ?? null,
      disbursementsMtd: c?._sum.disbursementsMtd ?? null,
      endingCash: c?._sum.endingCash ?? null,
      investmentBalance: c?._sum.investmentBalance ?? null,
      restrictedCash: c?._sum.restrictedCash ?? null,
      unrestrictedCash: c?._sum.unrestrictedCash ?? null,
      // Only meaningful where the period actually reported — otherwise the "balance" is
      // last month's, drawn as though it were this month's.
      fundBalance: hasData ? fundBalance : null,
      unassignedFundBalance: hasData ? unassignedFundBalance : null,
      hasData,
      hasCash: Boolean(c),
    });
  }

  return {
    fiscalYear,
    points,
    opening: openingTotals,
    adoptedExpenditureBudget: expBudget?._sum.amount ?? ZERO,
    adoptedRevenueBudget: revBudget?._sum.amount ?? ZERO,
  };
}

/** The point for one period, or null when that period reported nothing. */
export function pointAt(series: YearSeries, period: number): PeriodPoint | null {
  const p = series.points.find((x) => x.period === period);
  return p && p.hasData ? p : null;
}

/**
 * The most recent period BEFORE `period` that actually has data.
 *
 * Every month-over-month figure goes through this rather than assuming `period - 1`. A
 * district that skipped September should compare October to August and say so, not report
 * a change against a month of zeros.
 */
export function previousPoint(series: YearSeries, period: number): PeriodPoint | null {
  for (let p = period - 1; p >= 1; p--) {
    const point = series.points.find((x) => x.period === p);
    if (point?.hasData) return point;
  }
  return null;
}
