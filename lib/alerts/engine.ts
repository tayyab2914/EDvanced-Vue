import { Prisma } from "@/lib/generated/prisma/client";
import type { TenantDb } from "@/lib/tenant-db";
import type { ActivityCodes } from "@/lib/finance/transfers";
import { codesKey } from "@/lib/finance/transfers";
import { activityTotals, currentVersionIds, endingCash } from "@/lib/finance/engine";
import { adoptedBudget } from "@/lib/finance/versions";
import { computeFundBalance, reservePercent } from "@/lib/finance/fund-balance";
import { projectYearEnd } from "@/lib/forecast/engine";
import { loadPolicy } from "@/lib/policies/load";
import { memo, dbKey } from "@/lib/request-cache";
import {
  detailWhere,
  fundWhere,
  fundOnly,
  soleFundId,
  filterKey,
  type FinanceFilter,
} from "@/lib/finance/filter";
import type { PolicyValues } from "@/lib/policies/registry";
import { money as fmtMoney } from "@/lib/dashboard/format";
import {
  ALERTS,
  reserveStatus,
  type AlertFacts,
  type AlertGroup,
  type AlertSeverity,
  type ReserveStatus,
} from "@/lib/alerts/catalog";
import {
  attributeAlerts,
  ALERT_LENS,
  type AlertAttribution,
  type FundContribution,
} from "@/lib/alerts/attribution";

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
  /**
   * WHERE to go — the funds carrying most of what this alert is about, biggest first.
   *
   * Empty on a single-fund page, where the scope selector already answers the question, and
   * empty for the reserve alerts, which lib/alerts/attribution.ts deliberately declines to
   * attribute rather than guess at. See that module's header for the whole argument.
   */
  funds: FundContribution[];
}

/**
 * A fact worth stating that no threshold governs — §3.3c's "Informational · For awareness".
 *
 * Deliberately NOT a 25th alert. The catalogue's count of twenty-four is a number in both
 * client documents, and the four groups map to the workbook's own four tables; growing it
 * to make a dashboard tile read better would quietly make those documents wrong.
 *
 * These are observations instead: things true of the period that a finance officer would
 * want to notice, with no threshold behind them and no severity to escalate. "Cash
 * disbursements exceeded receipts this month" is the reference's own example — normal in
 * any month with a bond payment, worth a glance, never an alarm.
 */
export interface Observation {
  id: string;
  title: string;
  message: string;
}

export interface AlertReport {
  alerts: Alert[];
  observations: Observation[];
  facts: AlertFacts;
  policy: PolicyValues;
  reserveStatus: ReserveStatus | null;
  /**
   * The per-fund breakdown behind `Alert.funds`, or null on a single-fund page.
   *
   * Exposed as well as applied so a screen that groups alerts its own way — the §3.3c
   * summary, say — can reach the same figures without re-deriving them.
   */
  attribution: AlertAttribution | null;
  /** Critical first — a district reads the top of the list. */
  criticalCount: number;
  warningCount: number;
  informationalCount: number;
}

export const evaluateAlerts = memo(
  "evaluateAlerts",
  (
    db: TenantDb,
    scope: { districtId: string; fiscalYear: string; period: number; filter?: FinanceFilter },
    codes: ActivityCodes,
  ) => {
    const k = dbKey(db);
    return k === null
      ? null
      : `${k}|${scope.districtId}|${scope.fiscalYear}|${scope.period}|${filterKey(scope.filter)}|${codesKey(codes)}`;
  },
  buildAlertReport,
);

