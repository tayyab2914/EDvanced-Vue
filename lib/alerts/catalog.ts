import { Prisma } from "@/lib/generated/prisma/client";
import type { PolicyValues } from "@/lib/policies/registry";
import { compactMoney } from "@/lib/dashboard/format";

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

/**
 * ABBREVIATED — $39.86M, not $39,859,391.29.
 *
 * An alert is a sentence, and a nine-digit figure written out in full is a number the
 * reader counts digits through rather than reads. It also wraps: "Collections are 23.7%
 * below budget ($39,859,391.29 against $208,900,000.00)" took two lines in the summary
 * card where the abbreviated form takes one. The exact figure is a click away on the
 * dashboard the alert links to, which is where an exact figure belongs.
 *
 * Shared with the dashboards so an alert sentence and the tile it sits under abbreviate
 * the same way. `toLocaleString` used to do the grouping and produced middle dots on a
 * runtime without full ICU — see the note in lib/dashboard/format.ts.
 */
const money = (v: Prisma.Decimal) => compactMoney(v);
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

/**
 * ---------------------------------------------------------------------------
 * SAYING IT ONCE — why two alerts step aside from a third.
 *
 * The client, on the alert summary: two rows, one fact. "Collections are 23.7% below
 * budget" sat directly above "On current pace, year-end revenue lands 23.7% below budget",
 * with the same three funds listed under each.
 *
 * That was not a coincidence in one district's data, it is arithmetic. Pace variance is
 * (ytd − budget·p/12) ÷ (budget·p/12); the straight-line forecast's variance is
 * (ytd·12/p − budget) ÷ budget. Both reduce to (ytd·12)/(p·budget) − 1. With no growth
 * assumption applied to the district-level projection — and lib/alerts/engine.ts applies
 * none — the current-performance alert and the forecast alert CANNOT report different
 * numbers. The forecast thresholds also sit below the current ones (3/5 against 5/10), so
 * the pace alert could never fire without the forecast alert firing beside it.
 *
 * THIS IS NOT A MERGE. Between 3% and 5% off pace the current-performance alert is silent
 * and the forecast alert is the only signal there is — it still fires, alone, exactly as
 * before. It steps aside only where the alert beside it is already reporting its number.
 *
 * NO SEVERITY IS LOST IN THE FOLD. The two ladders are set differently on purpose: at 7%
 * off, pace reads WARNING (5/10) while the forecast policy reads CRITICAL (3/5). Dropping
 * the forecast row on its own would quietly stop enforcing the district's forecast-critical
 * threshold, so the surviving row is RAISED to the louder of the two. One row, the dollars
 * kept, the urgency kept.
 *
 * AND IT COMPARES FIGURES, NOT JUST THRESHOLDS — see `revenueReadingsAgree` for how, which
 * is subtler than it looks. Should the district-level forecast ever be given the growth
 * assumptions `projectRevenueByCategory` already understands, the two numbers would
 * genuinely diverge and both alerts would return on their own, without anyone having to
 * remember to come back here and undo this.
 * ---------------------------------------------------------------------------
 */
const RANK: Record<AlertSeverity, number> = { WARNING: 1, CRITICAL: 2 };

/** Louder than, or as loud as. */
const drownsOut = (other: AlertSeverity | null, mine: AlertSeverity) =>
  other !== null && RANK[other] >= RANK[mine];

/**
 * The severity REVENUE_BELOW_BUDGET / REVENUE_ABOVE_BUDGET reports for a variance, or null
 * for silence. One ladder, read both by the alerts themselves and by the forecast pair
 * deciding whether to keep quiet — two copies of it would eventually disagree.
 */
function revenueVarianceSeverity(
  v: Prisma.Decimal | null,
  p: PolicyValues,
): AlertSeverity | null {
  if (v === null || v.isZero()) return null;
  const off = v.abs();
  if (off.lessThan(n(p.revenue.varianceWarning))) return null;
  // Over-collection is never critical: the spec's own example of a valid state that must be
  // surfaced rather than treated as a failure.
  if (v.isPositive()) return "WARNING";
  return off.greaterThanOrEqualTo(n(p.revenue.varianceCritical)) ? "CRITICAL" : "WARNING";
}

