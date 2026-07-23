import { Prisma } from "@/lib/generated/prisma/client";
import type { TenantDb } from "@/lib/tenant-db";
import type { ActivityCodes } from "@/lib/finance/transfers";
import { activityTotals, currentVersionIds } from "@/lib/finance/engine";
import { computeUnassigned } from "@/lib/finance/fund-balance";
import { parseFiscalYear, formatFiscalYear } from "@/lib/periods/fiscal";

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
  /** 0 is the current year; 1..n are the projected ones. */
  index: number;

  // ---- the planning view (Spec §6.2 card 2: "Can we balance the budget?") ----
  projectedRevenue: Prisma.Decimal;
  projectedExpenditure: Prisma.Decimal;
  /** Revenue − expenditure. Negative means fund balance is needed to balance the budget. */
  netChange: Prisma.Decimal;
  /** How much fund balance this year consumes. Zero in a surplus year. */
  fundBalanceUsed: Prisma.Decimal;
  /** Running total of `fundBalanceUsed` — how much reserve the plan spends in total. */
  cumulativeFundBalanceUsed: Prisma.Decimal;
  /** fundBalanceUsed as a share of the year's revenue. Null when there is no revenue. */
  fundBalanceUsedPercentOfRevenue: Prisma.Decimal | null;

  // ---- the financial health view (Spec §6.2 card 3: "Will our reserves remain healthy?") ----
  beginning: Prisma.Decimal;
  /** Beginning + net change. */
  total: Prisma.Decimal;
  /** Nonspendable + restricted + committed + assigned, as the district typed them. */
  components: Prisma.Decimal;
  /** What is left once the district's designated components are taken out. */
  unassigned: Prisma.Decimal;
  /** Unassigned as a share of that year's projected expenditure. Null when there is none. */
  reservePercent: Prisma.Decimal | null;
  /** True when the components add up to more than the balance — the workbook's own alert. */
  componentsExceedTotal: boolean;
}

/**
 * A district's annual growth assumptions, as two numbers.
 *
 * The reference forecast screen (§6.2 card 1) asks for exactly two rates — revenue growth
 * and expenditure growth — for the whole district, while `ForecastAssumption` stores
 * assumptions PER CATEGORY. Both readings are legitimate: the workbook asks per category,
 * the screen asks for one number.
 *
 * They are reconciled without a schema change. The compound unique on ForecastAssumption
 * is `(districtId, fiscalYear, kind, revenueTypeId, objectTypeId)`, and a row with NO
 * category is a legal member of that key. So the district-level rate is simply the
 * assumption that names no category, and the per-category rows carry on meaning what they
 * always meant.
 */
export interface GrowthAssumptions {
  revenuePercent: Prisma.Decimal | null;
  expenditurePercent: Prisma.Decimal | null;
}

export async function districtGrowth(
  db: TenantDb,
  fiscalYear: string,
): Promise<GrowthAssumptions> {
  const rows = await db.forecastAssumption.findMany({
    where: { fiscalYear, revenueTypeId: null, objectTypeId: null },
    select: { kind: true, growthPercent: true },
  });

  return {
    revenuePercent: rows.find((r) => r.kind === "REVENUE")?.growthPercent ?? null,
    expenditurePercent: rows.find((r) => r.kind === "EXPENDITURE")?.growthPercent ?? null,
  };
}

/**
 * The workbook's multi-year fund balance table, and the planning table above it.
 *
 * Year 0 is this year, projected from the pace so far. Later years grow revenue and
 * spending by the district's own annual assumptions and carry the balance forward:
 *
 *     revenue[i]      = revenue[i-1]      x (1 + revenueGrowth)
 *     expenditure[i]  = expenditure[i-1]  x (1 + expenditureGrowth)
 *     beginning[i]    = ending[i-1]
 *     ending[i]       = beginning[i] + revenue[i] − expenditure[i]
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS REPLACES, AND WHY IT MATTERED
 *
 * The previous loop ended with `runningTotal = out[out.length - 1].total`, which
 * re-assigns the value just pushed. The balance therefore never moved: every projected
 * year reported the same total, and the only thing that could vary between them was the
 * district's typed components.
 *
 * That made three things structurally impossible rather than merely wrong. §6.2's
 * "PROJECTED 3-YEAR CHANGE" card was always exactly $0; its "PROJECTED LOWEST POINT" could
 * only ever be year one; and the forecast trend line was flat by construction. A district
 * heading for trouble in three years would have been shown a level line.
 *
 * The old comment defended it — "without another year of actuals there is nothing honest
 * to add". That is true of ACTUALS, and it is why the growth rates are the district's own
 * assumptions rather than something the platform infers. But carrying a balance forward
 * unchanged is not the neutral choice it looks like: it asserts that revenue and spending
 * are exactly equal every year, which is a forecast, and a very optimistic one.
 * ---------------------------------------------------------------------------
 *
 * A district that has entered no growth assumptions gets 0% on both, which reproduces the
 * old flat behaviour — but visibly, as an assumption they can see and change, rather than
 * as a property of the code.
 */
