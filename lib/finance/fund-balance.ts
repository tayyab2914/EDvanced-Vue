import { Prisma } from "@/lib/generated/prisma/client";
import type { TenantDb } from "@/lib/tenant-db";
import type { ActivityCodes } from "@/lib/finance/transfers";
import { codesKey } from "@/lib/finance/transfers";
import {
  activityTotals,
  beginningFundBalance,
  type ActivityTotals,
  type PeriodScope,
} from "@/lib/finance/engine";
import { adoptedBudget, currentBudgets } from "@/lib/finance/versions";
import { memo, dbKey } from "@/lib/request-cache";
import { fundOnly, soleFundId, narrowsCostCenter, filterKey } from "@/lib/finance/filter";
import type { FundBalanceField, ReserveBasis, ReserveDenominator } from "@/lib/enums";

/**
 * System Calculated fund balance.
 *
 * The workbook's formula:
 *
 *     Current Fund Balance = Beginning Fund Balance
 *                          + Revenues YTD
 *                          + Transfers In YTD
 *                          − Expenditures YTD
 *                          − Transfers Out YTD
 *                          ± Other Financing Activity
 *
 * ---------------------------------------------------------------------------
 * WHY THIS DOES NOT NEED THE TRANSFER CODES
 *
 * It was assumed during planning that the balance was unbuildable until the client sent
 * the transfer object codes, and that it would have to ship behind a "provisional" banner
 * until then. Working the algebra through, that is wrong.
 *
 * Transfers arrive INSIDE the revenue and expenditure files — Transfers In and Other
 * Financing as revenue objects, Transfers Out as an expense object. So:
 *
 *     Revenue_all      = Revenue_operating + TransfersIn + OtherFinancing
 *     Expenditure_all  = Expenditure_operating + TransfersOut
 *
 * Substitute into the workbook's formula:
 *
 *     Beginning + Rev_op + TIn − Exp_op − TOut + OFS
 *   = Beginning + (Rev_all − TIn − OFS) + TIn − (Exp_all − TOut) − TOut + OFS
 *   = Beginning + Rev_all − Exp_all
 *
 * The classification cancels out completely. The balance is Beginning + every revenue
 * row − every expenditure row, and that total is the same whether or not we can tell a
 * transfer from a sale.
 *
 * So System Calculated fund balance ships COMPLETE today, and is correct.
 *
 * What genuinely needs the codes is the figures that EXCLUDE transfers — the dashboard's
 * Net Operating Surplus above all. Without them, money a district moved between its own
 * funds reads as earned or spent. That is where the provisional banner belongs, in M3,
 * and not here.
 * ---------------------------------------------------------------------------
 *
 * Kept pluggable: an Import Monthly source (the deferred snapshot importer) drops in
 * behind this same result shape without any caller changing.
 */

const D = Prisma.Decimal;

export type FundBalanceSource = "SYSTEM_CALCULATED" | "OVERRIDDEN";

export interface FundBalanceResult {
  /** The figure to show. Overridden when a District Admin corrected it. */
  total: Prisma.Decimal;
  /** What the platform derived, always — kept even when an override wins, so the UI can show both. */
  computed: Prisma.Decimal;
  source: FundBalanceSource;
  override?: {
    value: Prisma.Decimal;
    reason: string;
    at: Date;
    by: string;
  };
  /** The workings, for the drill-down. */
  beginning: Prisma.Decimal;
  activity: ActivityTotals;
  /**
   * True when no Opening Fund Balance has been imported for the year.
   *
   * This — not the transfer codes — is what actually makes a balance incomplete. Without
   * a starting point the "balance" is only the year's net change, which is a different
   * number wearing the same label.
   */
  missingOpeningBalance: boolean;
  /**
   * True when the page asked for a cost-centre slice and this figure is FUND-level anyway.
   *
   * See `balanceScope` below for why it has to be. The page badges it rather than showing a
   * fund-level balance beside department-level spending as though the two matched.
   */
  fundLevelOnly: boolean;
}

