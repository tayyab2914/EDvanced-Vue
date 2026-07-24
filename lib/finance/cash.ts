import { Prisma } from "@/lib/generated/prisma/client";
import type { PeriodPoint } from "@/lib/finance/series";

/**
 * The Cash Position dashboard's figures (Spec §7).
 *
 * Everything here is PURE — it takes the period series lib/finance/series.ts already
 * loaded and derives from it. No queries, so the whole of §7 costs nothing beyond the four
 * the series already issued, and every function is testable without a database.
 *
 * Three of these figures are new in Milestone 3 and have no engine behind them: the 30-day
 * forecast, the twelve-month high/low, and cash volatility. They are derived rather than
 * uploaded, so each is labelled as such wherever it appears.
 */

const D = Prisma.Decimal;
const ZERO = new D(0);

/** Days in a year, for the days-cash divisor. Matches lib/alerts/engine.ts. */
const DAYS_IN_YEAR = 365;

/**
 * Days Cash on Hand = ending cash ÷ average daily expenditure, where average daily comes
 * from the annual ADOPTED budget (workbook §4.3).
 *
 * The adopted budget, not the year's spend so far: dividing by actuals would make a
 * district two months into its year look like it has a decade of cash.
 *
 * Null when there is no budget to divide by, or no cash file for the period. Never zero —
 * "we cannot work this out" and "you have no cash" are different sentences.
 */
export function daysCashOnHand(
  endingCash: Prisma.Decimal | null,
  annualExpenditureBudget: Prisma.Decimal,
): Prisma.Decimal | null {
  if (endingCash === null) return null;
  if (annualExpenditureBudget.isZero()) return null;
  const perDay = annualExpenditureBudget.dividedBy(DAYS_IN_YEAR);
  if (perDay.isZero()) return null;
  return endingCash.dividedBy(perDay);
}

export interface CashSummary {
  beginningCash: Prisma.Decimal | null;
  receiptsMtd: Prisma.Decimal | null;
  disbursementsMtd: Prisma.Decimal | null;
  /** Receipts − disbursements for the month. */
  netCashFlowMtd: Prisma.Decimal | null;
  endingCash: Prisma.Decimal | null;
  daysCashOnHand: Prisma.Decimal | null;
  /** Ending cash last month, for the month-over-month tiles. */
  previousEndingCash: Prisma.Decimal | null;
}

export function cashSummary(
  point: PeriodPoint | null,
  previous: PeriodPoint | null,
  annualExpenditureBudget: Prisma.Decimal,
): CashSummary {
  const receipts = point?.receiptsMtd ?? null;
  const disbursements = point?.disbursementsMtd ?? null;

  return {
    beginningCash: point?.beginningCash ?? null,
    receiptsMtd: receipts,
    disbursementsMtd: disbursements,
    netCashFlowMtd:
      receipts !== null && disbursements !== null ? receipts.minus(disbursements) : null,
    endingCash: point?.endingCash ?? null,
    daysCashOnHand: daysCashOnHand(point?.endingCash ?? null, annualExpenditureBudget),
    previousEndingCash: previous?.endingCash ?? null,
  };
}

/**
 * Cash composition — §7.2's donut.
 *
 * The importer takes investment, restricted and unrestricted balances as OPTIONAL columns,
 * so a district may supply none of them. When the parts do not account for the whole, the
 * remainder becomes "Other" rather than being quietly dropped: a donut whose slices do not
 * sum to the figure printed in its centre is worse than no donut.
 *
 * When NOTHING is broken out, this returns null and the card says so. It does not draw a
 * single 100% slice labelled "Other", which would look like an answer.
 */
export interface CashComposition {
  operating: Prisma.Decimal;
  investment: Prisma.Decimal;
  restricted: Prisma.Decimal;
  other: Prisma.Decimal;
  total: Prisma.Decimal;
}

