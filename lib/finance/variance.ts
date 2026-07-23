import { Prisma } from "@/lib/generated/prisma/client";

/**
 * "Variance" means two different things, and this product needs both.
 *
 * The spec asks for both without distinguishing them, and the code already contains both:
 * §3.1 tile 1 wants "83.45% of Budget" while §4.1 tile 2 wants "11.50% Above Budget", and
 * those are not the same arithmetic on the same numbers. Left implicit, a dashboard ships
 * two tiles that disagree and neither is wrong.
 *
 * So they are named, they live together, and no caller can pick one by accident:
 *
 *   CONSUMPTION  actual ÷ FULL-YEAR budget.
 *                "How much of the budget have we used?"
 *                Rises through the year by construction. In month two it SHOULD read
 *                ~17%, and that is not a warning about anything.
 *
 *   PACE         actual − budget PRO-RATED to the periods elapsed.
 *                "Are we on track?"
 *                Comparable in any month, which is the only reason a threshold on it
 *                means anything. This is what lib/alerts/engine.ts already computes for
 *                revenueVariancePercent, so a tile and the alert beside it agree.
 *
 * Using consumption where pace belongs is the classic finance-dashboard bug: every
 * district is "87% below budget" every August, forever, and the alert that fires
 * unconditionally is the alert everybody turns off.
 *
 * PRO-RATING ASSUMPTION, worth confirming with Gary (carried forward from
 * lib/alerts/engine.ts): straight-line pro-rating has no seasonality, and a Florida
 * district collecting ad valorem taxes in November genuinely does look behind in August.
 * The workbook says only "actual revenue is off budget by 5%" and does not say against
 * what. Straight-line is the only reading under which the setting means anything month to
 * month, but it is a reading.
 *
 * Decimal throughout. Pure — no db, no server-only, so `verify:charts` can exercise it.
 */

const D = Prisma.Decimal;
const ZERO = new D(0);

export const PERIODS_IN_YEAR = 12;

export interface Variance {
  actual: Prisma.Decimal;
  /** What it is being measured against — full-year for consumption, pro-rated for pace. */
  budget: Prisma.Decimal;
  /** actual − budget. Positive is over. */
  amount: Prisma.Decimal;
  /**
   * As a share of the budget, or null when there is no budget to be a share of.
   *
   * Null rather than zero, always. "No budget was uploaded" and "you are exactly on
   * budget" are different facts and only one of them is reassuring.
   */
  percent: Prisma.Decimal | null;
}

/**
 * How much of the full-year budget has been used.
 *
 * `percent` here is the "% of Budget" column and sub-line. Note it is NOT a variance in
 * the everyday sense — it is a ratio, and it is 100% when the budget is exactly spent.
 */
export function consumption(
  actualYtd: Prisma.Decimal,
  fullYearBudget: Prisma.Decimal,
): Variance {
  const amount = actualYtd.minus(fullYearBudget);
  return {
    actual: actualYtd,
    budget: fullYearBudget,
    amount,
    percent: fullYearBudget.isZero() ? null : actualYtd.dividedBy(fullYearBudget).times(100),
  };
}

/**
 * Whether the district is on pace, against the budget expected by now.
 *
 * `periodsElapsed` is clamped to the year: a period beyond 12 would pro-rate to more than
 * the whole budget and report a district as behind on money it was never going to collect.
 */
export function pace(
  actualYtd: Prisma.Decimal,
  fullYearBudget: Prisma.Decimal,
  periodsElapsed: number,
): Variance {
  const elapsed = Math.max(0, Math.min(PERIODS_IN_YEAR, Math.floor(periodsElapsed)));
  const expected = fullYearBudget.times(elapsed).dividedBy(PERIODS_IN_YEAR);
  const amount = actualYtd.minus(expected);

  return {
    actual: actualYtd,
    budget: expected,
    amount,
    // Zero elapsed periods means nothing was expected yet, so being "over" is meaningless.
    percent: expected.isZero() ? null : amount.dividedBy(expected).times(100),
  };
}

/**
 * Budget utilisation — spend PLUS encumbrances against budget.
 *
 * Kept apart from `consumption` even though the arithmetic is nearly the same, because
 * the numerator is different and districts run on the difference. Money that is committed
 * but not yet paid is spent as far as a budget is concerned, and a utilisation figure that
 * ignored encumbrances would tell a district it had room it does not have.
 */
export function utilisation(
  actualYtd: Prisma.Decimal,
  encumbrances: Prisma.Decimal,
  budget: Prisma.Decimal,
): Variance {
  const committed = actualYtd.plus(encumbrances);
  return {
    actual: committed,
    budget,
    amount: committed.minus(budget),
    percent: budget.isZero() ? null : committed.dividedBy(budget).times(100),
  };
}

/** Budget − spend − encumbrances. What is genuinely left to commit. */
export function availableBudget(
  budget: Prisma.Decimal,
  actualYtd: Prisma.Decimal,
  encumbrances: Prisma.Decimal,
): Prisma.Decimal {
  return budget.minus(actualYtd).minus(encumbrances);
}

/**
 * How far through the fiscal year the district is, in days — §4.1 and §5.1 tile 6.
 *
 * Derived from the period rather than from today's date. A district reviewing April's
 * close in June should see April's position, and a tile reading "today" would silently
 * disagree with every other figure on the page.
 */
export function daysIntoFiscalYear(period: number): { elapsed: number; total: number } {
  const total = 365;
  const elapsed = Math.round((Math.max(0, Math.min(PERIODS_IN_YEAR, period)) / PERIODS_IN_YEAR) * total);
  return { elapsed, total };
}

/** Sums a column of possibly-absent figures without letting a null become a zero. */
export function sum(values: (Prisma.Decimal | null | undefined)[]): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>((a, b) => (b ? a.plus(b) : a), ZERO);
}
