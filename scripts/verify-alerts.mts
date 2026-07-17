import "dotenv/config";
import { Prisma } from "../lib/generated/prisma/client";
import {
  ALERTS,
  alertsByGroup,
  reserveStatus,
  type AlertFacts,
} from "@/lib/alerts/catalog";
import { defaultPolicy, type PolicyValues } from "@/lib/policies/registry";

/**
 * Checks the alert catalogue: the workbook's counts, and that each alert fires on a
 * fixture built to trip exactly it while staying silent on the others.
 *
 * Pure — the catalogue takes facts and thresholds, not a database. That is the point of
 * making the alerts data: they can be tested without seeding a district.
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
const P = defaultPolicy();

/** Everything healthy: no alert should fire on this. */
function healthy(): AlertFacts {
  return {
    revenueBudget: d("12000000"),
    revenueYtd: d("2000000"),
    revenueVariancePercent: d("0"),
    revenueForecastVariancePercent: d("0"),
    revenueMomChangePercent: d("1"),

    expenditureBudget: d("12000000"),
    expenditureYtd: d("2000000"),
    encumbrances: d("1000000"),
    utilizationPercent: d("25"),
    availableBudget: d("9000000"),
    expenditureForecast: d("12000000"),
    expenditureForecastVariancePercent: d("0"),
    expenditureMomIncreasePercent: d("2"),

    endingCash: d("50000000"),
    daysCashOnHand: d("120"),
    forecastCash: d("40000000"),
    cashDecreasePercent: d("1"),

    reservePercent: d("8"),
    forecastReservePercent: d("8"),
    changeInFundBalance: d("1000000"),
    componentsExceedTotal: false,
  };
}

const fire = (f: AlertFacts, p: PolicyValues = P) =>
  ALERTS.map((a) => ({ id: a.id, hit: a.evaluate(f, p) })).filter((x) => x.hit !== null);

const fires = (id: string, f: AlertFacts, p: PolicyValues = P) =>
  fire(f, p).some((x) => x.id === id);

const severityOf = (id: string, f: AlertFacts, p: PolicyValues = P) =>
  fire(f, p).find((x) => x.id === id)?.hit?.severity;

// ===================== the catalogue =====================
console.log("\nThe workbook's counts");
assert(ALERTS.length === 27, `27 alerts (${ALERTS.length})`);
assert(alertsByGroup("revenue").length === 5, `revenue: 5 (${alertsByGroup("revenue").length})`);
assert(
  alertsByGroup("expenditure").length === 8,
  `expenditure: 8 (${alertsByGroup("expenditure").length})`,
);
assert(alertsByGroup("cash").length === 6, `cash: 6 (${alertsByGroup("cash").length})`);
assert(
  alertsByGroup("fundBalance").length === 8,
  `fund balance: 8 (${alertsByGroup("fundBalance").length})`,
);

const ids = ALERTS.map((a) => a.id);
assert(new Set(ids).size === ids.length, "no alert id is declared twice");
assert(
  ALERTS.every((a) => a.title.trim().length > 0),
  "every alert has a title",
);

// ===================== silence =====================
console.log("\nA healthy district hears nothing");
const quiet = fire(healthy());
assert(quiet.length === 0, `no alert fires on healthy figures (${quiet.map((q) => q.id).join(", ") || "none"})`);

// The most important property in the module: a missing figure must never read as "fine".
console.log("\nMissing data is silence, never an all-clear");
const blind: AlertFacts = {
  ...healthy(),
  revenueVariancePercent: null,
  revenueForecastVariancePercent: null,
  revenueMomChangePercent: null,
  utilizationPercent: null,
  expenditureForecast: null,
  expenditureForecastVariancePercent: null,
  expenditureMomIncreasePercent: null,
  daysCashOnHand: null,
  forecastCash: null,
  cashDecreasePercent: null,
  reservePercent: null,
  forecastReservePercent: null,
};
const blindHits = fire(blind).map((h) => h.id);
assert(
  blindHits.length === 0,
  `no alert fires on null facts (${blindHits.join(", ") || "none"}) — "we can't say" must not read as "all clear"`,
);