export function cashComposition(point: PeriodPoint | null): CashComposition | null {
  if (!point || point.endingCash === null) return null;

  const investment = point.investmentBalance ?? ZERO;
  const restricted = point.restrictedCash ?? ZERO;
  const operating = point.unrestrictedCash ?? ZERO;

  if (investment.isZero() && restricted.isZero() && operating.isZero()) return null;

  const accounted = operating.plus(investment).plus(restricted);
  const other = point.endingCash.minus(accounted);

  return {
    operating,
    investment,
    restricted,
    // A negative remainder means the parts exceed the whole, which is a data problem, not
    // a category. Clamp rather than draw a negative slice.
    other: other.isNegative() ? ZERO : other,
    total: point.endingCash,
  };
}

/**
 * Receipts, disbursements and net flow for the YEAR to date — §3.2c's Cash Position card,
 * which the client's mockup states in YTD terms rather than the month's.
 *
 * Summed from the monthly points rather than queried, because the cash file carries a
 * month's movement and no cumulative column: a district that skipped a month would
 * otherwise have that month silently absorbed into the next one's total. Periods with no
 * cash file contribute nothing and are counted, so the card can say how many months it is
 * actually adding up.
 */
export interface CashFlowYtd {
  receipts: Prisma.Decimal | null;
  disbursements: Prisma.Decimal | null;
  net: Prisma.Decimal | null;
  /** Ending cash of the earliest reporting period's opening — the year's starting point. */
  beginningCash: Prisma.Decimal | null;
  months: number;
}

export function cashFlowYtd(points: PeriodPoint[]): CashFlowYtd {
  const withFlow = points.filter((p) => p.receiptsMtd !== null && p.disbursementsMtd !== null);
  const withCash = points.filter((p) => p.beginningCash !== null);

  if (withFlow.length === 0) {
    return {
      receipts: null,
      disbursements: null,
      net: null,
      beginningCash: withCash[0]?.beginningCash ?? null,
      months: 0,
    };
  }

  const receipts = withFlow.reduce((a, p) => a.plus(p.receiptsMtd!), ZERO);
  const disbursements = withFlow.reduce((a, p) => a.plus(p.disbursementsMtd!), ZERO);

  return {
    receipts,
    disbursements,
    net: receipts.minus(disbursements),
    beginningCash: withCash[0]?.beginningCash ?? null,
    months: withFlow.length,
  };
}

/**
 * Cash as a share of the year's spending — the "Cash % of expenditures" figure on §3.2c.
 *
 * Null when there is no spending to be a share of, never zero: a district in month one with
 * no committed expenditure detail has an undefined ratio, not a 0% one.
 */
export function cashPercentOfExpenditures(
  endingCash: Prisma.Decimal | null,
  expenditureYtd: Prisma.Decimal | null,
): Prisma.Decimal | null {
  if (endingCash === null || expenditureYtd === null || expenditureYtd.isZero()) return null;
  return endingCash.dividedBy(expenditureYtd).times(100);
}

// ===================== trailing statistics =====================

/** Only the periods that actually reported cash. */
function cashPoints(points: PeriodPoint[]): { period: number; cash: Prisma.Decimal }[] {
  return points
    .filter((p): p is PeriodPoint & { endingCash: Prisma.Decimal } => p.endingCash !== null)
    .map((p) => ({ period: p.period, cash: p.endingCash }));
}

export interface CashStats {
  high: { period: number; value: Prisma.Decimal } | null;
  low: { period: number; value: Prisma.Decimal } | null;
  average: Prisma.Decimal | null;
  volatility: Volatility | null;
  /** How many periods the statistics are drawn from — the reader's confidence. */
  observations: number;
}

export type Volatility = "Low" | "Moderate" | "High";

