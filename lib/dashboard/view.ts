/**
 * "View by" — one visualization, several perspectives.
 *
 * The client's instruction was explicitly an anti-sprawl one: "instead of building multiple
 * dashboards or charts, every major visualization should have a small View By or Group By
 * selector that lets users change the perspective … without requiring a separate report".
 *
 * So a view is a URL PARAMETER resolved on the server, and the card re-renders from a
 * different aggregate. Not a second card, and not a client-side refetch: the same bargain
 * the fund and period selectors strike (components/dashboard/scope-bar.tsx). Every figure
 * stays server-side, so no Prisma.Decimal crosses into the browser and the page still
 * prints to PDF.
 *
 * THE FIRST OPTION IN EACH LIST IS THE DEFAULT, and in every case it is exactly what the
 * card showed before the selector existed. A district that never touches the control sees
 * no change, and no saved link breaks.
 *
 * Client-safe (no server-only import): both the server page and the client control read
 * these lists, which is what keeps the label in the dropdown and the label on the card from
 * drifting apart.
 */

export interface ViewOption<K extends string = string> {
  value: K;
  label: string;
}

/**
 * The URL parameter a "view by" selector writes.
 *
 * One per page rather than one per card, deliberately: a page carries a single such control
 * today, and a shared name keeps the query string readable —
 * `?fy=2026-27&period=5&groupBy=project` says what it is. A second selector on the same
 * page would take its own name.
 */
export const VIEW_PARAM = "groupBy";

/**
 * Validates a raw URL value against the option list, falling back to the default.
 *
 * Falls back SILENTLY, unlike lib/dashboard/scope.ts, which announces a substituted period.
 * A period the district has no data for is a fact about their data and worth saying; a
 * `groupBy` value that is not on the list is a hand-edited URL, and there is nothing to
 * tell them beyond what the control already shows.
 */
export function resolveView<K extends string>(
  options: readonly ViewOption<K>[],
  raw: string | undefined,
): K {
  return options.find((o) => o.value === raw)?.value ?? options[0].value;
}

// ===================== the option lists =====================

/**
 * Expenditures — "the user could switch between Object, Function, Cost Center Type, or
 * Project without requiring a separate report".
 *
 * All four are columns on the expenditure detail grain (fund × function × object × cost
 * centre × project), so each is a single grouped aggregate. Cost centre is OPTIONAL on the
 * import, which is why that view carries an explicit unassigned row rather than quietly
 * summing to less than the page's total.
 */
export const EXPENDITURE_VIEWS = [
  { value: "object", label: "Object" },
  { value: "function", label: "Function" },
  { value: "costCenterType", label: "Cost Center Type" },
  { value: "project", label: "Project" },
] as const;
export type ExpenditureView = (typeof EXPENDITURE_VIEWS)[number]["value"];

/**
 * Revenues — "Revenue Type, Revenue Code & Name, Grant".
 *
 * "Grant" is served by the PROJECT dimension, and that is the honest mapping rather than a
 * shortcut. The Grants Activity module is dormant until V2 (see the note on `Grant` in
 * prisma/schema.prisma); grant revenue reaches the platform tagged in the revenue detail's
 * "Project / Grant" column, against the unified Project master. That column IS where a
 * district's grant revenue lives today, so grouping on it answers the question the client
 * asked. It is labelled "Project / Grant" on the card so nobody reads it as a grant registry
 * this product does not yet have.
 */
export const REVENUE_VIEWS = [
  { value: "type", label: "Revenue Type" },
  { value: "source", label: "Revenue Code & Name" },
  { value: "grant", label: "Project / Grant" },
] as const;
export type RevenueView = (typeof REVENUE_VIEWS)[number]["value"];

/**
 * Cash composition — "Fund, Bank Account, Cash Category".
 *
 * Two of the three are real. The cash position import is one row per FUND carrying
 * beginning/receipts/disbursements/ending plus optional investment, restricted and
 * unrestricted balances — so "Cash Category" is that optional split and "Fund" is the grain
 * itself.
 *
 * BANK ACCOUNT HAS NO DATA BEHIND IT. There is no bank account on the cash file, on
 * `CashPosition`, or anywhere else in the schema. It is offered because the client asked
 * for it, and it says plainly that the file carries no account detail — a more useful
 * message than the option simply not being there, because it names exactly what a district
 * would have to start uploading to get it. It is NOT wired to a guess: splitting
 * "Operating / Investment / Restricted" and calling those bank accounts would be inventing
 * three accounts no district reported.
 */
export const CASH_VIEWS = [
  { value: "category", label: "Cash Category" },
  { value: "fund", label: "Fund" },
  { value: "bankAccount", label: "Bank Account" },
] as const;
export type CashView = (typeof CASH_VIEWS)[number]["value"];

/**
 * Fund balance composition — "View By → Fund".
 *
 * The client named one alternative, so the list is two: the classification split the card
 * has always drawn (Nonspendable → Unassigned), and the same total split by fund instead.
 */
export const FUND_BALANCE_VIEWS = [
  { value: "classification", label: "Classification" },
  { value: "fund", label: "Fund" },
] as const;
export type FundBalanceView = (typeof FUND_BALANCE_VIEWS)[number]["value"];
