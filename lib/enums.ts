// Client-safe re-export of Prisma-generated enums (pure constants + types).
// Explicit named re-exports (not `export *`) so static named bindings link
// reliably across bundlers and the tsx/Node ESM loader.
export {
  Role,
  UserStatus,
  DistrictStatus,
  TokenType,
  ExternalAccessStatus,
  ExternalAccessLevel,
  // M2 — the data pipeline
  PeriodType,
  BudgetType,
  BudgetKind,
  DatasetKind,
  ImportStatus,
  ImportAction,
  Severity,
  FundBalanceField,
  ActivityClass,
} from "@/lib/generated/prisma/enums";

// ===================== M4: the configurable forecast =====================
//
// Stored as strings rather than Postgres enums, following the same pattern as
// CostCenterType.category: these are the values of a screen's dropdown, and adding one
// should be a deploy rather than a migration. The value lists live here so the action, the
// engine and the form all read the same set.

/** The four designated components a fund balance splits into, beside unassigned. */
export const FUND_BALANCE_COMPONENT_VALUES = [
  "NONSPENDABLE",
  "RESTRICTED",
  "COMMITTED",
  "ASSIGNED",
] as const;

export type FundBalanceComponent = (typeof FUND_BALANCE_COMPONENT_VALUES)[number];

export const FUND_BALANCE_COMPONENT_LABELS: Record<FundBalanceComponent, string> = {
  NONSPENDABLE: "Nonspendable",
  RESTRICTED: "Restricted",
  COMMITTED: "Committed",
  ASSIGNED: "Assigned",
};

/**
 * How a component is carried into the projected years.
 *
 * CARRY_FORWARD          — held at today's balance for every projected year. The safe
 *                          default, and what the platform did before districts could choose.
 * ONE_TIME_CARRYFORWARD  — today's balance survives into the first projected year and is
 *                          released after it. For a carryforward a district intends to spend.
 * INCREASE_BY_PERCENT    — compounds at the district's own annual rate.
 * MANUAL_OVERRIDE        — the district types a figure per year, on FundBalanceProjection.
 */
export const FORECAST_METHOD_VALUES = [
  "CARRY_FORWARD",
  "ONE_TIME_CARRYFORWARD",
  "INCREASE_BY_PERCENT",
  "MANUAL_OVERRIDE",
] as const;

export type ForecastMethod = (typeof FORECAST_METHOD_VALUES)[number];

export const FORECAST_METHOD_LABELS: Record<ForecastMethod, string> = {
  CARRY_FORWARD: "Carry Forward",
  ONE_TIME_CARRYFORWARD: "One-time Carry Forward",
  INCREASE_BY_PERCENT: "Increase by %",
  MANUAL_OVERRIDE: "Manual Override",
};

export const FORECAST_METHOD_HELP: Record<ForecastMethod, string> = {
  CARRY_FORWARD: "Maintains the current balance in each projected year.",
  ONE_TIME_CARRYFORWARD:
    "Carries the balance into the first projected year, then releases it in subsequent years. Use for amounts expected to be spent.",
  INCREASE_BY_PERCENT: "Compounds each year at the annual increase you set.",
  MANUAL_OVERRIDE: "Uses the amount entered for each projected year.",
};

// ===================== M6: the reserve measurement basis =====================
//
// WHAT A RESERVE PERCENTAGE IS A PERCENTAGE OF.
//
// Florida measures a district's general fund reserve against REVENUE — s. 1011.051 states
// its 3% and 2% triggers as a share of general fund revenues, so a Florida district's board
// policy, its state reporting and this platform have to agree on that denominator or the
// number on screen is not the number they are held to.
//
// Other states commonly measure against EXPENDITURE, which is what the platform did before
// this. Neither is more correct; they are different questions. So the basis is the
// district's setting rather than the platform's opinion, defaulting to REVENUE because
// Florida is the first market. See `fundBalance.measureAgainstRevenue` in
// lib/policies/registry.ts, which is the stored form of this choice.
//
// A named type rather than a bare boolean because the labels move with it: every caption
// that says "of projected General Fund revenue" has to say "of budgeted General Fund
// expenditures" instead, and a boolean threaded through six modules is how one of them
// ends up saying the wrong one.
export const RESERVE_BASIS_VALUES = ["REVENUE", "EXPENDITURE"] as const;

export type ReserveBasis = (typeof RESERVE_BASIS_VALUES)[number];

/** For a sentence: "…as a share of {…}". */
export const RESERVE_BASIS_LABELS: Record<ReserveBasis, string> = {
  REVENUE: "General Fund revenue",
  EXPENDITURE: "budgeted General Fund expenditures",
};

/**
 * Where a denominator came from, so a caption can say so precisely.
 *
 * The distinction that matters to a reader is PROJECTED versus ACTUAL: a reserve of 5.26%
 * against a budget the board may still amend is a different claim from 17.23% against the
 * money a district actually collected, and a tile that renders both the same way invites a
 * board to compare them as though they were.
 */
export const RESERVE_DENOMINATOR_VALUES = [
  "AMENDED_REVENUE",
  "ACTUAL_REVENUE",
  "ADOPTED_REVENUE",
  "ADOPTED_EXPENDITURE",
] as const;

export type ReserveDenominator = (typeof RESERVE_DENOMINATOR_VALUES)[number];

export const RESERVE_DENOMINATOR_LABELS: Record<ReserveDenominator, string> = {
  AMENDED_REVENUE: "projected General Fund revenue",
  ACTUAL_REVENUE: "actual General Fund revenue collected",
  ADOPTED_REVENUE: "adopted General Fund revenue budget",
  ADOPTED_EXPENDITURE: "budgeted General Fund expenditures",
};

export function isReserveBasis(v: string): v is ReserveBasis {
  return (RESERVE_BASIS_VALUES as readonly string[]).includes(v);
}

export function isForecastMethod(v: string): v is ForecastMethod {
  return (FORECAST_METHOD_VALUES as readonly string[]).includes(v);
}

export function isFundBalanceComponent(v: string): v is FundBalanceComponent {
  return (FUND_BALANCE_COMPONENT_VALUES as readonly string[]).includes(v);
}
