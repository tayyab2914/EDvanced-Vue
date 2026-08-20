import { Prisma } from "@/lib/generated/prisma/client";
import type { PolicyValues } from "@/lib/policies/registry";
import { compactMoney } from "@/lib/dashboard/format";
import { RESERVE_DENOMINATOR_LABELS, type ReserveBasis, type ReserveDenominator } from "@/lib/enums";

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

  /**
   * The reserve as a share of the district's chosen basis.
   *
   * Since M6 this is the PROJECTED ENDING unassigned balance — beginning balance plus the
   * amended budget's net change — over projected General Fund revenue, or over budgeted
   * expenditures where the district has chosen that basis. At the year's final period both
   * halves become the outturn. See the header of lib/finance/fund-balance.ts.
   */
  reservePercent: Prisma.Decimal | null;
  /** The same ratio, but with the year-end figures the CURRENT PACE implies. */
  forecastReservePercent: Prisma.Decimal | null;
  /** Which basis the two percentages above are on, so an alert can name it. */
  reserveBasis: ReserveBasis;
  reserveDenominator: ReserveDenominator;
  /** True once the figures are outturn rather than projection — changes the tense. */
  reserveIsActual: boolean;
  /** The statutory floor in dollars: the state minimum applied to the divisor. */
  requiredReserve: Prisma.Decimal;
  /** Unassigned above that floor. Negative is a shortfall against it. */
  excessUnassigned: Prisma.Decimal;
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
 * A THRESHOLD, set the way the figure beside it is set.
 *
 * The policy value is a plain number, so `${c}%` rendered "2%" in a sentence whose other
 * percentage came from `pct` and read "-10.0%" — one decimal place apart inside one clause,
 * which reads as two different kinds of number rather than a figure and the line it crossed.
 */
const thr = (v: number) => `${v.toFixed(1)}%`;

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
 * NAMING THE DENOMINATOR IN THE SENTENCE — why these three helpers exist.
 *
 * There are now three reserve percentages a district can see in one sitting: the
 * budget-driven projection, the pace-driven projection, and last year's outturn. They are
 * all "the reserve", they are all a percentage, and two of them can be on screen together.
 *
 * A sentence reading "Unassigned reserve is 3.5%, below your 3% warning threshold" does not
 * say which of the three it is or what it is 3.5% OF — and the district's own workbook
 * measures against revenue while the platform used to measure against expenditures, so
 * "3.5%" was already a figure two people could read two ways. Every reserve alert now says
 * both: the tense, and the divisor.
 * ---------------------------------------------------------------------------
 */
const reserveSubject = (f: AlertFacts) =>
  f.reserveIsActual ? "Unassigned reserve" : "Projected unassigned reserve";

const ofBasis = (f: AlertFacts) => `of ${RESERVE_DENOMINATOR_LABELS[f.reserveDenominator]}`;

/**
 * The dollar gap to the statutory floor, appended only when the district is actually short.
 *
 * A percentage below a threshold tells a board it has a problem; the dollars tell it how
 * big. `excessUnassigned` is already the difference, so this costs nothing to say.
 */
const shortfall = (f: AlertFacts) =>
  f.excessUnassigned.isNegative()
    ? ` That is ${money(f.excessUnassigned.abs())} short of the ${money(f.requiredReserve)} required reserve.`
    : "";

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

/**
 * The revenue the district should have collected by now — the figure the percentage in
 * these two alerts is actually measured against.
 *
 * Recovered from the variance rather than passed in: `v` IS (ytd − expected) ÷ expected,
 * so expected = ytd ÷ (1 + v/100), exactly. Worth the inversion because the sentence used
 * to pair a PRO-RATED percentage with the FULL-YEAR budget — "Collections are 23.7% below
 * budget ($39.86M against $208.9M)" — two figures a reader cannot get 23.7% out of, in
 * any month but the last. See `expectedRevenue` in lib/alerts/engine.ts.
 *
 * Null where the inversion has nothing to divide by: v = −100% is a district that has
 * collected nothing, and the sentence drops its parenthetical rather than invent one.
 */
function expectedYtd(f: AlertFacts, v: Prisma.Decimal): Prisma.Decimal | null {
  const factor = v.dividedBy(100).plus(1);
  return factor.isZero() ? null : f.revenueYtd.dividedBy(factor);
}

/** " ($39.86M against $52.23M)", or nothing at all when the basis cannot be stated. */
function against(f: AlertFacts, v: Prisma.Decimal): string {
  const expected = expectedYtd(f, v);
  return expected === null ? "" : ` (${money(f.revenueYtd)} against ${money(expected)})`;
}

