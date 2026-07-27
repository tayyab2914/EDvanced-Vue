/**
 * The filter's wire format: which URL parameters carry it, and how to read and write them.
 *
 * ---------------------------------------------------------------------------
 * WHY THE URL AND NOT A STORE
 *
 * The dashboards are Server Components — every figure is computed on the server and nothing
 * but SVG and formatted strings crosses to the browser (see components/dashboard/scope-bar.tsx).
 * A filter held in client state could not reach the code that does the summing without a
 * round trip the app does not otherwise make.
 *
 * In the URL it is also the only copy. It survives a refresh, it is what a user pastes into
 * an email, it is what the export routes read so a download matches the screen, and it is
 * what "applied filters remain in place when the user moves between dashboards" reduces to:
 * carry the query string onto the next link (components/filter-link.tsx) and the next page
 * resolves the same slice. No synchronisation, because there is nothing to synchronise.
 *
 * This module is deliberately PURE and client-safe — no `server-only`, no Prisma. The filter
 * bar is a Client Component and needs to build the same query strings the server parses.
 * ---------------------------------------------------------------------------
 */

/** Multi-valued parameters are comma-joined. Ids are cuids, which contain no comma. */
const SEP = ",";

export const FILTER_PARAMS = {
  fiscalYear: "fy",
  period: "period",
  fundType: "ftype",
  fund: "funds",
  costCenterType: "cctype",
  costCenter: "cc",
  /**
   * The pre-multi-select single-fund parameter.
   *
   * Read, never written. Bookmarked dashboards, saved export links and the drill-down
   * hrefs already rendered into a district's board packet all carry `?fund=<id>`, and
   * silently showing them All Funds instead would be the quiet substitution §8.1 of the
   * spec exists to prevent. It folds into the multi-select as a selection of one.
   */
  legacyFund: "fund",
} as const;

/** Every parameter this module owns — what a reset clears and what a link carries. */
export const ALL_FILTER_PARAMS: string[] = Object.values(FILTER_PARAMS);

/**
 * What the user picked, before any of it is checked against the district's master data.
 *
 * Ids only. A URL can name a fund that was deactivated, or one belonging to another
 * district, and neither is resolved here — lib/dashboard/scope.ts does that against rows it
 * has actually read, which is also where an unknown id is dropped.
 */
export interface FilterSelection {
  fundTypeIds: string[];
  fundIds: string[];
  costCenterTypeIds: string[];
  costCenterIds: string[];
}

export const EMPTY_SELECTION: FilterSelection = {
  fundTypeIds: [],
  fundIds: [],
  costCenterTypeIds: [],
  costCenterIds: [],
};

/** Next hands a repeated parameter back as an array; take the first and move on. */
type ParamValue = string | string[] | undefined;

export interface FilterSearchParams {
  fy?: ParamValue;
  period?: ParamValue;
  ftype?: ParamValue;
  funds?: ParamValue;
  cctype?: ParamValue;
  cc?: ParamValue;
  fund?: ParamValue;
}

function one(v: ParamValue): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s === undefined || s === "" ? undefined : s;
}

/**
 * Splits a comma-joined parameter into ids.
 *
 * Deduped, because `?funds=a,a,b` would otherwise put the same fund into an `IN` twice —
 * harmless to the SQL, but the count in "3 funds" on the filter chip would be wrong, and a
 * chip that miscounts is a chip nobody trusts.
 */
function list(v: ParamValue): string[] {
  const s = one(v);
  if (!s) return [];
  return [...new Set(s.split(SEP).map((x) => x.trim()).filter(Boolean))];
}

export function parseFilterParams(sp: FilterSearchParams): FilterSelection {
  const funds = list(sp[FILTER_PARAMS.fund]);
  const legacy = one(sp[FILTER_PARAMS.legacyFund]);

  return {
    fundTypeIds: list(sp[FILTER_PARAMS.fundType]),
    // The legacy single fund joins the set rather than replacing it, so a link that
    // somehow carries both is a union and never silently drops one.
    fundIds: legacy && !funds.includes(legacy) ? [...funds, legacy] : funds,
    costCenterTypeIds: list(sp[FILTER_PARAMS.costCenterType]),
    costCenterIds: list(sp[FILTER_PARAMS.costCenter]),
  };
}

