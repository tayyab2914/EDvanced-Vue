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
import { adoptedBudget } from "@/lib/finance/versions";
import { memo, dbKey } from "@/lib/request-cache";
import { fundOnly, soleFundId, narrowsCostCenter, filterKey } from "@/lib/finance/filter";
import type { FundBalanceField } from "@/lib/enums";

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
 * Unassigned fund balance as a share of budgeted general-fund expenditures — the KPI the
 * reserve thresholds compare against (workbook §4.2).
 *
 * Returns null rather than zero when there is no budget: "we cannot work this out yet"
 * and "your reserve is 0%" are very different sentences to show a superintendent.
 */
export const reservePercent = memo("reservePercent", scopeKey, buildReservePercent);

async function buildReservePercent(
  db: TenantDb,
  scope: PeriodScope,
  codes: ActivityCodes,
): Promise<{ percent: Prisma.Decimal | null; unassigned: Prisma.Decimal; budget: Prisma.Decimal }> {
  // Adopted budget, from the annual Expenditure Budget import — the same figure the trend
  // series divides by, resolved through the same shared lookup so the two cannot disagree.
  const [unassigned, adopted] = await Promise.all([
    computeUnassigned(db, scope, codes),
    // Fund-level divisor to match the fund-level numerator above. A reserve percentage
    // whose halves are filtered differently is not a percentage of anything.
    adoptedBudget(db, {
      fiscalYear: scope.fiscalYear,
      kind: "EXPENDITURE",
      filter: fundOnly(scope.filter),
    }),
  ]);

  if (!adopted) {
    return { percent: null, unassigned: unassigned.total, budget: new D(0) };
  }

  const budget = adopted.total;

  if (budget.isZero()) {
    return { percent: null, unassigned: unassigned.total, budget };
  }

  return {
    percent: unassigned.total.dividedBy(budget).times(100),
    unassigned: unassigned.total,
    budget,
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