/**
 * Twelve-month high, low, average and volatility — the strip under §7.2's trend chart.
 *
 * Volatility is the coefficient of variation (standard deviation ÷ mean), which is the
 * only honest way to compare "how much does this move" across districts of different
 * sizes: a $2M swing is nothing to a $400M district and existential to a $10M one.
 *
 * The bands are judgement, and stated as such: under 10% of the mean reads as steady
 * month-to-month operations, over 25% is a district whose cash genuinely lurches. They are
 * NOT district-configurable, because this is a descriptive label rather than a threshold
 * anyone is measured against — no alert reads it.
 *
 * Returns nulls below three observations. Two points have a standard deviation and it
 * means nothing.
 */
export function cashStats(points: PeriodPoint[]): CashStats {
  const series = cashPoints(points);
  if (series.length === 0) {
    return { high: null, low: null, average: null, volatility: null, observations: 0 };
  }

  let high = series[0];
  let low = series[0];
  let sum = ZERO;
  for (const p of series) {
    if (p.cash.greaterThan(high.cash)) high = p;
    if (p.cash.lessThan(low.cash)) low = p;
    sum = sum.plus(p.cash);
  }

  const average = sum.dividedBy(series.length);

  let volatility: Volatility | null = null;
  if (series.length >= 3 && !average.isZero()) {
    const variance = series
      .reduce((a, p) => a.plus(p.cash.minus(average).pow(2)), ZERO)
      .dividedBy(series.length);
    // Decimal has no sqrt across all versions; the magnitudes here are well inside a
    // double's exact range and this feeds a three-way label, not a ledger figure.
    const stdDev = new D(Math.sqrt(Number(variance.toFixed(4))));
    const cv = stdDev.dividedBy(average.abs()).times(100);
    volatility = cv.lessThan(10) ? "Low" : cv.lessThan(25) ? "Moderate" : "High";
  }

  return {
    high: { period: high.period, value: high.cash },
    low: { period: low.period, value: low.cash },
    average,
    volatility,
    observations: series.length,
  };
}

/**
 * The 30-day cash forecast — §7.2's dashed forward line.
 *
 * Straight-line from the trailing average net cash flow, for the same reason
 * `projectYearEnd` straight-lines: a monthly file carries no seasonality, so a cleverer
 * curve would be inventing information the district never sent.
 *
 * Deliberately NOT read by any alert. It is a projection drawn from at most twelve points
 * of history, and firing a cash warning off it would be alerting on an extrapolation.
 * §9.6 says so explicitly.
 *
 * Null below two observations — one month of cash cannot imply a direction.
 */
export function thirtyDayForecast(
  points: PeriodPoint[],
  opts: { lookback?: number } = {},
): { value: Prisma.Decimal; basis: number } | null {
  const series = cashPoints(points);
  if (series.length < 2) return null;

  const lookback = Math.max(2, Math.min(opts.lookback ?? 3, series.length));
  const window = series.slice(-lookback);

  // Average month-over-month movement across the window.
  let movement = ZERO;
  for (let i = 1; i < window.length; i++) {
    movement = movement.plus(window[i].cash.minus(window[i - 1].cash));
  }
  const perMonth = movement.dividedBy(window.length - 1);

  return { value: window[window.length - 1].cash.plus(perMonth), basis: window.length };
}

/**
 * Has net cash flow been negative in more than half of the last N months?
 *
 * §7.2's reference shows "Net cash flow has been negative in 2 of the last 3 months" as an
 * informational note. A single negative month is normal — payroll timing, a bond payment —
 * so the fact worth stating is the run, not the instance.
 */
export function negativeCashFlowRun(
  points: PeriodPoint[],
  window = 3,
): { negative: number; of: number } | null {
  const withFlow = points.filter(
    (p) => p.receiptsMtd !== null && p.disbursementsMtd !== null,
  );
  if (withFlow.length === 0) return null;

  const recent = withFlow.slice(-window);
  const negative = recent.filter((p) => p.receiptsMtd!.lessThan(p.disbursementsMtd!)).length;
  return { negative, of: recent.length };
}
