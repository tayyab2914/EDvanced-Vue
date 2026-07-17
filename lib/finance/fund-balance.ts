import { Prisma } from "@/lib/generated/prisma/client";
import type { TenantDb } from "@/lib/tenant-db";
import type { ActivityCodes } from "@/lib/finance/transfers";
import {
  activityTotals,
  beginningFundBalance,
  type ActivityTotals,
  type PeriodScope,
} from "@/lib/finance/engine";
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
}

export async function computeFundBalance(
  db: TenantDb,
  scope: PeriodScope,
  codes: ActivityCodes,
): Promise<FundBalanceResult> {
  const [beginning, activity] = await Promise.all([
    beginningFundBalance(db, { fiscalYear: scope.fiscalYear, fundId: scope.fundId }),
    activityTotals(db, scope, codes),
  ]);

  // Beginning + all revenue − all expenditure. See the derivation above for why the
  // transfer split is not part of this line.
  const computed = beginning.total
    .plus(activity.totalRevenueYtd)
    .minus(activity.totalExpenditureYtd);

  const override = await findOverride(db, scope, "TOTAL");

  return {
    total: override ? override.value : computed,
    computed,
    source: override ? "OVERRIDDEN" : "SYSTEM_CALCULATED",
    override: override ?? undefined,
    beginning: beginning.total,
    activity,
    missingOpeningBalance: !beginning.found,
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
export async function computeUnassigned(
  db: TenantDb,
  scope: PeriodScope,
  codes: ActivityCodes,
): Promise<FundBalanceResult> {
  const [beginning, activity] = await Promise.all([
    beginningFundBalance(db, { fiscalYear: scope.fiscalYear, fundId: scope.fundId }),
    activityTotals(db, scope, codes),
  ]);

  const computed = beginning.unassigned
    .plus(activity.totalRevenueYtd)
    .minus(activity.totalExpenditureYtd);

  const override = await findOverride(db, scope, "UNASSIGNED");

  return {
    total: override ? override.value : computed,
    computed,
    source: override ? "OVERRIDDEN" : "SYSTEM_CALCULATED",
    override: override ?? undefined,
    beginning: beginning.unassigned,
    activity,
    missingOpeningBalance: !beginning.found,
  };
}

/**
 * Unassigned fund balance as a share of budgeted general-fund expenditures — the KPI the
 * reserve thresholds compare against (workbook §4.2).
 *
 * Returns null rather than zero when there is no budget: "we cannot work this out yet"
 * and "your reserve is 0%" are very different sentences to show a superintendent.
 */
export async function reservePercent(
  db: TenantDb,
  scope: PeriodScope,
  codes: ActivityCodes,
): Promise<{ percent: Prisma.Decimal | null; unassigned: Prisma.Decimal; budget: Prisma.Decimal }> {
  const unassigned = await computeUnassigned(db, scope, codes);

  // Adopted budget, from the annual Expenditure Budget import.
  const versions = await db.datasetVersion.findMany({
    where: { fiscalYear: scope.fiscalYear, period: null, isCurrent: true },
    select: { id: true, dataset: true },
  });
  const budgetVersion = versions.find((v) => v.dataset === "EXPENDITURE_BUDGET");

  if (!budgetVersion) {
    return { percent: null, unassigned: unassigned.total, budget: new D(0) };
  }

  const agg = await db.budgetLine.aggregate({
    where: {
      versionId: budgetVersion.id,
      kind: "EXPENDITURE",
      ...(scope.fundId ? { fundId: scope.fundId } : {}),
    },
    _sum: { amount: true },
  });
  const budget = agg._sum.amount ?? new D(0);

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
  // override — the district corrects a fund, not a total.
  if (!scope.fundId) return null;

  const row = await db.fundBalanceOverride.findFirst({
    where: {
      fiscalYear: scope.fiscalYear,
      period: scope.period,
      fundId: scope.fundId,
      field,
    },
  });
  if (!row) return null;

  return {
    value: row.value,
    reason: row.reason,
    at: row.createdAt,
    by: row.overriddenByUserId,
  };
}