// ===================== revenue =====================
console.log("\nRevenue");
assert(
  fires("REVENUE_BELOW_BUDGET", { ...healthy(), revenueVariancePercent: d("-6") }),
  "6% below budget fires (warning is 5%)",
);
assert(
  severityOf("REVENUE_BELOW_BUDGET", { ...healthy(), revenueVariancePercent: d("-6") }) === "WARNING",
  "and is a warning",
);
assert(
  severityOf("REVENUE_BELOW_BUDGET", { ...healthy(), revenueVariancePercent: d("-11") }) === "CRITICAL",
  "11% below is critical (critical is 10%)",
);
assert(
  !fires("REVENUE_BELOW_BUDGET", { ...healthy(), revenueVariancePercent: d("-4") }),
  "4% below stays quiet",
);
assert(
  fires("REVENUE_ABOVE_BUDGET", { ...healthy(), revenueVariancePercent: d("7") }),
  "7% above budget fires",
);
assert(
  severityOf("REVENUE_ABOVE_BUDGET", { ...healthy(), revenueVariancePercent: d("50") }) === "WARNING",
  "over-collection is never critical — the spec calls it a valid state, not a failure",
);
assert(
  !fires("REVENUE_BELOW_BUDGET", { ...healthy(), revenueVariancePercent: d("7") }),
  "and being above budget doesn't fire the below-budget alert",
);
assert(
  fires("REVENUE_FORECAST_BELOW_BUDGET", { ...healthy(), revenueForecastVariancePercent: d("-4") }),
  "a forecast 4% below budget fires (forecast warning is 3%)",
);
assert(
  fires("REVENUE_FORECAST_ABOVE_BUDGET", { ...healthy(), revenueForecastVariancePercent: d("4") }),
  "and 4% above fires its own alert",
);
assert(
  fires("REVENUE_SIGNIFICANT_CHANGE", { ...healthy(), revenueMomChangePercent: d("-20") }),
  "a 20% month-over-month fall fires",
);
assert(
  fires("REVENUE_SIGNIFICANT_CHANGE", { ...healthy(), revenueMomChangePercent: d("20") }),
  "and so does a 20% rise — 'significant change' is not 'significant drop'",
);

// ===================== expenditure =====================
console.log("\nExpenditure");
assert(
  severityOf("BUDGET_UTILIZATION_WARNING", { ...healthy(), utilizationPercent: d("85") }) === "WARNING",
  "85% utilization warns (warning is 80%)",
);
assert(
  !fires("BUDGET_UTILIZATION_CRITICAL", { ...healthy(), utilizationPercent: d("85") }),
  "and does not also fire critical — one condition, one alert",
);
assert(
  fires("BUDGET_UTILIZATION_CRITICAL", { ...healthy(), utilizationPercent: d("96") }),
  "96% fires critical (critical is 95%)",
);
assert(
  !fires("BUDGET_UTILIZATION_WARNING", { ...healthy(), utilizationPercent: d("96") }),
  "and the warning steps aside",
);
assert(
  fires("BUDGET_EXCEEDED", { ...healthy(), utilizationPercent: d("101") }),
  "101% fires budget exceeded",
);
assert(
  !fires("BUDGET_UTILIZATION_CRITICAL", { ...healthy(), utilizationPercent: d("101") }),
  "which supersedes the critical utilization alert",
);
assert(
  fires("NEGATIVE_AVAILABLE_BUDGET", { ...healthy(), availableBudget: d("-1") }),
  "a negative available budget fires",
);
assert(
  severityOf("NEGATIVE_AVAILABLE_BUDGET", { ...healthy(), availableBudget: d("-1") }) === "CRITICAL",
  "as critical",
);
assert(
  fires("ENCUMBRANCES_EXCEED_AVAILABLE", {
    ...healthy(),
    expenditureBudget: d("100"),
    expenditureYtd: d("60"),
    encumbrances: d("50"),
    availableBudget: d("0"),
  }),
  "encumbrances above what's left after spend fires",
);
assert(
  !fires("ENCUMBRANCES_EXCEED_AVAILABLE", {
    ...healthy(),
    expenditureBudget: d("100"),
    expenditureYtd: d("60"),
    encumbrances: d("50"),
    availableBudget: d("-10"),
  }),
  "but steps aside when available budget is already negative — that alert says it louder",
);
assert(
  fires("FORECAST_EXCEEDS_BUDGET", { ...healthy(), expenditureForecast: d("13000000") }),
  "a forecast above budget fires",
);
assert(
  severityOf("MATERIAL_FORECAST_VARIANCE", {
    ...healthy(),
    expenditureForecastVariancePercent: d("4"),
  }) === "WARNING",
  "4% forecast variance warns (warning is 3%)",
);
assert(
  severityOf("MATERIAL_FORECAST_VARIANCE", {
    ...healthy(),
    expenditureForecastVariancePercent: d("6"),
  }) === "CRITICAL",
  "6% is critical — ONE alert, either severity, as the workbook lists it",
);
assert(
  severityOf("MATERIAL_FORECAST_VARIANCE", {
    ...healthy(),
    expenditureForecastVariancePercent: d("-6"),
  }) === "CRITICAL",
  "and it fires on a 6% UNDER-spend too — variance is a distance, not a direction",
);
assert(
  severityOf("SIGNIFICANT_MOM_INCREASE", { ...healthy(), expenditureMomIncreasePercent: d("18") }) ===
    "WARNING",
  "an 18% month-over-month jump warns (warning is 15%)",
);
assert(
  severityOf("SIGNIFICANT_MOM_INCREASE", { ...healthy(), expenditureMomIncreasePercent: d("30") }) ===
    "CRITICAL",
  "30% is critical (critical is 25%)",
);
assert(
  !fires("SIGNIFICANT_MOM_INCREASE", { ...healthy(), expenditureMomIncreasePercent: d("-30") }),
  "a 30% DROP in spending is not an increase — spending less is not an alert",
);

