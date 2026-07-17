import { Prisma } from "@/lib/generated/prisma/client";
import type { TenantDb } from "@/lib/tenant-db";
import type { ActivityCodes } from "@/lib/finance/transfers";
import { activityTotals, currentVersionIds } from "@/lib/finance/engine";
import { computeUnassigned } from "@/lib/finance/fund-balance";
import { parseFiscalYear, formatFiscalYear } from "@/lib/periods/fiscal";
import type { PolicyValues } from "@/lib/policies/registry";

/**
 * Forecasting: what the year is likely to end at, and what the reserve looks like in
 * three years.
 *
 * Feeds roughly ten of the twenty-seven alerts, which is why it is built before the alert
 * engine rather than after it.
 *
 * Two engines, deliberately separate:
 *
 *   1. YEAR-END PROJECTION — where this fiscal year lands. Straight-line from actuals,
 *      adjusted by the district's own growth assumption per category.
 *   2. MULTI-YEAR FUND BALANCE — the workbook's three-year table. The district types the
 *      components; the platform works out what unassigned is left.
 *
 * Decimal throughout.
 */

const D = Prisma.Decimal;
const ZERO = new D(0);

/**
 * How many periods a fiscal year has. Straight-line projection needs to know how much of
 * the year has actually happened.
 */
const PERIODS_IN_YEAR = 12;

export interface YearEndProjection {
  actualYtd: Prisma.Decimal;
  /** What the year ends at, on current pace and the district's assumption. */
  projected: Prisma.Decimal;
  budget: Prisma.Decimal;
  /** projected − budget. Positive means over budget. */
  variance: Prisma.Decimal;
  /** As a share of budget. Null when there is no budget to be a share of. */
  variancePercent: Prisma.Decimal | null;
  /** How much of the year the actuals cover — the projection's confidence, in effect. */
  periodsElapsed: number;
}

/**
 * Straight-line to year end, then adjusted by the district's assumption.
 *
 *     projected = (actual YTD / periods elapsed) x 12 x (1 + growth%)
 *
 * Straight-line because it is the only honest thing to do with the data a district
 * actually sends. A monthly file carries no seasonality, so a cleverer curve would be
 * inventing information — and the district's own growth assumption is where their real
 * knowledge goes. The workbook agrees: it asks them to type a projected year-end figure
 * per category rather than asking the platform to be smart.
 *
 * Period 0 or no actuals returns the budget, not a division by zero.
 */
export function projectYearEnd(args: {
  actualYtd: Prisma.Decimal;
  budget: Prisma.Decimal;
  periodsElapsed: number;
  growthPercent?: Prisma.Decimal | number | null;
}): YearEndProjection {
  const { actualYtd, budget } = args;
  const elapsed = Math.max(0, Math.min(PERIODS_IN_YEAR, args.periodsElapsed));

  let projected: Prisma.Decimal;
  if (elapsed === 0) {
    // Nothing has happened yet — the budget IS the forecast.
    projected = budget;
  } else {
    const runRate = actualYtd.dividedBy(elapsed).times(PERIODS_IN_YEAR);
    const growth = new D(args.growthPercent ?? 0).dividedBy(100);
    projected = runRate.times(new D(1).plus(growth));
  }

  const variance = projected.minus(budget);
  return {
    actualYtd,
    projected,
    budget,
    variance,
    variancePercent: budget.isZero() ? null : variance.dividedBy(budget).times(100),
    periodsElapsed: elapsed,
  };
}

export interface CategoryProjection extends YearEndProjection {
  categoryId: string;
  categoryName: string;
  monitored: boolean;
}

/**
 * Year-end projection per revenue category, using the district's own growth assumptions.
 *
 * Categories are RevenueTypes — the same global lookup the actuals roll up by, so an
 * assumption and an actual meet without a mapping in between.
 */