/**
 * Writes a selection back into a `URLSearchParams`, in place.
 *
 * Empty dimensions are DELETED rather than written as an empty value: `?ftype=` and no
 * `ftype` at all must parse the same, and leaving the key behind would make two URLs for
 * one filter — which the browser history, the export link and the saved view would each
 * store separately.
 *
 * `fund` (legacy) is always cleared. Once the bar has written a selection, the multi-select
 * parameters are the truth, and leaving a stale single-fund parameter beside them would
 * union a fund the user has just unticked back in on the next parse.
 */
export function writeFilterParams(params: URLSearchParams, selection: FilterSelection): void {
  const set = (key: string, ids: string[]) => {
    if (ids.length === 0) params.delete(key);
    else params.set(key, ids.join(SEP));
  };

  set(FILTER_PARAMS.fundType, selection.fundTypeIds);
  set(FILTER_PARAMS.fund, selection.fundIds);
  set(FILTER_PARAMS.costCenterType, selection.costCenterTypeIds);
  set(FILTER_PARAMS.costCenter, selection.costCenterIds);
  params.delete(FILTER_PARAMS.legacyFund);
}

/** The query string for a selection alone — what a saved view stores. */
export function filterQuery(selection: FilterSelection): string {
  const params = new URLSearchParams();
  writeFilterParams(params, selection);
  return params.toString();
}

/** True when nothing is narrowed — what the Reset button greys out against. */
export function isEmptySelection(s: FilterSelection): boolean {
  return (
    s.fundTypeIds.length === 0 &&
    s.fundIds.length === 0 &&
    s.costCenterTypeIds.length === 0 &&
    s.costCenterIds.length === 0
  );
}

/**
 * The routes a filter means anything on.
 *
 * "Applied filters remain in place when the user moves between dashboards" — so the nav
 * carries the query string onto these and only these. Carrying it onto Settings or Master
 * Data would put a meaningless `?funds=…` in the address bar of a page that ignores it,
 * and the user would reasonably wonder what it was doing to what they were reading.
 *
 * Prefix matches, so `/fund-balance/forecast` is covered by `/fund-balance`.
 */
export const FILTERED_ROUTES = [
  "/dashboard",
  "/revenues",
  "/expenditures",
  "/cash",
  "/fund-balance",
  "/alerts",
] as const;

export function isFilteredRoute(href: string): boolean {
  const path = href.split("?")[0];
  return FILTERED_ROUTES.some((r) => path === r || path.startsWith(`${r}/`));
}

/**
 * Adds the current scope to a nav href, if that href is a dashboard.
 *
 * Only the parameters this module owns, and only when the target does not already set them
 * itself — a link that has deliberately chosen a period (an alert deep-link, say) keeps its
 * own, because it is answering a more specific question than "wherever the user was".
 */
export function withScope(href: string, current: URLSearchParams): string {
  if (!isFilteredRoute(href)) return href;

  const [path, own = ""] = href.split("?");
  const next = new URLSearchParams(own);
  let added = false;

  for (const key of ALL_FILTER_PARAMS) {
    const value = current.get(key);
    if (value && !next.has(key)) {
      next.set(key, value);
      added = true;
    }
  }

  if (!added && !own) return href;
  const qs = next.toString();
  return qs ? `${path}?${qs}` : path;
}

/**
 * Strips every filter parameter from a query string, keeping the rest.
 *
 * The rest matters: `fy` and `period` are NOT filters. Resetting filters on May 2026 must
 * leave the user on May 2026 — clearing the whole query string would drop them back to the
 * latest period, which is a different screen than the one they asked to unfilter.
 */
export function clearFilters(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  for (const key of [
    FILTER_PARAMS.fundType,
    FILTER_PARAMS.fund,
    FILTER_PARAMS.costCenterType,
    FILTER_PARAMS.costCenter,
    FILTER_PARAMS.legacyFund,
  ]) {
    next.delete(key);
  }
  return next;
}
