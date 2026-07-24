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
  CARRY_FORWARD: "Carry forward",
  ONE_TIME_CARRYFORWARD: "One-time carryforward",
  INCREASE_BY_PERCENT: "Increase by %",
  MANUAL_OVERRIDE: "Manual override",
};

export const FORECAST_METHOD_HELP: Record<ForecastMethod, string> = {
  CARRY_FORWARD: "Held at today's balance in every projected year.",
  ONE_TIME_CARRYFORWARD:
    "Carried into the first projected year, then released — for a balance the district intends to spend.",
  INCREASE_BY_PERCENT: "Compounds each year at the annual increase you set.",
  MANUAL_OVERRIDE: "Uses the figure you type for each projected year.",
};

export function isForecastMethod(v: string): v is ForecastMethod {
  return (FORECAST_METHOD_VALUES as readonly string[]).includes(v);
}

export function isFundBalanceComponent(v: string): v is FundBalanceComponent {
  return (FUND_BALANCE_COMPONENT_VALUES as readonly string[]).includes(v);
}