// ===================== cash =====================
console.log("\nCash");
assert(
  severityOf("DAYS_CASH_WARNING", { ...healthy(), daysCashOnHand: d("50") }) === "WARNING",
  "50 days warns (warning is 60)",
);
assert(
  !fires("DAYS_CASH_CRITICAL", { ...healthy(), daysCashOnHand: d("50") }),
  "and not critical",
);
assert(
  fires("DAYS_CASH_CRITICAL", { ...healthy(), daysCashOnHand: d("40") }),
  "40 days is critical (critical is 45)",
);
assert(
  !fires("DAYS_CASH_WARNING", { ...healthy(), daysCashOnHand: d("40") }),
  "and the warning steps aside",
);
assert(
  !fires("DAYS_CASH_WARNING", { ...healthy(), daysCashOnHand: d("90") }),
  "90 days is fine",
);
assert(
  fires("CASH_BALANCE_WARNING", { ...healthy(), endingCash: d("14000000") }),
  "$14M cash warns (threshold $15M)",
);
assert(
  fires("CASH_BALANCE_CRITICAL", { ...healthy(), endingCash: d("9000000") }),
  "$9M is critical (threshold $10M)",
);
assert(
  fires("SIGNIFICANT_CASH_DECREASE", { ...healthy(), cashDecreasePercent: d("12") }),
  "a 12% cash drop warns (warning is 10%)",
);
assert(
  severityOf("SIGNIFICANT_CASH_DECREASE", { ...healthy(), cashDecreasePercent: d("25") }) ===
    "CRITICAL",
  "25% is critical (critical is 20%)",
);
assert(
  fires("FORECAST_CASH_BELOW_THRESHOLD", { ...healthy(), forecastCash: d("14000000") }),
  "a forecast dip below $15M fires",
);

// ===================== fund balance =====================
console.log("\nFund balance");
assert(
  fires("FUND_BALANCE_BELOW_TARGET", { ...healthy(), reservePercent: d("4.5") }),
  "4.5% reserve is below the 5% target",
);
assert(
  !fires("FUND_BALANCE_WARNING", { ...healthy(), reservePercent: d("4.5") }),
  "but above the 4% warning, so only the nudge fires",
);
assert(
  fires("FUND_BALANCE_WARNING", { ...healthy(), reservePercent: d("3.5") }),
  "3.5% trips the warning",
);
assert(
  !fires("FUND_BALANCE_BELOW_TARGET", { ...healthy(), reservePercent: d("3.5") }),
  "and the below-target nudge steps aside",
);
assert(
  severityOf("FUND_BALANCE_CRITICAL", { ...healthy(), reservePercent: d("2") }) === "CRITICAL",
  "2% is critical (critical is 3%)",
);
assert(
  !fires("FUND_BALANCE_WARNING", { ...healthy(), reservePercent: d("2") }),
  "and only the critical fires",
);
assert(
  fires("FORECAST_BELOW_TARGET", { ...healthy(), forecastReservePercent: d("4.5") }),
  "a projected reserve below target fires",
);
assert(
  fires("FORECAST_CRITICAL", { ...healthy(), forecastReservePercent: d("2") }),
  "a projected reserve of 2% is critical",
);
assert(
  fires("NEGATIVE_CHANGE_IN_FUND_BALANCE", { ...healthy(), changeInFundBalance: d("-1") }),
  "a falling fund balance fires",
);
assert(
  !fires("NEGATIVE_CHANGE_IN_FUND_BALANCE", { ...healthy(), changeInFundBalance: d("0") }),
  "a flat one does not",
);
assert(
  fires("COMPONENTS_EXCEED_ENDING_BALANCE", { ...healthy(), componentsExceedTotal: true }),
  "components exceeding the projected balance fires",
);

// ===================== the district's own thresholds =====================
console.log("\nThe district's thresholds actually decide");
const strict = defaultPolicy();
strict.cash.daysCashWarning = 200;
assert(
  fires("DAYS_CASH_WARNING", healthy(), strict),
  "raising the days-cash threshold to 200 makes 120 days a warning",
);
const loose = defaultPolicy();
loose.fundBalance.warning = 1;
loose.fundBalance.critical = 0.5;
loose.fundBalance.target = 2;
assert(
  !fires("FUND_BALANCE_WARNING", { ...healthy(), reservePercent: d("3.5") }, loose),
  "and lowering the reserve thresholds silences an alert that fired on the defaults",
);
const off = defaultPolicy();
off.expenditure.flagNegativeAvailable = false;
assert(
  !fires("NEGATIVE_AVAILABLE_BUDGET", { ...healthy(), availableBudget: d("-1") }, off),
  "a check switched off in the policy does not fire",
);

