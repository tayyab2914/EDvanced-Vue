import { Prisma } from "@/lib/generated/prisma/client";
import type { TenantDb } from "@/lib/tenant-db";
import type { ActivityCodes } from "@/lib/finance/transfers";
import { activityTotals, currentVersionIds, endingCash } from "@/lib/finance/engine";
import { computeFundBalance, reservePercent } from "@/lib/finance/fund-balance";
import { projectYearEnd } from "@/lib/forecast/engine";
import { loadPolicy } from "@/lib/policies/load";
import type { PolicyValues } from "@/lib/policies/registry";
import {
  ALERTS,
  reserveStatus,
  type AlertFacts,
  type AlertGroup,
  type AlertSeverity,
  type ReserveStatus,
} from "@/lib/alerts/catalog";

/**
 * Gathers the figures, then walks the catalogue.
 *
 * Derived at read, like everything else in the finance layer: nothing is stored, so
 * nothing can go stale, and changing a threshold changes the dashboard on the next
 * refresh rather than on the next import.
 *
 * The most dependent module in the milestone — it needs the activity engine, the
 * thresholds and the forecast. If any of those is missing data, the facts carry null and
 * the alerts stay quiet rather than guessing.
 */

const D = Prisma.Decimal;
const ZERO = new D(0);

export interface Alert {
  id: string;
  group: AlertGroup;
  severity: AlertSeverity;
  title: string;
  message: string;
}

export interface AlertReport {
  alerts: Alert[];
  facts: AlertFacts;
  policy: PolicyValues;
  reserveStatus: ReserveStatus | null;
  /** Critical first — a district reads the top of the list. */
  criticalCount: number;
  warningCount: number;
}

export async function evaluateAlerts(
  db: TenantDb,
  scope: { districtId: string; fiscalYear: string; period: number; fundId?: string },
  codes: ActivityCodes,
): Promise<AlertReport> {
  const policy = await loadPolicy(db, scope.districtId);
  const facts = await gatherFacts(db, scope, codes);

  const alerts: Alert[] = [];
  for (const def of ALERTS) {
    const hit = def.evaluate(facts, policy);
    if (!hit) continue;
    alerts.push({
      id: def.id,
      group: def.group,
      title: def.title,
      severity: hit.severity,
      message: hit.message,
    });
  }

  alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "CRITICAL" ? -1 : 1));

  return {
    alerts,
    facts,
    policy,
    reserveStatus: reserveStatus(facts.reservePercent, policy),
    criticalCount: alerts.filter((a) => a.severity === "CRITICAL").length,
    warningCount: alerts.filter((a) => a.severity === "WARNING").length,
  };
}

/**
 * Everything the catalogue can ask about, for one period.
 *
 * A figure that cannot be worked out is null, never zero. "We don't have last month's
 * file" and "spending didn't move" are different facts, and only one of them should keep
 * an alert quiet.
 */
export async function gatherFacts(
  db: TenantDb,
  scope: { fiscalYear: string; period: number; fundId?: string },
  codes: ActivityCodes,
): Promise<AlertFacts> {
  const [totals, cash, fb, reserve, budgets, previous] = await Promise.all([
    activityTotals(db, scope, codes),
    endingCash(db, scope),
    computeFundBalance(db, scope, codes),
    reservePercent(db, scope, codes),
    currentBudgets(db, scope),
    // The month before, for the month-over-month alerts. Period 1 has no predecessor.
    scope.period > 1
      ? activityTotals(db, { ...scope, period: scope.period - 1 }, codes)
      : Promise.resolve(null),
  ]);

  const revenueYtd = totals.totalRevenueYtd;
  const expenditureYtd = totals.totalExpenditureYtd;

  /**
   * Revenue variance is YTD against the budget EXPECTED BY NOW — not against the whole
   * year's.
   *
   * The budget on a monthly detail row is the full-year figure, so comparing two months of
   * collections to it says "87% below budget" every August, for every district, forever.
   * A threshold that fires unconditionally is not a threshold. Pro-rating is what makes
   * "are we on pace?" answerable in month two, and it is also what leaves the separate
   * Forecast Variance setting a distinct job to do.
   *
   * ASSUMPTION worth confirming with Gary: the workbook says only "actual revenue is off
   * budget by 5%" and does not say against what. Pro-rated is the only reading under which
   * the setting means anything month to month — but straight-line pro-rating has no
   * seasonality, and a Florida district collecting ad valorem in November genuinely does
   * look behind in August.
   */
  const expectedRevenue = budgets.revenue.times(scope.period).dividedBy(12);
  const revenueVariancePercent = expectedRevenue.isZero()
    ? null
    : revenueYtd.minus(expectedRevenue).dividedBy(expectedRevenue).times(100);

  const utilizationPercent = budgets.expenditure.isZero()
    ? null
    : expenditureYtd.plus(budgets.encumbrances).dividedBy(budgets.expenditure).times(100);

  // Straight-line, the same engine the forecast dashboards use — so a district cannot see
  // one number on the forecast screen and a different one behind an alert.
  const revenueForecast = projectYearEnd({
    actualYtd: revenueYtd,
    budget: budgets.revenue,
    periodsElapsed: scope.period,
  });
  const expenditureForecast = projectYearEnd({
    actualYtd: expenditureYtd,
    budget: budgets.expenditure,
    periodsElapsed: scope.period,
  });

  const momChange = (now: Prisma.Decimal, before: Prisma.Decimal | null) => {
    if (before === null || before.isZero()) return null;
    return now.minus(before).dividedBy(before).times(100);
  };

  // MTD, not YTD. Year-to-date only ever rises, so comparing this month's YTD to last
  // month's would report growth every month of the year — an earlier version of this file
  // did exactly that and reported spending "jumped 117.6%" between July and August, which
  // is just what YTD does.
  const prevRevenue = previous ? previous.totalRevenueMtd : null;
  const prevExpenditure = previous ? previous.totalExpenditureMtd : null;

  const cashDecreasePercent = await monthOverMonthCashDrop(db, scope);

  return {
    revenueBudget: budgets.revenue,
    revenueYtd,
    revenueVariancePercent,
    revenueForecastVariancePercent: revenueForecast.variancePercent,
    revenueMomChangePercent: momChange(totals.totalRevenueMtd, prevRevenue),

    expenditureBudget: budgets.expenditure,
    expenditureYtd,
    encumbrances: budgets.encumbrances,
    utilizationPercent,
    availableBudget: budgets.expenditure.minus(expenditureYtd).minus(budgets.encumbrances),
    expenditureForecast: budgets.expenditure.isZero() ? null : expenditureForecast.projected,
    expenditureForecastVariancePercent: expenditureForecast.variancePercent,
    expenditureMomIncreasePercent: momChange(totals.totalExpenditureMtd, prevExpenditure),

    endingCash: cash.total,
    daysCashOnHand: await daysCash(db, scope, cash.total),
    // Cash forecasting needs a trend the platform does not have from one period; the
    // workbook's forecast-cash alert lands when the dashboards do.
    forecastCash: null,
    cashDecreasePercent,

    reservePercent: reserve.percent,
    // Needs the multi-year projection, which is per-fund and lives on its own screen.
    forecastReservePercent: null,
    changeInFundBalance: fb.total.minus(fb.beginning),
    componentsExceedTotal: false,
  };
}

