import { Prisma } from "@/lib/generated/prisma/client";
import type { PolicyValues } from "@/lib/policies/registry";

/**
 * The twenty-seven alerts, declared rather than coded.
 *
 * Twenty-seven hand-written `if` blocks is how a codebase ends up with two definitions of
 * "over budget" that disagree by the third month. Here each alert is data: an id, a
 * group, a title, and a predicate over the figures and the district's own thresholds. The
 * engine walks the list; nothing else knows how many there are.
 *
 * COUNTS, from the workbook's four tables: revenue 5, expenditure 8, cash 3, fund
 * balance 8 = 24. `verify:alerts` asserts each group's count, because the alert a district
 * never receives is the one nobody notices is missing.
 *
 * Cash was trimmed to three: the district's cash policy is now Days Cash on Hand and Cash
 * Decrease only. The two Cash Balance alerts and the Forecast Cash alert were retired along
 * with the Cash Forecast Thresholds they read.
 *
 * Severity is returned, not declared. The workbook lists "Material Forecast Variance" as
 * ONE alert that fires "at the warning or critical threshold" — while listing "Budget
 * Utilization Warning" and "Budget Utilization Critical" as two. Following its structure
 * exactly is what keeps the count honest and the labels matching what the client wrote.
 *
 * Pure and client-safe — this also labels an alert on screen.
 */

export type AlertGroup = "revenue" | "expenditure" | "cash" | "fundBalance";
export type AlertSeverity = "WARNING" | "CRITICAL";

export interface AlertHit {
  severity: AlertSeverity;
  message: string;
}

/** Everything an alert can look at. Null means "not enough data to say". */
export interface AlertFacts {
  revenueBudget: Prisma.Decimal;
  revenueYtd: Prisma.Decimal;
  revenueVariancePercent: Prisma.Decimal | null;
  revenueForecastVariancePercent: Prisma.Decimal | null;
  revenueMomChangePercent: Prisma.Decimal | null;

  expenditureBudget: Prisma.Decimal;
  expenditureYtd: Prisma.Decimal;
  encumbrances: Prisma.Decimal;
  utilizationPercent: Prisma.Decimal | null;
  availableBudget: Prisma.Decimal;
  expenditureForecast: Prisma.Decimal | null;
  expenditureForecastVariancePercent: Prisma.Decimal | null;
  expenditureMomIncreasePercent: Prisma.Decimal | null;

  daysCashOnHand: Prisma.Decimal | null;
  cashDecreasePercent: Prisma.Decimal | null;

  reservePercent: Prisma.Decimal | null;
  forecastReservePercent: Prisma.Decimal | null;
  changeInFundBalance: Prisma.Decimal;
  componentsExceedTotal: boolean;
}

export interface AlertDef {
  id: string;
  group: AlertGroup;
  title: string;
  evaluate: (f: AlertFacts, p: PolicyValues) => AlertHit | null;
}

const money = (v: Prisma.Decimal) =>
  Number(v.toFixed(2)).toLocaleString("en-US", { style: "currency", currency: "USD" });
const pct = (v: Prisma.Decimal) => `${v.toFixed(1)}%`;
const n = (v: number | boolean) => Number(v);

/**
 * A null fact means "we cannot say yet", and it must never read as "all clear". Every
 * comparison goes through these, so a missing figure is silence rather than a false
 * reassurance.
 */
const gte = (v: Prisma.Decimal | null, t: number) => v !== null && v.greaterThanOrEqualTo(t);
const lt = (v: Prisma.Decimal | null, t: number) => v !== null && v.lessThan(t);

const warn = (message: string): AlertHit => ({ severity: "WARNING", message });
const crit = (message: string): AlertHit => ({ severity: "CRITICAL", message });