// ===================== status ladder =====================
console.log("\nStatus labels come from the same thresholds");
assert(reserveStatus(d("8"), P) === "Strong", "8% is Strong (at or above the 5% target)");
assert(reserveStatus(d("5"), P) === "Strong", "5% — exactly the target — is Strong");
assert(reserveStatus(d("4.5"), P) === "Acceptable", "4.5% is Acceptable (below target, above warning)");
assert(reserveStatus(d("3.5"), P) === "Monitor", "3.5% is Monitor (below warning, above critical)");
assert(reserveStatus(d("2"), P) === "Action Required", "2% is Action Required (below critical)");
assert(reserveStatus(null, P) === null, "and no reserve figure gives no status, not a false Strong");

// The ladder and the alerts must agree — they read the same numbers.
const atCritical = { ...healthy(), reservePercent: d("2") };
assert(
  reserveStatus(atCritical.reservePercent, P) === "Action Required" &&
    fires("FUND_BALANCE_CRITICAL", atCritical),
  "a reserve that reads Action Required also raises the critical alert — one ladder, not two",
);

// ===================== every alert is reachable =====================
console.log("\nEvery alert can fire");
const TRIPS: Record<string, Partial<AlertFacts>> = {
  REVENUE_BELOW_BUDGET: { revenueVariancePercent: d("-11") },
  REVENUE_ABOVE_BUDGET: { revenueVariancePercent: d("7") },
  REVENUE_FORECAST_BELOW_BUDGET: { revenueForecastVariancePercent: d("-4") },
  REVENUE_FORECAST_ABOVE_BUDGET: { revenueForecastVariancePercent: d("4") },
  REVENUE_SIGNIFICANT_CHANGE: { revenueMomChangePercent: d("20") },
  BUDGET_UTILIZATION_WARNING: { utilizationPercent: d("85") },
  BUDGET_UTILIZATION_CRITICAL: { utilizationPercent: d("96") },
  BUDGET_EXCEEDED: { utilizationPercent: d("101") },
  NEGATIVE_AVAILABLE_BUDGET: { availableBudget: d("-1") },
  ENCUMBRANCES_EXCEED_AVAILABLE: {
    expenditureBudget: d("100"),
    expenditureYtd: d("60"),
    encumbrances: d("50"),
    availableBudget: d("0"),
  },
  FORECAST_EXCEEDS_BUDGET: { expenditureForecast: d("13000000") },
  MATERIAL_FORECAST_VARIANCE: { expenditureForecastVariancePercent: d("6") },
  SIGNIFICANT_MOM_INCREASE: { expenditureMomIncreasePercent: d("30") },
  CASH_BALANCE_WARNING: { endingCash: d("14000000") },
  CASH_BALANCE_CRITICAL: { endingCash: d("9000000") },
  DAYS_CASH_WARNING: { daysCashOnHand: d("50") },
  DAYS_CASH_CRITICAL: { daysCashOnHand: d("40") },
  FORECAST_CASH_BELOW_THRESHOLD: { forecastCash: d("14000000") },
  SIGNIFICANT_CASH_DECREASE: { cashDecreasePercent: d("12") },
  FUND_BALANCE_BELOW_TARGET: { reservePercent: d("4.5") },
  FUND_BALANCE_WARNING: { reservePercent: d("3.5") },
  FUND_BALANCE_CRITICAL: { reservePercent: d("2") },
  FORECAST_BELOW_TARGET: { forecastReservePercent: d("4.5") },
  FORECAST_WARNING: { forecastReservePercent: d("3.5") },
  FORECAST_CRITICAL: { forecastReservePercent: d("2") },
  NEGATIVE_CHANGE_IN_FUND_BALANCE: { changeInFundBalance: d("-1") },
  COMPONENTS_EXCEED_ENDING_BALANCE: { componentsExceedTotal: true },
};

// An alert nobody can trip is an alert a district will never receive, and nobody notices
// a missing alarm. Every one of the 27 needs a fixture here.
const missing = ALERTS.filter((a) => !TRIPS[a.id]).map((a) => a.id);
assert(missing.length === 0, `every alert has a fixture that trips it${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`);

const unreachable: string[] = [];
for (const [id, patch] of Object.entries(TRIPS)) {
  if (!fires(id, { ...healthy(), ...patch })) unreachable.push(id);
}
assert(unreachable.length === 0, `all 27 fire on their own fixture${unreachable.length ? ` (silent: ${unreachable.join(", ")})` : ""}`);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