/** Budget and encumbrances for the period, from the current versions. */
async function currentBudgets(
  db: TenantDb,
  scope: { fiscalYear: string; period: number; fundId?: string },
): Promise<{ revenue: Prisma.Decimal; expenditure: Prisma.Decimal; encumbrances: Prisma.Decimal }> {
  const versions = await currentVersionIds(db, {
    fiscalYear: scope.fiscalYear,
    period: scope.period,
  });
  const fund = scope.fundId ? { fundId: scope.fundId } : {};

  const revVersion = versions.get("REVENUE_DETAIL");
  const expVersion = versions.get("EXPENDITURE_DETAIL");

  const [rev, exp] = await Promise.all([
    revVersion
      ? db.revenueActual.aggregate({
          where: { versionId: revVersion, ...fund },
          _sum: { budget: true },
        })
      : null,
    expVersion
      ? db.expenditureActual.aggregate({
          where: { versionId: expVersion, ...fund },
          _sum: { budget: true, encumbrances: true },
        })
      : null,
  ]);

  return {
    // The Budget column on the monthly detail IS the current/revised budget.
    revenue: rev?._sum.budget ?? ZERO,
    expenditure: exp?._sum.budget ?? ZERO,
    encumbrances: exp?._sum.encumbrances ?? ZERO,
  };
}

/**
 * Days Cash on Hand = Ending Cash / Average Daily Expenditures, where average daily is
 * the annual ADOPTED budget over 365 (workbook §4.3).
 *
 * The adopted budget, not the year's spend so far: dividing by actuals would make a
 * district that has barely started the year look like it has a decade of cash.
 */
async function daysCash(
  db: TenantDb,
  scope: { fiscalYear: string; fundId?: string },
  cash: Prisma.Decimal,
): Promise<Prisma.Decimal | null> {
  const version = await db.datasetVersion.findFirst({
    where: {
      fiscalYear: scope.fiscalYear,
      period: null,
      isCurrent: true,
      dataset: "EXPENDITURE_BUDGET",
    },
  });
  if (!version) return null;

  const agg = await db.budgetLine.aggregate({
    where: {
      versionId: version.id,
      kind: "EXPENDITURE",
      ...(scope.fundId ? { fundId: scope.fundId } : {}),
    },
    _sum: { amount: true },
  });
  const annual = agg._sum.amount ?? ZERO;
  if (annual.isZero()) return null;

  const perDay = annual.dividedBy(365);
  return cash.dividedBy(perDay);
}

/** How far cash fell against last month, as a positive percentage. Null if it rose. */
async function monthOverMonthCashDrop(
  db: TenantDb,
  scope: { fiscalYear: string; period: number; fundId?: string },
): Promise<Prisma.Decimal | null> {
  if (scope.period <= 1) return null;
  const [now, before] = await Promise.all([
    endingCash(db, scope),
    endingCash(db, { ...scope, period: scope.period - 1 }),
  ]);
  if (!now.found || !before.found || before.total.isZero()) return null;

  const drop = before.total.minus(now.total);
  if (!drop.isPositive()) return null;
  return drop.dividedBy(before.total).times(100);
}