export const ALERTS: AlertDef[] = [
  // ===================== Revenue (5) =====================
  {
    id: "REVENUE_BELOW_BUDGET",
    group: "revenue",
    title: "Revenue below budget",
    evaluate: (f, p) => {
      const v = f.revenueVariancePercent;
      if (v === null || !v.isNegative()) return null;
      const off = v.abs();
      const msg = `Collections are ${pct(off)} below budget (${money(f.revenueYtd)} against ${money(f.revenueBudget)}).`;
      if (off.greaterThanOrEqualTo(n(p.revenue.varianceCritical))) return crit(msg);
      if (off.greaterThanOrEqualTo(n(p.revenue.varianceWarning))) return warn(msg);
      return null;
    },
  },
  {
    id: "REVENUE_ABOVE_BUDGET",
    group: "revenue",
    title: "Revenue above budget",
    evaluate: (f, p) => {
      const v = f.revenueVariancePercent;
      if (v === null || v.isNegative() || v.isZero()) return null;
      // Never critical: over-collection is the spec's own example of a valid state that
      // must be surfaced rather than treated as a failure.
      if (v.lessThan(n(p.revenue.varianceWarning))) return null;
      return warn(
        `Collections are ${pct(v)} above budget (${money(f.revenueYtd)} against ${money(f.revenueBudget)}). Worth confirming the budget is current.`,
      );
    },
  },
  {
    id: "REVENUE_FORECAST_BELOW_BUDGET",
    group: "revenue",
    title: "Forecast revenue below budget",
    evaluate: (f, p) => {
      const v = f.revenueForecastVariancePercent;
      if (v === null || !v.isNegative()) return null;
      const off = v.abs();
      const msg = `On current pace, year-end revenue lands ${pct(off)} below budget.`;
      if (off.greaterThanOrEqualTo(n(p.revenue.forecastVarianceCritical))) return crit(msg);
      if (off.greaterThanOrEqualTo(n(p.revenue.forecastVarianceWarning))) return warn(msg);
      return null;
    },
  },
  {
    id: "REVENUE_FORECAST_ABOVE_BUDGET",
    group: "revenue",
    title: "Forecast revenue above budget",
    evaluate: (f, p) => {
      const v = f.revenueForecastVariancePercent;
      if (v === null || v.isNegative() || v.isZero()) return null;
      if (v.lessThan(n(p.revenue.forecastVarianceWarning))) return null;
      return warn(`On current pace, year-end revenue lands ${pct(v)} above budget.`);
    },
  },
  {
    id: "REVENUE_SIGNIFICANT_CHANGE",
    group: "revenue",
    title: "Significant revenue change",
    evaluate: (f, p) => {
      const v = f.revenueMomChangePercent;
      if (v === null || v.abs().lessThan(n(p.revenue.significantChange))) return null;
      return warn(`Revenue ${v.isNegative() ? "fell" : "rose"} ${pct(v.abs())} against last month.`);
    },
  },

  // ===================== Expenditure (8) =====================
  {
    id: "BUDGET_UTILIZATION_WARNING",
    group: "expenditure",
    title: "Budget utilization",
    evaluate: (f, p) => {
      const u = f.utilizationPercent;
      // Stops where the critical alert starts, so one condition raises one alert.
      if (!gte(u, n(p.expenditure.utilizationWarning))) return null;
      if (gte(u, n(p.expenditure.utilizationCritical))) return null;
      return warn(`${pct(u!)} of budget is committed (spend plus encumbrances).`);
    },
  },
  {
    id: "BUDGET_UTILIZATION_CRITICAL",
    group: "expenditure",
    title: "Budget utilization critical",
    evaluate: (f, p) => {
      const u = f.utilizationPercent;
      if (!gte(u, n(p.expenditure.utilizationCritical))) return null;
      if (gte(u, n(p.expenditure.budgetExceeded))) return null;
      return crit(
        `${pct(u!)} of budget is committed, at or past your ${p.expenditure.utilizationCritical}% critical threshold.`,
      );
    },
  },
  {
    id: "BUDGET_EXCEEDED",
    group: "expenditure",
    title: "Budget exceeded",
    evaluate: (f, p) => {
      if (!gte(f.utilizationPercent, n(p.expenditure.budgetExceeded))) return null;
      return crit(
        `Spending has passed the budget: ${money(f.expenditureYtd)} against ${money(f.expenditureBudget)}.`,
      );
    },
  },
  {
    id: "NEGATIVE_AVAILABLE_BUDGET",
    group: "expenditure",
    title: "Negative available budget",
    evaluate: (f, p) => {
      if (p.expenditure.flagNegativeAvailable !== true) return null;
      if (!f.availableBudget.isNegative()) return null;
      return crit(
        `Available budget is ${money(f.availableBudget)} — budget minus spend minus encumbrances is below zero.`,
      );
    },
  },
  {
    id: "ENCUMBRANCES_EXCEED_AVAILABLE",
    group: "expenditure",
    title: "Encumbrances exceed available budget",
    evaluate: (f, p) => {
      if (p.expenditure.flagEncumbrancesOverAvailable !== true) return null;
      const left = f.expenditureBudget.minus(f.expenditureYtd);
      // The negative-available alert says it louder; don't say it twice.
      if (f.availableBudget.isNegative()) return null;
      if (!f.encumbrances.greaterThan(left)) return null;
      return warn(`Encumbrances of ${money(f.encumbrances)} exceed the ${money(left)} left after spend.`);
    },
  },
  {
    id: "FORECAST_EXCEEDS_BUDGET",
    group: "expenditure",
    title: "Forecast exceeds budget",
    evaluate: (f) => {
      if (f.expenditureForecast === null) return null;
      if (!f.expenditureForecast.greaterThan(f.expenditureBudget)) return null;
      return warn(
        `On current pace, year-end spend reaches ${money(f.expenditureForecast)} against a budget of ${money(f.expenditureBudget)}.`,
      );
    },
  },
  {
    id: "MATERIAL_FORECAST_VARIANCE",
    group: "expenditure",
    title: "Material forecast variance",
    // One alert, either severity — the workbook lists it once, firing "at the warning or
    // critical threshold".
    evaluate: (f, p) => {
      const v = f.expenditureForecastVariancePercent;
      if (v === null) return null;
      const off = v.abs();
      const msg = `Projected year-end spend is ${pct(off)} off budget.`;
      if (off.greaterThanOrEqualTo(n(p.expenditure.forecastVarianceCritical))) return crit(msg);
      if (off.greaterThanOrEqualTo(n(p.expenditure.forecastVarianceWarning))) return warn(msg);
      return null;
    },
  },
  {
    id: "SIGNIFICANT_MOM_INCREASE",
    group: "expenditure",
    title: "Significant month-over-month increase",
    evaluate: (f, p) => {
      const v = f.expenditureMomIncreasePercent;
      if (v === null) return null;
      const msg = `Spending jumped ${pct(v)} against last month.`;
      if (v.greaterThanOrEqualTo(n(p.expenditure.momIncreaseCritical))) return crit(msg);
      if (v.greaterThanOrEqualTo(n(p.expenditure.momIncreaseWarning))) return warn(msg);
      return null;
    },
  },

  // ===================== Cash (3) =====================
  {
    id: "DAYS_CASH_WARNING",
    group: "cash",
    title: "Days cash on hand",
    evaluate: (f, p) => {
      const w = n(p.cash.daysCashWarning);
      if (!lt(f.daysCashOnHand, w)) return null;
      if (lt(f.daysCashOnHand, n(p.cash.daysCashCritical))) return null;
      return warn(`${f.daysCashOnHand!.toFixed(0)} days of cash on hand, below the ${w}-day threshold.`);
    },
  },
  {
    id: "DAYS_CASH_CRITICAL",
    group: "cash",
    title: "Days cash on hand critical",
    evaluate: (f, p) => {
      const c = n(p.cash.daysCashCritical);
      if (!lt(f.daysCashOnHand, c)) return null;
      return crit(
        `${f.daysCashOnHand!.toFixed(0)} days of cash on hand, below the ${c}-day critical threshold.`,
      );
    },
  },
  {
    id: "SIGNIFICANT_CASH_DECREASE",
    group: "cash",
    title: "Significant cash decrease",
    evaluate: (f, p) => {
      const v = f.cashDecreasePercent;
      if (v === null) return null;
      const msg = `Cash fell ${pct(v)} against last month.`;
      if (v.greaterThanOrEqualTo(n(p.cash.decreaseCritical))) return crit(msg);
      if (v.greaterThanOrEqualTo(n(p.cash.decreaseWarning))) return warn(msg);
      return null;
    },
  },

  // ===================== Fund balance (8) =====================
  {
    id: "FUND_BALANCE_BELOW_TARGET",
    group: "fundBalance",
    title: "Reserve below target",
    evaluate: (f, p) => {
      const v = f.reservePercent;
      const target = n(p.fundBalance.target);
      // Below target but not yet at the warning bar — a nudge, not an alarm.
      if (!lt(v, target) || lt(v, n(p.fundBalance.warning))) return null;
      return warn(`Unassigned reserve is ${pct(v!)}, below the ${target}% you aim to hold.`);
    },
  },
  {
    id: "FUND_BALANCE_WARNING",
    group: "fundBalance",
    title: "Reserve below warning threshold",
    evaluate: (f, p) => {
      const v = f.reservePercent;
      const w = n(p.fundBalance.warning);
      if (!lt(v, w) || lt(v, n(p.fundBalance.critical))) return null;
      return warn(`Unassigned reserve is ${pct(v!)}, below your ${w}% warning threshold.`);
    },
  },
  {
    id: "FUND_BALANCE_CRITICAL",
    group: "fundBalance",
    title: "Reserve critical",
    evaluate: (f, p) => {
      const v = f.reservePercent;
      const c = n(p.fundBalance.critical);
      if (!lt(v, c)) return null;
      return crit(`Unassigned reserve is ${pct(v!)}, below your ${c}% critical threshold.`);
    },
  },
  {
    id: "FORECAST_BELOW_TARGET",
    group: "fundBalance",
    title: "Forecast reserve below target",
    evaluate: (f, p) => {
      const v = f.forecastReservePercent;
      const target = n(p.fundBalance.target);
      if (!lt(v, target) || lt(v, n(p.fundBalance.forecastWarning))) return null;
      return warn(`Projected year-end reserve is ${pct(v!)}, below your ${target}% target.`);
    },
  },
  {
    id: "FORECAST_WARNING",
    group: "fundBalance",
    title: "Forecast reserve below warning",
    evaluate: (f, p) => {
      const v = f.forecastReservePercent;
      const w = n(p.fundBalance.forecastWarning);
      if (!lt(v, w) || lt(v, n(p.fundBalance.forecastCritical))) return null;
      return warn(`Projected year-end reserve is ${pct(v!)}, below your ${w}% forecast warning.`);
    },
  },
  {
    id: "FORECAST_CRITICAL",
    group: "fundBalance",
    title: "Forecast reserve critical",
    evaluate: (f, p) => {
      const v = f.forecastReservePercent;
      const c = n(p.fundBalance.forecastCritical);
      if (!lt(v, c)) return null;
      return crit(`Projected year-end reserve is ${pct(v!)}, below your ${c}% forecast critical threshold.`);
    },
  },
  {
    id: "NEGATIVE_CHANGE_IN_FUND_BALANCE",
    group: "fundBalance",
    title: "Fund balance is falling",
    evaluate: (f) => {
      if (!f.changeInFundBalance.isNegative()) return null;
      return warn(
        `This year's operations have reduced the fund balance by ${money(f.changeInFundBalance.abs())}.`,
      );
    },
  },
  {
    id: "COMPONENTS_EXCEED_ENDING_BALANCE",
    group: "fundBalance",
    title: "Components exceed the projected balance",
    evaluate: (f) =>
      f.componentsExceedTotal
        ? crit(
            "The projected restricted, committed and assigned components add up to more than the projected balance, which would leave the unassigned reserve negative.",
          )
        : null,
  },
];

/**
 * Strong / Acceptable / Monitor / Action Required — from the SAME thresholds the alerts
 * use. A second ladder would eventually disagree with the alert beside it on the page.
 */
export type ReserveStatus = "Strong" | "Acceptable" | "Monitor" | "Action Required";

export function reserveStatus(
  reservePercent: Prisma.Decimal | null,
  policy: PolicyValues,
): ReserveStatus | null {
  if (reservePercent === null) return null;
  if (lt(reservePercent, n(policy.fundBalance.critical))) return "Action Required";
  if (lt(reservePercent, n(policy.fundBalance.warning))) return "Monitor";
  if (lt(reservePercent, n(policy.fundBalance.target))) return "Acceptable";
  return "Strong";
}

export const alertsByGroup = (group: AlertGroup) => ALERTS.filter((a) => a.group === group);
export const alertById = (id: string) => ALERTS.find((a) => a.id === id);