/**
 * The cache key every figure in this module shares: the district, the period, the fund —
 * and the classification, because `NO_CODES` and a live one are genuinely different
 * answers on the same scope.
 */
const scopeKey = (db: TenantDb, scope: PeriodScope, codes: ActivityCodes) => {
  const k = dbKey(db);
  return k === null
    ? null
    : `${k}|${scope.fiscalYear}|${scope.period}|${filterKey(scope.filter)}|${codesKey(codes)}`;
};

/**
 * A FUND BALANCE IS ALWAYS A FUND-LEVEL FIGURE. THIS IS WHERE THAT IS ENFORCED.
 *
 * The formula is `beginning + revenue − expenditure`. Revenue and expenditure carry a cost
 * centre; the beginning balance does not, and cannot — `OpeningFundBalance` is one row per
 * fund because that is the grain a district closes its books at.
 *
 * So under a cost-centre filter the three terms do not agree, and honouring the filter on
 * the two that can would subtract one department's spending from the whole district's
 * opening balance. The result looks like a balance, is in the right order of magnitude, and
 * is not a quantity that exists. Dropping the cost-centre half of the filter and saying so
 * is the only honest option: the number is then a real fund balance for a real set of
 * funds, and `fundLevelOnly` tells the page to badge it.
 */
const balanceScope = (scope: PeriodScope): PeriodScope => ({
  ...scope,
  filter: fundOnly(scope.filter),
});

export const computeFundBalance = memo("computeFundBalance", scopeKey, buildFundBalance);

async function buildFundBalance(
  db: TenantDb,
  scope: PeriodScope,
  codes: ActivityCodes,
): Promise<FundBalanceResult> {
  const level = balanceScope(scope);
  const [beginning, activity] = await Promise.all([
    beginningFundBalance(db, { fiscalYear: level.fiscalYear, filter: level.filter }),
    activityTotals(db, level, codes),
  ]);

  // Beginning + all revenue − all expenditure. See the derivation above for why the
  // transfer split is not part of this line.
  const computed = beginning.total
    .plus(activity.totalRevenueYtd)
    .minus(activity.totalExpenditureYtd);

  const override = await findOverride(db, level, "TOTAL");

  return {
    total: override ? override.value : computed,
    computed,
    source: override ? "OVERRIDDEN" : "SYSTEM_CALCULATED",
    override: override ?? undefined,
    beginning: beginning.total,
    activity,
    missingOpeningBalance: !beginning.found,
    fundLevelOnly: narrowsCostCenter(scope.filter),
  };
}

/**
 * Unassigned fund balance — the reserve figure every threshold in the workbook is built
 * on.
 *
 * Beginning unassigned plus the year's net change. The components other than unassigned
 * (restricted, committed, assigned) do not move on their own during the year: a district
 * re-designates them by board action, which arrives as a new Opening Fund Balance or as
 * an override — never as a side effect of monthly activity.
 */
export const computeUnassigned = memo("computeUnassigned", scopeKey, buildUnassigned);

async function buildUnassigned(
  db: TenantDb,
  scope: PeriodScope,
  codes: ActivityCodes,
): Promise<FundBalanceResult> {
  const level = balanceScope(scope);
  const [beginning, activity] = await Promise.all([
    beginningFundBalance(db, { fiscalYear: level.fiscalYear, filter: level.filter }),
    activityTotals(db, level, codes),
  ]);

  const computed = beginning.unassigned
    .plus(activity.totalRevenueYtd)
    .minus(activity.totalExpenditureYtd);

  const override = await findOverride(db, level, "UNASSIGNED");

  return {
    total: override ? override.value : computed,
    computed,
    source: override ? "OVERRIDDEN" : "SYSTEM_CALCULATED",
    override: override ?? undefined,
    beginning: beginning.unassigned,
    activity,
    missingOpeningBalance: !beginning.found,
    fundLevelOnly: narrowsCostCenter(scope.filter),
  };
}