/**
 * The severity MATERIAL_FORECAST_VARIANCE reports, or null for silence.
 *
 * Read by FORECAST_EXCEEDS_BUDGET too, which describes the SAME projection in dollars.
 * Both fire off `expenditureForecast`, so above the material threshold a district was told
 * twice that the year lands over budget — once as a percentage and once as a figure.
 */
function expenditureForecastSeverity(
  v: Prisma.Decimal | null,
  p: PolicyValues,
): AlertSeverity | null {
  if (v === null) return null;
  const off = v.abs();
  if (off.greaterThanOrEqualTo(n(p.expenditure.forecastVarianceCritical))) return "CRITICAL";
  if (off.greaterThanOrEqualTo(n(p.expenditure.forecastVarianceWarning))) return "WARNING";
  return null;
}

/**
 * The severity the REVENUE_FORECAST_* pair reports, against the Forecast Variance policy.
 *
 * A separate ladder from `revenueVarianceSeverity` because the thresholds are separate —
 * the district sets Current Performance and Forecast Performance independently, and this is
 * the one that decides how loud the folded row gets.
 */
function revenueForecastSeverity(
  v: Prisma.Decimal | null,
  p: PolicyValues,
): AlertSeverity | null {
  if (v === null || v.isZero()) return null;
  const off = v.abs();
  if (off.lessThan(n(p.revenue.forecastVarianceWarning))) return null;
  // Landing ABOVE budget is never critical, the same judgement the current-performance pair
  // makes about over-collection.
  if (v.isPositive()) return "WARNING";
  return off.greaterThanOrEqualTo(n(p.revenue.forecastVarianceCritical)) ? "CRITICAL" : "WARNING";
}

/**
 * The two revenue readings are the same statement — they READ the same.
 *
 * Compared through `pct`, at the one decimal the sentences show, and NOT with `equals`.
 * An exact comparison is the obvious way to write this and it never once matched in
 * production: the two facts reach the same value by different routes — pace divides by the
 * pro-rated budget, the forecast divides by the full-year one — and Decimal rounds each
 * division to 20 significant digits, so they agree to nineteen and differ in the twentieth.
 * On one district: -88.017233125897558641 against -88.01723312589755864. Both rows printed
 * "88.0% below budget"; `equals` called them different numbers and neither stepped aside.
 *
 * Comparing what the reader actually sees is also the more honest test. The complaint was
 * two rows saying the same thing, and two rows say the same thing when they read the same.
 */
const revenueReadingsAgree = (f: AlertFacts): boolean =>
  f.revenueVariancePercent !== null &&
  f.revenueForecastVariancePercent !== null &&
  pct(f.revenueVariancePercent) === pct(f.revenueForecastVariancePercent);

/** The louder of two severities, where the second may be absent. */
const louder = (a: AlertSeverity, b: AlertSeverity | null): AlertSeverity =>
  b !== null && RANK[b] > RANK[a] ? b : a;

/**
 * What a current-performance revenue alert reports once the forecast alert beside it has
 * been folded in: its own severity, raised to the forecast's when the two agree on the
 * figure. Null when it should stay quiet — including the 3–5% band, where the forecast
 * alert is left to speak for itself.
 */
function revenueCurrentSeverity(f: AlertFacts, p: PolicyValues): AlertSeverity | null {
  const own = revenueVarianceSeverity(f.revenueVariancePercent, p);
  if (own === null) return null;
  return revenueReadingsAgree(f)
    ? louder(own, revenueForecastSeverity(f.revenueForecastVariancePercent, p))
    : own;
}