export async function projectRevenueByCategory(
  db: TenantDb,
  args: { fiscalYear: string; period: number },
): Promise<CategoryProjection[]> {
  const [versions, assumptions, types] = await Promise.all([
    currentVersionIds(db, { fiscalYear: args.fiscalYear, period: args.period }),
    db.forecastAssumption.findMany({
      where: { fiscalYear: args.fiscalYear, kind: "REVENUE" },
    }),
    db.revenueType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  const revVersion = versions.get("REVENUE_DETAIL");
  if (!revVersion) return [];

  // One grouped query rather than one per category.
  const rows = await db.revenueActual.findMany({
    where: { versionId: revVersion },
    select: {
      actualYtd: true,
      budget: true,
      revenueSource: { select: { revenueTypeId: true } },
    },
  });

  const byType = new Map<string, { ytd: Prisma.Decimal; budget: Prisma.Decimal }>();
  for (const r of rows) {
    const key = r.revenueSource?.revenueTypeId ?? "__none";
    const acc = byType.get(key) ?? { ytd: ZERO, budget: ZERO };
    byType.set(key, { ytd: acc.ytd.plus(r.actualYtd), budget: acc.budget.plus(r.budget) });
  }

  const assumptionOf = new Map(assumptions.map((a) => [a.revenueTypeId ?? "", a]));

  return types
    .filter((t) => byType.has(t.id))
    .map((t) => {
      const totals = byType.get(t.id)!;
      const a = assumptionOf.get(t.id);
      return {
        categoryId: t.id,
        categoryName: t.name,
        monitored: a?.monitored ?? true,
        ...projectYearEnd({
          actualYtd: totals.ytd,
          budget: totals.budget,
          periodsElapsed: args.period,
          growthPercent: a?.growthPercent ?? 0,
        }),
      };
    });
}

/**
 * Year-end projection per spending category.
 *
 * Where the district typed a projected year-end figure, that IS the projection — their
 * knowledge of what is coming beats our arithmetic on what has been. Otherwise it is
 * straight-lined.
 */
export async function projectExpenditureByCategory(
  db: TenantDb,
  args: { fiscalYear: string; period: number },
): Promise<CategoryProjection[]> {
  const [versions, assumptions, types] = await Promise.all([
    currentVersionIds(db, { fiscalYear: args.fiscalYear, period: args.period }),
    db.forecastAssumption.findMany({
      where: { fiscalYear: args.fiscalYear, kind: "EXPENDITURE" },
    }),
    db.objectType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  const expVersion = versions.get("EXPENDITURE_DETAIL");
  if (!expVersion) return [];

  const rows = await db.expenditureActual.findMany({
    where: { versionId: expVersion },
    select: {
      actualYtd: true,
      budget: true,
      object: { select: { objectTypeId: true } },
    },
  });

  const byType = new Map<string, { ytd: Prisma.Decimal; budget: Prisma.Decimal }>();
  for (const r of rows) {
    const key = r.object?.objectTypeId ?? "__none";
    const acc = byType.get(key) ?? { ytd: ZERO, budget: ZERO };
    byType.set(key, { ytd: acc.ytd.plus(r.actualYtd), budget: acc.budget.plus(r.budget) });
  }

  const assumptionOf = new Map(assumptions.map((a) => [a.objectTypeId ?? "", a]));

  return types
    .filter((t) => byType.has(t.id))
    .map((t) => {
      const totals = byType.get(t.id)!;
      const a = assumptionOf.get(t.id);
      const straight = projectYearEnd({
        actualYtd: totals.ytd,
        budget: totals.budget,
        periodsElapsed: args.period,
      });

      if (a?.projectedYearEnd == null) {
        return { categoryId: t.id, categoryName: t.name, monitored: a?.monitored ?? true, ...straight };
      }

      // The district typed a figure. Use it, and recompute the variance against it.
      const projected = a.projectedYearEnd;
      const variance = projected.minus(totals.budget);
      return {
        categoryId: t.id,
        categoryName: t.name,
        monitored: a.monitored,
        actualYtd: totals.ytd,
        projected,
        budget: totals.budget,
        variance,
        variancePercent: totals.budget.isZero() ? null : variance.dividedBy(totals.budget).times(100),
        periodsElapsed: args.period,
      };
    });
}

export interface FundBalanceForecast {
  fiscalYear: string;
  /** The projected total for the year. */
  total: Prisma.Decimal;
  /** What is left once the district's designated components are taken out. */
  unassigned: Prisma.Decimal;
  /** Unassigned as a share of budgeted expenditure. Null when there is no budget. */
  reservePercent: Prisma.Decimal | null;
  /** True when the components add up to more than the balance — the workbook's own alert. */
  componentsExceedTotal: boolean;
}

/**
 * The workbook's multi-year fund balance table.
 *
 * Year one is this year's projection: beginning balance plus the projected net change.
 * Later years carry forward, because the district's typed components are the only
 * information we have about them — projecting activity three years out from twelve months
 * of actuals would be arithmetic wearing a costume.
 */
export async function projectFundBalance(
  db: TenantDb,
  args: {
    fiscalYear: string;
    period: number;
    fundId: string;
    /** How many years to project, including this one. The workbook shows three. */
    years?: number;
  },
  codes: ActivityCodes,
  policy: PolicyValues,
): Promise<FundBalanceForecast[]> {
  const years = args.years ?? 3;
  const scope = { fiscalYear: args.fiscalYear, period: args.period, fundId: args.fundId };

  const [current, totals, projections, budget] = await Promise.all([
    computeUnassigned(db, scope, codes),
    activityTotals(db, scope, codes),
    db.fundBalanceProjection.findMany({ where: { fundId: args.fundId } }),
    budgetedExpenditure(db, args.fiscalYear, args.fundId),
  ]);

  // Project this year's net change from the pace so far.
  const revenue = projectYearEnd({
    actualYtd: totals.totalRevenueYtd,
    budget: ZERO,
    periodsElapsed: args.period,
  });
  const spend = projectYearEnd({
    actualYtd: totals.totalExpenditureYtd,
    budget: ZERO,
    periodsElapsed: args.period,
  });
  const netChange = revenue.projected.minus(spend.projected);

  const start = parseFiscalYear(args.fiscalYear);
  if (!start) return [];

  const byYear = new Map(projections.map((p) => [p.fiscalYear, p]));
  const out: FundBalanceForecast[] = [];

  // Beginning + this year's projected net change.
  let runningTotal = current.beginning.plus(netChange);

  for (let i = 0; i < years; i++) {
    const fy = formatFiscalYear(start.startYear + i);
    const p = byYear.get(fy);

    const components = [p?.nonspendable, p?.restricted, p?.committed, p?.assigned]
      .filter((v): v is Prisma.Decimal => v != null)
      .reduce((a, b) => a.plus(b), ZERO);

    const unassigned = runningTotal.minus(components);

    out.push({
      fiscalYear: fy,
      total: runningTotal,
      unassigned,
      reservePercent: budget.isZero() ? null : unassigned.dividedBy(budget).times(100),
      // "Projected components add up to more than the projected ending balance, leaving a
      // negative unassigned reserve" — the workbook's own alert, and a real thing to
      // catch: a board can designate more than the fund actually holds.
      componentsExceedTotal: components.greaterThan(runningTotal),
    });

    // Later years carry the balance forward. Without another year of actuals there is
    // nothing honest to add.
    runningTotal = out[out.length - 1].total;
  }

  return out;
}

async function budgetedExpenditure(
  db: TenantDb,
  fiscalYear: string,
  fundId: string,
): Promise<Prisma.Decimal> {
  const version = await db.datasetVersion.findFirst({
    where: { fiscalYear, period: null, isCurrent: true, dataset: "EXPENDITURE_BUDGET" },
  });
  if (!version) return ZERO;

  const agg = await db.budgetLine.aggregate({
    where: { versionId: version.id, kind: "EXPENDITURE", fundId },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? ZERO;
}