async function buildAlertReport(
  db: TenantDb,
  scope: { districtId: string; fiscalYear: string; period: number; filter?: FinanceFilter },
  codes: ActivityCodes,
): Promise<AlertReport> {
  const policy = await loadPolicy(db, scope.districtId);

  /**
   * The facts and the per-fund attribution, together.
   *
   * The attribution reads none of the facts — it is three grouped aggregates over the same
   * period — so making it wait for the most query-hungry call in the app would add a whole
   * round of database time for nothing.
   *
   * It is skipped entirely when the page is scoped to one fund: the alert already names its
   * own scope there, so a "where to look" line would just repeat the fund selector. That is
   * the client's "this behaviour should automatically adjust when a single fund is
   * selected", and it means the single-fund case pays no queries for the feature at all.
   */
  const [facts, attribution] = await Promise.all([
    gatherFacts(db, scope, codes, {
      ignoreSalaryObjectsMom: policy.expenditure.ignoreSalaryObjectsMom === true,
    }),
    // Skipped on a ONE-fund page only. With several funds selected the "where to look"
    // line is doing more work than it ever did on All Funds — it is the only thing on
    // screen that says which of the three the movement came from.
    //
    // THE FILTER GOES IN. The facts above are computed over `scope.filter`, and for a while
    // this call was not — so a dashboard narrowed to one fund type still listed the funds
    // that filter excludes under every alert. See the header of lib/alerts/attribution.ts.
    soleFundId(scope.filter)
      ? Promise.resolve(null)
      : attributeAlerts(db, {
          fiscalYear: scope.fiscalYear,
          period: scope.period,
          filter: scope.filter,
        }).catch(() => null),
  ]);

  const alerts: Alert[] = [];
  for (const def of ALERTS) {
    const hit = def.evaluate(facts, policy);
    if (!hit) continue;
    const lens = ALERT_LENS[def.id];
    alerts.push({
      id: def.id,
      group: def.group,
      title: def.title,
      severity: hit.severity,
      message: hit.message,
      funds: attribution && lens ? attribution[lens] : [],
    });
  }

  alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "CRITICAL" ? -1 : 1));

  const observations = observe(facts);

  return {
    alerts,
    observations,
    facts,
    policy,
    reserveStatus: reserveStatus(facts.reservePercent, policy),
    attribution,
    criticalCount: alerts.filter((a) => a.severity === "CRITICAL").length,
    warningCount: alerts.filter((a) => a.severity === "WARNING").length,
    informationalCount: observations.length,
  };
}

/**
 * The informational tier. No thresholds are consulted — that is what makes these
 * observations rather than alerts.
 */
function observe(f: AlertFacts): Observation[] {
  const out: Observation[] = [];

  if (f.availableBudget.isPositive() && f.encumbrances.greaterThan(0)) {
    out.push({
      id: "ENCUMBRANCES_OUTSTANDING",
      title: "Encumbrances outstanding",
      message: `${money(f.encumbrances)} is committed but not yet paid, and is already counted against available budget.`,
    });
  }

  if (f.expenditureForecast !== null && f.expenditureBudget.greaterThan(0)) {
    out.push({
      id: "YEAR_END_PROJECTION",
      title: "Year-end projection",
      message: `On the current pace, spending reaches ${money(f.expenditureForecast)} against a budget of ${money(f.expenditureBudget)}.`,
    });
  }

  if (f.changeInFundBalance.isPositive()) {
    out.push({
      id: "FUND_BALANCE_GREW",
      title: "Fund balance is growing",
      message: `This year's operations have added ${money(f.changeInFundBalance)} to the fund balance.`,
    });
  }

  return out;
}

// Comma-grouped by hand, like every other figure on these screens — see the note in
// lib/dashboard/format.ts about ICU and the middle dot.
const money = (v: Prisma.Decimal) => fmtMoney(v, 2);

/**
 * Everything the catalogue can ask about, for one period.
 *
 * A figure that cannot be worked out is null, never zero. "We don't have last month's
 * file" and "spending didn't move" are different facts, and only one of them should keep
 * an alert quiet.
 */
export const gatherFacts = memo(
  "gatherFacts",
  (
    db: TenantDb,
    scope: { fiscalYear: string; period: number; filter?: FinanceFilter },
    codes: ActivityCodes,
    opts: { ignoreSalaryObjectsMom?: boolean } = {},
  ) => {
    const k = dbKey(db);
    return k === null
      ? null
      : `${k}|${scope.fiscalYear}|${scope.period}|${filterKey(scope.filter)}|${codesKey(codes)}|${
          opts.ignoreSalaryObjectsMom === true
        }`;
  },
  buildFacts,
);