/** Whether the current-performance alert has already made this exact statement. */
const revenueAlreadySaid = (f: AlertFacts, p: PolicyValues): boolean =>
  revenueReadingsAgree(f) && revenueVarianceSeverity(f.revenueVariancePercent, p) !== null;

export const ALERTS: AlertDef[] = [
  // ===================== Revenue (5) =====================
  {
    id: "REVENUE_BELOW_BUDGET",
    group: "revenue",
    title: "Revenue below budget",
    evaluate: (f, p) => {
      const v = f.revenueVariancePercent;
      if (v === null || !v.isNegative()) return null;
      const severity = revenueCurrentSeverity(f, p);
      if (severity === null) return null;
      return {
        severity,
        message: `Collections are ${pct(v.abs())} below budget (${money(f.revenueYtd)} against ${money(f.revenueBudget)}).`,
      };
    },
  },
  {
    id: "REVENUE_ABOVE_BUDGET",
    group: "revenue",
    title: "Revenue above budget",
    evaluate: (f, p) => {
      const v = f.revenueVariancePercent;
      if (v === null || !v.isPositive()) return null;
      // Never critical — see `revenueVarianceSeverity`, which owns that rule.
      const severity = revenueCurrentSeverity(f, p);
      if (severity === null) return null;
      return {
        severity,
        message: `Collections are ${pct(v)} above budget (${money(f.revenueYtd)} against ${money(f.revenueBudget)}). Worth confirming the budget is current.`,
      };
    },
  },
  {
    id: "REVENUE_FORECAST_BELOW_BUDGET",
    group: "revenue",
    title: "Forecast revenue below budget",
    evaluate: (f, p) => {
      const v = f.revenueForecastVariancePercent;
      if (v === null || !v.isNegative()) return null;
      const severity = revenueForecastSeverity(v, p);
      if (severity === null) return null;
      // The same number as REVENUE_BELOW_BUDGET, and that alert is firing? It has said it,
      // with the dollars this sentence lacks, and it carried this severity across.
      if (revenueAlreadySaid(f, p)) return null;
      return {
        severity,
        message: `On current pace, year-end revenue lands ${pct(v.abs())} below budget.`,
      };
    },
  },
  {
    id: "REVENUE_FORECAST_ABOVE_BUDGET",
    group: "revenue",
    title: "Forecast revenue above budget",
    evaluate: (f, p) => {
      const v = f.revenueForecastVariancePercent;
      if (v === null || !v.isPositive()) return null;
      const severity = revenueForecastSeverity(v, p);
      if (severity === null) return null;
      if (revenueAlreadySaid(f, p)) return null;
      return { severity, message: `On current pace, year-end revenue lands ${pct(v)} above budget.` };
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
    evaluate: (f, p) => {
      if (f.expenditureForecast === null) return null;
      if (!f.expenditureForecast.greaterThan(f.expenditureBudget)) return null;
      // MATERIAL_FORECAST_VARIANCE now carries this same landing figure AND says how far
      // off it is, so above the material threshold this row would only repeat it. Below
      // that threshold it is the only warning that the year is heading over at all, which
      // is where it earns its place — the alert has no threshold of its own.
      const v = f.expenditureForecastVariancePercent;
      const material = v !== null && v.isPositive() ? expenditureForecastSeverity(v, p) : null;
      if (drownsOut(material, "WARNING")) return null;
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
      const severity = expenditureForecastSeverity(v, p);
      if (severity === null) return null;
      // The landing figure, inherited from FORECAST_EXCEEDS_BUDGET now that it steps aside
      // here: "7.9% off budget" on its own is a percentage the reader has to go and price.
      // "off budget", not "over" — the workbook fires this in both directions, and the two
      // figures say which way without the sentence having to.
      const against =
        f.expenditureForecast === null
          ? ""
          : ` (${money(f.expenditureForecast)} against ${money(f.expenditureBudget)})`;
      return { severity, message: `Projected year-end spend is ${pct(v!.abs())} off budget${against}.` };
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