export async function projectFundBalance(
  db: TenantDb,
  args: {
    fiscalYear: string;
    period: number;
    fundId: string;
    /** How many years to project, including this one. The workbook shows three. */
    years?: number;
    /** Overrides the stored assumptions — the forecast screen's live "what if". */
    growth?: GrowthAssumptions;
  },
  codes: ActivityCodes,
): Promise<FundBalanceForecast[]> {
  const years = args.years ?? 3;
  const scope = { fiscalYear: args.fiscalYear, period: args.period, fundId: args.fundId };

  const [current, totals, projections, stored] = await Promise.all([
    computeUnassigned(db, scope, codes),
    activityTotals(db, scope, codes),
    db.fundBalanceProjection.findMany({ where: { fundId: args.fundId } }),
    args.growth ? Promise.resolve(args.growth) : districtGrowth(db, args.fiscalYear),
  ]);

  const start = parseFiscalYear(args.fiscalYear);
  if (!start) return [];

  const growth = args.growth ?? stored;
  const revenueRate = new D(growth.revenuePercent ?? 0).dividedBy(100);
  const spendRate = new D(growth.expenditurePercent ?? 0).dividedBy(100);

  // This year, straight-lined from the pace so far. Budget ZERO because we want the
  // projection itself, not its variance against a budget.
  let revenue = projectYearEnd({
    actualYtd: totals.totalRevenueYtd,
    budget: ZERO,
    periodsElapsed: args.period,
  }).projected;
  let expenditure = projectYearEnd({
    actualYtd: totals.totalExpenditureYtd,
    budget: ZERO,
    periodsElapsed: args.period,
  }).projected;

  const byYear = new Map(projections.map((p) => [p.fiscalYear, p]));
  const out: FundBalanceForecast[] = [];

  let beginning = current.beginning;
  let cumulativeUsed = ZERO;

  for (let i = 0; i < years; i++) {
    if (i > 0) {
      revenue = revenue.times(new D(1).plus(revenueRate));
      expenditure = expenditure.times(new D(1).plus(spendRate));
    }

    const fy = formatFiscalYear(start.startYear + i);
    const p = byYear.get(fy);

    const netChange = revenue.minus(expenditure);
    const total = beginning.plus(netChange);

    // Fund balance "used" is the deficit, and only the deficit. A surplus year adds to
    // reserves rather than using them, and reporting a negative "used" would read as the
    // district having recovered money it never spent.
    const used = netChange.isNegative() ? netChange.abs() : ZERO;
    cumulativeUsed = cumulativeUsed.plus(used);

    const components = [p?.nonspendable, p?.restricted, p?.committed, p?.assigned]
      .filter((v): v is Prisma.Decimal => v != null)
      .reduce((a, b) => a.plus(b), ZERO);

    const unassigned = total.minus(components);

    out.push({
      fiscalYear: fy,
      index: i,
      projectedRevenue: revenue,
      projectedExpenditure: expenditure,
      netChange,
      fundBalanceUsed: used,
      cumulativeFundBalanceUsed: cumulativeUsed,
      fundBalanceUsedPercentOfRevenue: revenue.isZero()
        ? null
        : used.dividedBy(revenue).times(100),
      beginning,
      total,
      components,
      unassigned,
      // Against THIS year's projected expenditure, not the current year's budget. Holding
      // the divisor flat while the numerator moves makes a reserve percentage that drifts
      // for a reason no district could explain.
      reservePercent: expenditure.isZero() ? null : unassigned.dividedBy(expenditure).times(100),
      // "Projected components add up to more than the projected ending balance, leaving a
      // negative unassigned reserve" — the workbook's own alert, and a real thing to
      // catch: a board can designate more than the fund actually holds.
      componentsExceedTotal: components.greaterThan(total),
    });

    beginning = total;
  }

  return out;
}

// `budgetedExpenditure` lived here and is gone. It supplied ONE divisor — the current
// year's adopted budget — for every projected year's reserve percentage, which held
// expenditures flat across three years while the balance moved. Each year now divides by
// its own projected expenditure, which is both the right denominator and one query fewer.