async function buildFacts(
  db: TenantDb,
  scope: { fiscalYear: string; period: number; filter?: FinanceFilter },
  codes: ActivityCodes,
  opts: { ignoreSalaryObjectsMom?: boolean } = {},
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

  /**
   * The remaining four reads, in one round instead of four.
   *
   * None of them depends on another — they were simply written as separate `await`s, and
   * against a database on another continent each one of those is a round trip nobody
   * needed to wait for. `daysCash` reads `cash`, which is already resolved above.
   *
   * The salary pair is the district's option to keep payroll swings out of the spending
   * trend: payroll runs and step increases move month to month for reasons that are not a
   * budget concern, so when the policy is set this month's and last month's salary spend
   * come out of both sides of the comparison before the percentage is worked out.
   */
  const [[salaryNow, salaryPrev], cashDecreasePercent, components, daysCashOnHand] =
    await Promise.all([
      opts.ignoreSalaryObjectsMom
        ? Promise.all([
            salaryExpenditureMtd(db, scope),
            scope.period > 1
              ? salaryExpenditureMtd(db, { ...scope, period: scope.period - 1 })
              : Promise.resolve(ZERO),
          ])
        : Promise.resolve([ZERO, ZERO] as const),
      monthOverMonthCashDrop(db, scope),
      /**
       * Whether the district's designated components exceed the projected balance — the
       * 24th alert, once hardcoded to `false` and therefore permanently silent.
       *
       * The components are the ones the district reported on its Opening Fund Balance:
       * nonspendable, restricted, committed and assigned. If they add up to more than the
       * balance the year is projected to end at, the unassigned reserve would be negative —
       * a board having designated more money than the fund actually holds. That is worth a
       * critical alert and it is computable from data already imported.
       */
      designatedComponents(db, scope),
      daysCash(db, scope, cash.total),
    ]);

  const expenditureMtdForMom = totals.totalExpenditureMtd.minus(salaryNow);
  const prevExpenditureForMom =
    prevExpenditure === null ? null : prevExpenditure.minus(salaryPrev);

  /**
   * The projected year-end reserve — and the three alerts that could not fire without it.
   *
   * FORECAST_BELOW_TARGET, FORECAST_WARNING and FORECAST_CRITICAL all read
   * `forecastReservePercent`, and it was hardcoded `null` here with a note saying the
   * multi-year projection "lives on its own screen". The catalogue is covered by
   * `verify:alerts`, which tests each definition against a fixture — but nothing tested
   * that this function supplies the facts, so three of the twenty-four shipped
   * permanently silent behind a passing suite.
   *
   * It does not need the multi-year projection. Year-end unassigned is today's unassigned
   * plus the rest of THIS year's activity, and both projections are already computed a few
   * lines above for the forecast-variance alerts:
   *
   *     projected unassigned = unassigned now
   *                          + (year-end revenue − revenue so far)
   *                          − (year-end spend  − spend so far)
   *
   * So this costs no extra queries. The divisor is the adopted expenditure budget, the
   * same one `reservePercent()` uses, so the current and forecast reserve percentages are
   * comparable — which is the whole point of showing them beside each other.
   */
  const remainingRevenue = revenueForecast.projected.minus(revenueYtd);
  const remainingSpend = expenditureForecast.projected.minus(expenditureYtd);
  const projectedUnassigned = reserve.unassigned.plus(remainingRevenue).minus(remainingSpend);
  const forecastReservePercent = reserve.budget.isZero()
    ? null
    : projectedUnassigned.dividedBy(reserve.budget).times(100);

  // `components` is resolved in the round above; this is the balance it is measured against.
  const projectedTotal = fb.beginning.plus(remainingRevenue.minus(remainingSpend)).plus(
    totals.totalRevenueYtd.minus(totals.totalExpenditureYtd),
  );

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
    expenditureMomIncreasePercent: momChange(expenditureMtdForMom, prevExpenditureForMom),

    daysCashOnHand,
    cashDecreasePercent,

    reservePercent: reserve.percent,
    forecastReservePercent,
    changeInFundBalance: fb.total.minus(fb.beginning),
    // Only meaningful where the district actually reported components. With none imported
    // the sum is zero, which would never exceed anything — silence, not a false all-clear.
    componentsExceedTotal: components !== null && components.greaterThan(projectedTotal),
  };
}

/**
 * The district's designated fund-balance components, from the annual Opening Fund Balance.
 *
 * Null — not zero — when no opening balance has been imported. The distinction is the
 * whole point: "this district designates nothing" and "we have not been told" must not
 * both read as a comfortable zero.
 */