/**
 * ===========================================================================
 * THE RESERVE PERCENTAGE — what it measures, and against what.
 * ===========================================================================
 *
 * This is the KPI every fund-balance threshold in the product compares against, and it
 * changed shape in M6. Both halves of the fraction moved, so both are explained here.
 *
 * ---------------------------------------------------------------------------
 * THE NUMERATOR: PROJECTED ENDING UNASSIGNED, NOT TODAY'S
 *
 * It used to be the balance as it stood in the scoped month: opening plus revenue and
 * spending to date. That is a real quantity, but it is not the one a board governs by.
 * A district's question in October is "where will we finish?", and the answer is:
 *
 *     projected ending balance = beginning fund balance
 *                              + amended revenue budget
 *                              − amended expenditure budget
 *
 * The beginning balance is FIXED for the whole year — it is last year's audited ending
 * balance, entered once at setup. What moves is the budget. A district that adopts $513M of
 * revenue against $563M of spending projects a $27M ending balance in July; when the board
 * amends revenue to $514M in October without raising appropriations, the October upload
 * carries the new figure and the projection becomes $28M on its own.
 *
 * DELIBERATELY NOT A TREND PROJECTION. Actual collections and spending do not move this
 * number at all. That is the district's specification, not an omission: the projection a
 * board is accountable for is the one it voted for, and a statistical extrapolation from
 * two months of receipts is a different claim wearing the same label. The run-rate answer
 * still exists and is still worth showing — it is what lib/forecast/engine.ts computes, on
 * its own screen, which is precisely why the two must not be merged.
 *
 * ---------------------------------------------------------------------------
 * THE DENOMINATOR: REVENUE, BY DEFAULT
 *
 * Florida's s. 1011.051 states its reserve triggers as a share of general fund REVENUES.
 * Measuring against expenditures — which is what this did before, and what many states do —
 * gives a district a number it cannot reconcile to the one the state holds it to. So the
 * divisor is the district's setting (lib/policies/registry.ts), defaulting to REVENUE, and
 * only the divisor moves: the projected-ending numerator above is the right numerator on
 * either basis.
 *
 * ---------------------------------------------------------------------------
 * PROJECTED WHILE THE YEAR RUNS, ACTUAL ONCE IT IS IN
 *
 * At the year's final period the projection and the outcome are the same reading, so that
 * is where the basis flips: the numerator becomes the balance actually reached and the
 * divisor becomes the revenue actually collected. A district that budgeted conservatively
 * and finished at $77M against $447M collected reads 17.23% — not the 5.26% its budget
 * implied — and prior fiscal years, which a district always views at their final period,
 * therefore read as actuals with no year-close workflow in the way.
 *
 * That workflow (an explicit "close the books" action, and the ability to re-open) is a
 * later phase. `usesActualOutturn` below is the single place this rule is decided, so it is
 * also the single place that changes when the explicit control lands.
 * ---------------------------------------------------------------------------
 */

/** A monthly fiscal year's last period. Districts on other calendars still close at 12. */
const FINAL_PERIOD = 12;

/**
 * Whether the scoped period is far enough through the year that the figures ARE the outturn.
 *
 * See the header above. Exported because the captions have to say which of the two a
 * reader is looking at, and a screen inferring it separately is how a tile ends up labelled
 * "projected" beside a figure that is not.
 */
export function usesActualOutturn(period: number): boolean {
  return period >= FINAL_PERIOD;
}

export interface ReserveOptions {
  /** What the percentage is a percentage of. From `reserveBasis(policy)`. */
  basis: ReserveBasis;
  /** The statutory floor carved out of unassigned. From `requiredReservePercent(policy)`. */
  requiredPercent: number;
}