export const ALERTS: AlertDef[] = [
  // ===================== Revenue (5) =====================
  {
    id: "REVENUE_BELOW_BUDGET",
    group: "revenue",
    title: "Collections Below Expected",
    evaluate: (f, p) => {
      const v = f.revenueVariancePercent;
      if (v === null || !v.isNegative()) return null;
      const severity = revenueCurrentSeverity(f, p);
      if (severity === null) return null;
      /**
       * DOLLARS FIRST, the percentage in the parenthesis behind them — the same shape
       * MATERIAL_FORECAST_VARIANCE settled on, and for the same reason. "23.7% below
       * expected YTD levels ($39.86M against $52.23M)" made a reader subtract two figures
       * to find the shortfall, which is the one thing the sentence is about.
       *
       * The percentage carries it alone where the basis cannot be stated — v = −100% is a
       * district that has collected nothing, and there is no expected figure to subtract
       * from. See `expectedYtd`.
       */
      const expected = expectedYtd(f, v);
      const message =
        expected === null
          ? `Revenue collections are ${pct(v.abs())} below expected year-to-date levels.`
          : `Revenue collections are ${money(expected.minus(f.revenueYtd))} below expected ` +
            `year-to-date levels (${pct(v.abs())}).`;
      return { severity, message };
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
        message: `Collections are ${pct(v)} above expected YTD levels${against(f, v)}. Worth confirming the budget is current.`,
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
    title: "Material Forecast Variance",
    // One alert, either severity — the workbook lists it once, firing "at the warning or
    // critical threshold".
    evaluate: (f, p) => {
      const v = f.expenditureForecastVariancePercent;
      const severity = expenditureForecastSeverity(v, p);
      if (severity === null) return null;
      /**
       * DOLLARS FIRST, the percentage in the parenthesis behind them.
       *
       * "7.9% off budget ($191.84M against $208.3M)" made a reader do two jobs: work out
       * which way "off" ran by comparing the two figures, then subtract them to find out
       * how much. The gap IS the news, so the sentence states it — and states its
       * direction in a word, which is what "off" was standing in for. The workbook fires
       * this alert in both directions, so both words are needed.
       */
      const gap = f.expenditureForecast === null ? null : f.expenditureForecast.minus(f.expenditureBudget);
      const message =
        gap === null
          ? `Projected year-end expenditures are ${pct(v!.abs())} off budget.`
          : `Projected year-end expenditures are ${money(gap.abs())} ${
              gap.isNegative() ? "below" : "over"
            } budget (${pct(v!.abs())}).`;
      return { severity, message };
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
      return warn(
        `${reserveSubject(f)} is ${pct(v!)} ${ofBasis(f)}, below the ${target}% you aim to hold.`,
      );
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
      return warn(
        `${reserveSubject(f)} is ${pct(v!)} ${ofBasis(f)}, below your ${w}% warning threshold.${shortfall(f)}`,
      );
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
      return crit(
        `${reserveSubject(f)} is ${pct(v!)} ${ofBasis(f)}, below your ${c}% critical threshold.${shortfall(f)}`,
      );
    },
  },
  /**
   * The three forecast alerts read the PACE-driven projection, not the budget-driven one.
   *
   * Both are year-end figures since M6, so "Projected year-end reserve" no longer
   * distinguishes them — and these three firing beside the ones above with a different
   * number is exactly the situation the wording has to survive. "At the current projected
   * pace" is what makes the pair readable: the board's budget says one thing, the
   * district's actual rate of collection and spending says another, and the gap between
   * them is the signal.
   *
   * All three name the SUBJECT rather than "the year-end reserve" — the forecast screen
   * calls this figure the unassigned fund balance from its column heading to its trend
   * card, and an alert about it was the one place still calling it a reserve.
   */
  {
    id: "FORECAST_BELOW_TARGET",
    group: "fundBalance",
    title: "Forecast reserve below target",
    evaluate: (f, p) => {
      const v = f.forecastReservePercent;
      const target = n(p.fundBalance.target);
      if (!lt(v, target) || lt(v, n(p.fundBalance.forecastWarning))) return null;
      return warn(
        `At the current projected pace, unassigned fund balance is expected to end at ${pct(v!)} ${ofBasis(f)}, below the ${thr(target)} target.`,
      );
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
      return warn(
        `At the current projected pace, unassigned fund balance is expected to end at ${pct(v!)} ${ofBasis(f)}, below the ${thr(w)} warning threshold.`,
      );
    },
  },
  {
    id: "FORECAST_CRITICAL",
    group: "fundBalance",
    title: "Critical Forecast",
    evaluate: (f, p) => {
      const v = f.forecastReservePercent;
      const c = n(p.fundBalance.forecastCritical);
      if (!lt(v, c)) return null;
      return crit(
        `At the current projected pace, unassigned fund balance is expected to end at ${pct(v!)} ${ofBasis(f)}, below the ${thr(c)} critical threshold.`,
      );
    },
  },
  {
    id: "NEGATIVE_CHANGE_IN_FUND_BALANCE",
    group: "fundBalance",
    title: "Fund balance decreased",
    evaluate: (f) => {
      if (!f.changeInFundBalance.isNegative()) return null;
      return warn(
        `Fund balance has decreased by ${money(f.changeInFundBalance.abs())} this year.`,
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