async function designatedComponents(
  db: TenantDb,
  scope: { fiscalYear: string; filter?: FinanceFilter },
): Promise<Prisma.Decimal | null> {
  const versions = await currentVersionIds(db, { fiscalYear: scope.fiscalYear, period: null });
  const versionId = versions.get("OPENING_FUND_BALANCE");
  if (!versionId) return null;

  const agg = await db.openingFundBalance.aggregate({
    where: { versionId, ...fundWhere(scope.filter) },
    _sum: {
      begNonspendable: true,
      begRestricted: true,
      begCommitted: true,
      begAssigned: true,
    },
  });

  // Every component is nullable on the import; a row that supplied none contributes zero.
  if (agg._sum.begNonspendable === null && agg._sum.begRestricted === null) return null;

  return [
    agg._sum.begNonspendable,
    agg._sum.begRestricted,
    agg._sum.begCommitted,
    agg._sum.begAssigned,
  ].reduce<Prisma.Decimal>((a, b) => (b ? a.plus(b) : a), ZERO);
}

/** Budget and encumbrances for the period, from the current versions. */
const currentBudgets = memo(
  "currentBudgets",
  (db: TenantDb, scope: { fiscalYear: string; period: number; filter?: FinanceFilter }) => {
    const k = dbKey(db);
    return k === null ? null : `${k}|${scope.fiscalYear}|${scope.period}|${filterKey(scope.filter)}`;
  },
  buildCurrentBudgets,
);

async function buildCurrentBudgets(
  db: TenantDb,
  scope: { fiscalYear: string; period: number; filter?: FinanceFilter },
): Promise<{ revenue: Prisma.Decimal; expenditure: Prisma.Decimal; encumbrances: Prisma.Decimal }> {
  const versions = await currentVersionIds(db, {
    fiscalYear: scope.fiscalYear,
    period: scope.period,
  });
  const slice = detailWhere(scope.filter);

  const revVersion = versions.get("REVENUE_DETAIL");
  const expVersion = versions.get("EXPENDITURE_DETAIL");

  const [rev, exp] = await Promise.all([
    revVersion
      ? db.revenueActual.aggregate({
          where: { versionId: revVersion, ...slice },
          _sum: { budget: true },
        })
      : null,
    expVersion
      ? db.expenditureActual.aggregate({
          where: { versionId: expVersion, ...slice },
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
  scope: { fiscalYear: string; filter?: FinanceFilter },
  cash: Prisma.Decimal,
): Promise<Prisma.Decimal | null> {
  // The same adopted budget the reserve percentage and the trend series divide by, and
  // FUND-level to match the numerator. `cash` comes from CashPosition, which carries no
  // cost centre, so narrowing only the divisor would divide district-wide cash by one
  // department's budget and report years of runway. See lib/finance/filter.ts.
  const adopted = await adoptedBudget(db, {
    fiscalYear: scope.fiscalYear,
    kind: "EXPENDITURE",
    filter: fundOnly(scope.filter),
  });
  if (!adopted) return null;

  const annual = adopted.total;
  if (annual.isZero()) return null;

  const perDay = annual.dividedBy(365);
  return cash.dividedBy(perDay);
}

/**
 * This month's expenditure on salary objects — the figure taken out of both sides of the
 * month-over-month comparison when the district opts to ignore salary swings.
 *
 * "Salaries" is the single object type the exclusion targets, identified by its seeded name
 * (the same name the forecast categories group by), then joined through each expenditure
 * line's object.
 */
async function salaryExpenditureMtd(
  db: TenantDb,
  scope: { fiscalYear: string; period: number; filter?: FinanceFilter },
): Promise<Prisma.Decimal> {
  const salaryType = await db.objectType.findFirst({
    where: { name: "Salaries" },
    select: { id: true },
  });
  if (!salaryType) return ZERO;

  const versions = await currentVersionIds(db, {
    fiscalYear: scope.fiscalYear,
    period: scope.period,
  });
  const versionId = versions.get("EXPENDITURE_DETAIL");
  if (!versionId) return ZERO;

  const r = await db.expenditureActual.aggregate({
    where: {
      versionId,
      ...detailWhere(scope.filter),
      object: { objectTypeId: salaryType.id },
    },
    _sum: { actualMtd: true },
  });
  return r._sum.actualMtd ?? ZERO;
}

/** How far cash fell against last month, as a positive percentage. Null if it rose. */
async function monthOverMonthCashDrop(
  db: TenantDb,
  scope: { fiscalYear: string; period: number; filter?: FinanceFilter },
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