export interface ReserveResult {
  /**
   * Unassigned as a share of the basis figure. Null rather than zero when there is no
   * divisor — "we cannot work this out yet" and "your reserve is 0%" are very different
   * sentences to show a superintendent.
   */
  percent: Prisma.Decimal | null;
  /** The numerator: projected ending unassigned, or the actual once the year is in. */
  unassigned: Prisma.Decimal;
  /** The divisor. Kept named `budget` because every existing caller reads it by that name. */
  budget: Prisma.Decimal;
  basis: ReserveBasis;
  /** Precisely which figure the divisor is, so a caption can say so. */
  denominator: ReserveDenominator;
  /** True when these are outturn figures rather than a projection. */
  actual: boolean;
  /** The ending TOTAL balance the unassigned share is part of. */
  endingTotal: Prisma.Decimal;
  /** The beginning balance the projection starts from — fixed for the year. */
  beginning: Prisma.Decimal;
  /**
   * The two budget figures the projection is built from, stated rather than implied.
   *
   * `budget` above is the DIVISOR, which is only the revenue budget when the district is on
   * the revenue basis — an expenditure-basis district's divisor is the adopted expenditure
   * budget, and neither is the pair that makes up the numerator. These two always are.
   *
   * They exist because the projection was the one figure on the screen a finance officer
   * could not check: `beginning` and the ending balance were shown, the two figures between
   * them were not, and validating the arithmetic meant opening the Revenue and Expenditure
   * dashboards to read the budget off each. Both are already in hand here — no query.
   */
  budgetedRevenue: Prisma.Decimal;
  budgetedExpenditure: Prisma.Decimal;
  /** Actual revenue and expenditure YTD at the scoped period — what the outturn is built from. */
  actualRevenue: Prisma.Decimal;
  actualExpenditure: Prisma.Decimal;
  /**
   * The unassigned share of that beginning balance.
   *
   * Exposed because the TREND projection needs it: lib/alerts/engine.ts builds a run-rate
   * year-end reserve beside this budget-driven one, and reconstructing the starting point
   * by subtracting the budgeted change back off `unassigned` would silently go wrong under
   * a cost-centre filter, where the two are scoped differently.
   */
  beginningUnassigned: Prisma.Decimal;
  /** `requiredPercent`% of the divisor — the district's "Required Reserve (3%)" line. */
  required: Prisma.Decimal;
  /**
   * Unassigned above the required reserve. NEGATIVE when the district is short of the
   * statutory floor, which is the state the reserve alerts exist for — the screen renders
   * that case as a shortfall rather than as a negative surplus.
   */
  excess: Prisma.Decimal;
  requiredPercent: number;
  /** True when no Opening Fund Balance was imported; the figure is only the year's change. */
  missingOpeningBalance: boolean;
  fundLevelOnly: boolean;
}

/**
 * The memo key carries the OPTIONS as well as the scope.
 *
 * Two districts' worth of settings can meet inside one render — the reserve is computed for
 * the General Fund while a page is scoped elsewhere — and a basis or a required percentage
 * that changed between calls is genuinely a different answer on the same scope. Leaving
 * them out of the key is how a cache returns an expenditure-basis figure to a screen
 * captioned for revenue.
 */
const reserveKey = (
  db: TenantDb,
  scope: PeriodScope,
  codes: ActivityCodes,
  opts: ReserveOptions,
) => {
  const k = scopeKey(db, scope, codes);
  return k === null ? null : `${k}|${opts.basis}|${opts.requiredPercent}`;
};

export const reservePercent = memo("reservePercent", reserveKey, buildReservePercent);

