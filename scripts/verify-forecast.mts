import "dotenv/config";
import { Prisma } from "../lib/generated/prisma/client";
import { projectYearEnd } from "@/lib/forecast/engine";

/**
 * Checks the forecast arithmetic.
 *
 * Pure — projectYearEnd is the whole of the year-end engine, and it takes numbers rather
 * than a database. The category and multi-year functions are thin shells over it plus
 * aggregates that verify:finance already covers, so testing them again would mostly test
 * Prisma.
 */
let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

const D = Prisma.Decimal;
const d = (n: string | number) => new D(n);

console.log("\nStraight-line projection");
// Two months in, $2M collected: the pace says $12M by year end.
let p = projectYearEnd({ actualYtd: d("2000000"), budget: d("12000000"), periodsElapsed: 2 });
assert(p.projected.equals(d("12000000")), "$2M over 2 periods projects to $12M for 12");
assert(p.variance.isZero(), "and matches a $12M budget exactly");
assert(p.variancePercent?.isZero() === true, "so the variance is 0%");

// Same pace, smaller budget — the district is on course to overspend.
p = projectYearEnd({ actualYtd: d("2000000"), budget: d("10000000"), periodsElapsed: 2 });
assert(p.projected.equals(d("12000000")), "the projection doesn't care what the budget is");
assert(p.variance.equals(d("2000000")), "variance is $2M over");
assert(p.variancePercent?.toFixed(2) === "20.00", "which is 20% of a $10M budget");

// Under budget: variance is negative, not an absolute.
p = projectYearEnd({ actualYtd: d("1000000"), budget: d("12000000"), periodsElapsed: 2 });
assert(p.projected.equals(d("6000000")), "half the pace projects to half the year");
assert(p.variance.equals(d("-6000000")), "and the variance is negative — under, not just 'off'");
assert(p.variancePercent?.toFixed(2) === "-50.00", "−50%");

console.log("\nThe district's growth assumption");
p = projectYearEnd({
  actualYtd: d("2000000"),
  budget: d("12000000"),
  periodsElapsed: 2,
  growthPercent: 2, // the workbook's State Revenue assumption
});
assert(p.projected.equals(d("12240000")), "2% growth lifts $12M to $12.24M");
p = projectYearEnd({
  actualYtd: d("2000000"),
  budget: d("12000000"),
  periodsElapsed: 2,
  growthPercent: 0, // the workbook's Federal Revenue assumption
});
assert(p.projected.equals(d("12000000")), "0% growth leaves the straight line alone");
p = projectYearEnd({
  actualYtd: d("2000000"),
  budget: d("12000000"),
  periodsElapsed: 2,
  growthPercent: -5,
});
assert(p.projected.equals(d("11400000")), "a negative assumption is honoured — districts do forecast declines");
p = projectYearEnd({
  actualYtd: d("2000000"),
  budget: d("12000000"),
  periodsElapsed: 2,
  growthPercent: null,
});
assert(p.projected.equals(d("12000000")), "no assumption means no adjustment, not a crash");

console.log("\nEdge cases");
// Period 0: nothing has happened. Dividing by it would be an exception on the first day
// of a fiscal year, which is exactly when a district opens the dashboard.
p = projectYearEnd({ actualYtd: d("0"), budget: d("12000000"), periodsElapsed: 0 });
assert(p.projected.equals(d("12000000")), "before any period closes, the budget IS the forecast");
assert(p.variance.isZero(), "so nothing looks off track on day one");

p = projectYearEnd({ actualYtd: d("0"), budget: d("12000000"), periodsElapsed: 3 });
assert(p.projected.isZero(), "three periods with nothing collected projects nothing");
assert(p.variance.equals(d("-12000000")), "which is a $12M shortfall, and should be");

p = projectYearEnd({ actualYtd: d("12000000"), budget: d("0"), periodsElapsed: 12 });
assert(p.variancePercent === null, "a zero budget gives a null percentage, not a division by zero");
assert(p.variance.equals(d("12000000")), "though the dollar variance is still real");

// A full year of actuals is not a projection at all — it is the answer.
p = projectYearEnd({ actualYtd: d("11500000"), budget: d("12000000"), periodsElapsed: 12 });
assert(p.projected.equals(d("11500000")), "at period 12 the projection IS the actual");

p = projectYearEnd({ actualYtd: d("1000000"), budget: d("12000000"), periodsElapsed: 99 });
assert(p.periodsElapsed === 12, "a period beyond the year is clamped rather than trusted");

console.log("\nPrecision");
p = projectYearEnd({ actualYtd: d("1000000.01"), budget: d("6000000"), periodsElapsed: 1 });
assert(p.projected.equals(d("12000000.12")), "cents survive the multiply — Decimal, not float");
p = projectYearEnd({ actualYtd: d("100"), budget: d("0"), periodsElapsed: 7 });
assert(
  p.projected.toFixed(4) === "171.4286",
  `an inexact division keeps its precision (got ${p.projected.toFixed(4)})`,
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
