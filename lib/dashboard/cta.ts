/**
 * The wording of every navigational call to action, in one place.
 *
 * The client's note: some cards said "Go to [Module]" and others "View [Module] Details",
 * and one page (Cash) carried FOUR different phrasings — "View full cash analysis", "View
 * all funds", "View cash flow details", "View account details" — for links that all landed
 * on the same screen. A reader learns a footer link by its shape, and four shapes for one
 * destination teaches them nothing.
 *
 * TWO FAMILIES, and the DESTINATION decides which:
 *
 *   GO_TO         — another dashboard or module page. "Go to [Module] Dashboard" where the
 *                   destination is a dashboard in its own right; plain "Go to [Module]" for
 *                   the module pages that are not dashboards (Financial Policies, Chart of
 *                   Accounts) and for the Fund Balance tabs, which are views inside one
 *                   dashboard rather than dashboards of their own.
 *   VIEW_DETAILS  — a drill-down to the underlying records. "View [Module] Details".
 *
 * Names match the sidebar and the tab strip exactly, so a link and the thing it opens are
 * never called two different things.
 *
 * Not covered here, deliberately: "Upload …" and "← Back to …", which name an ACTION and a
 * RETURN rather than a destination, and are already consistent among themselves.
 */

/** Navigating to another dashboard or module page. */
export const GO_TO = {
  executive: "Go to Executive Dashboard",
  revenues: "Go to Revenues Dashboard",
  expenditures: "Go to Expenditures Dashboard",
  fundBalance: "Go to Fund Balance Dashboard",
  cash: "Go to Cash Position Dashboard",
  alerts: "Go to Alerts Dashboard",
  /** A tab of the Fund Balance dashboard, labelled as the tab strip labels it. */
  forecast: "Go to Forecasting & Planning",
  policies: "Go to Financial Policies",
  masterData: "Go to Chart of Accounts",
} as const;

/**
 * The short form for a KPI tile, whose whole card is the link.
 *
 * The tile is built for a ~170px column (see components/dashboard/kpi-tile.tsx) and its
 * affordance is `whitespace-nowrap`, so the full "Go to Revenues Dashboard" would run out
 * of the card. The tile's own label already names the module, so the destination is the
 * only thing left to say.
 */
export const GO_TO_DASHBOARD_SHORT = "Go to Dashboard";

/**
 * The permission-gated edit affordances — the settings-gear links beside a policy echo.
 *
 * A THIRD family, and deliberately not folded into GO_TO: these appear only for a user who
 * can actually change the thing (see PolicyEchoCard in components/dashboard/shared.tsx), and
 * "Manage" promises an edit where "Go to" promises only a page. Each names WHICH policies it
 * opens — two of the four used to say the scoped form and two the bare one, on pages that
 * sit a tab apart.
 */
export const MANAGE = {
  policies: "Manage policies",
  revenuePolicies: "Manage revenue policies",
  expenditurePolicies: "Manage expenditure policies",
  fundBalancePolicies: "Manage fund balance policies",
} as const;

/** Drilling down into the committed records behind a figure. */
export const VIEW_DETAILS = {
  revenueDetail: "View Revenue Details",
  expenditureDetail: "View Expenditure Details",
  cashPosition: "View Cash Position Details",
  versionHistory: "View Version History",
} as const;