async function buildReservePercent(
  db: TenantDb,
  scope: PeriodScope,
  codes: ActivityCodes,
  opts: ReserveOptions,
): Promise<ReserveResult> {
  const level = balanceScope(scope);
  const actual = usesActualOutturn(scope.period);

  const [beginning, activity, amended] = await Promise.all([
    beginningFundBalance(db, { fiscalYear: level.fiscalYear, filter: level.filter }),
    activityTotals(db, level, codes),
    // The amended budget at FUND level, to match a fund-grain numerator. A reserve
    // percentage whose halves are filtered differently is not a percentage of anything.
    currentBudgets(db, {
      fiscalYear: level.fiscalYear,
      period: level.period,
      filter: level.filter,
    }),
  ]);

  /**
   * The year's net change — budgeted while the year runs, actual once it is in.
   *
   * This one expression is the whole of the numerator change. Everything below it is the
   * same arithmetic the point-in-time balance always did.
   */
  const netChange = actual
    ? activity.totalRevenueYtd.minus(activity.totalExpenditureYtd)
    : amended.revenue.minus(amended.expenditure);

  const endingTotal = beginning.total.plus(netChange);
  const unassigned = beginning.unassigned.plus(netChange);

  const { divisor, denominator } = await resolveDivisor(db, level, opts.basis, actual, {
    amendedRevenue: amended.revenue,
    actualRevenue: activity.totalRevenueYtd,
  });

  const required = divisor.times(opts.requiredPercent).dividedBy(100);

  const shared = {
    unassigned,
    budget: divisor,
    basis: opts.basis,
    denominator,
    actual,
    endingTotal,
    beginning: beginning.total,
    budgetedRevenue: amended.revenue,
    budgetedExpenditure: amended.expenditure,
    actualRevenue: activity.totalRevenueYtd,
    actualExpenditure: activity.totalExpenditureYtd,
    beginningUnassigned: beginning.unassigned,
    required,
    excess: unassigned.minus(required),
    requiredPercent: opts.requiredPercent,
    missingOpeningBalance: !beginning.found,
    fundLevelOnly: narrowsCostCenter(scope.filter),
  };

  if (divisor.isZero()) {
    return { ...shared, percent: null, required: new D(0), excess: unassigned };
  }

  return { ...shared, percent: unassigned.dividedBy(divisor).times(100) };
}

/**
 * Which figure the percentage divides by, and what to call it.
 *
 * The fallback to the ADOPTED revenue budget is not decoration. The amended figure is the
 * Budget column on the monthly detail files, and a district whose export omits that column
 * would otherwise divide by zero and see N/A on a tile it has perfectly good data for. It
 * costs a query only in that degraded case — the common path resolves in the round above
 * and never reaches this await.
 */
async function resolveDivisor(
  db: TenantDb,
  level: PeriodScope,
  basis: ReserveBasis,
  actual: boolean,
  revenue: { amendedRevenue: Prisma.Decimal; actualRevenue: Prisma.Decimal },
): Promise<{ divisor: Prisma.Decimal; denominator: ReserveDenominator }> {
  if (basis === "EXPENDITURE") {
    // Unchanged from before M6, deliberately: a district on the expenditure basis should
    // see exactly the figure it saw last month. The annual adopted budget, fund-level,
    // through the same shared lookup days-cash and the trend series use.
    const adopted = await adoptedBudget(db, {
      fiscalYear: level.fiscalYear,
      kind: "EXPENDITURE",
      filter: fundOnly(level.filter),
    });
    return {
      divisor: adopted?.total ?? new D(0),
      denominator: "ADOPTED_EXPENDITURE",
    };
  }

  if (actual) {
    return { divisor: revenue.actualRevenue, denominator: "ACTUAL_REVENUE" };
  }

  if (!revenue.amendedRevenue.isZero()) {
    return { divisor: revenue.amendedRevenue, denominator: "AMENDED_REVENUE" };
  }

  const adopted = await adoptedBudget(db, {
    fiscalYear: level.fiscalYear,
    kind: "REVENUE",
    filter: fundOnly(level.filter),
  });
  return {
    divisor: adopted?.total ?? new D(0),
    denominator: "ADOPTED_REVENUE",
  };
}

async function findOverride(
  db: TenantDb,
  scope: PeriodScope,
  field: FundBalanceField,
): Promise<{ value: Prisma.Decimal; reason: string; at: Date; by: string } | null> {
  // An override is per fund. Asking for every fund at once has no single figure to
  // override — the district corrects a fund, not a total — and neither does a SET of
  // funds: three funds have three corrections, and applying one of them to their sum
  // would silently misstate the other two.
  const fundId = soleFundId(scope.filter);
  if (!fundId) return null;

  const row = await db.fundBalanceOverride.findFirst({
    where: { fiscalYear: scope.fiscalYear, period: scope.period, fundId, field },
  });
  if (!row) return null;

  return {
    value: row.value,
    reason: row.reason,
    at: row.createdAt,
    by: row.overriddenByUserId,
  };
}
