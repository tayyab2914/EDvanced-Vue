import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * WHAT SLICE OF THE LEDGER A FIGURE IS COMPUTED OVER.
 *
 * Every engine in lib/finance used to take `fundId?: string` — one fund, or all of them.
 * That is not how a finance officer reads a ledger. They want three special revenue funds
 * side by side, or every capital project fund together, which is a SET, and a single id
 * cannot say it.
 *
 * ---------------------------------------------------------------------------
 * UNDEFINED AND EMPTY ARE DIFFERENT ANSWERS. THIS IS THE WHOLE FILE.
 *
 *   fundIds: undefined  → no fund narrowing. Every fund.
 *   fundIds: []         → a narrowing that nothing satisfies. NO funds, so no rows.
 *
 * The second case is reachable: pick a Fund Type the district has no funds under, and the
 * honest answer is an empty dashboard, not a district-wide total. Written with a truthiness
 * check — `fundIds?.length ? … : {}` — an empty selection silently widens back to All
 * Funds, and the user is shown every fund in the district under a filter chip that says
 * they picked one type. So every helper here tests `!== undefined`, never `.length`.
 * ---------------------------------------------------------------------------
 *
 * THE OTHER HALF: NOT EVERY TABLE CARRIES A COST CENTRE.
 *
 * `BudgetLine`, `RevenueActual` and `ExpenditureActual` have a `costCenterId`. `CashPosition`
 * and `OpeningFundBalance` do not — cash and opening balances are tracked per fund, full
 * stop, and no filter can make them finer. So there are two where-builders, and picking the
 * wrong one is a type error rather than a wrong number: `detailWhere` returns a shape with
 * `costCenterId` in it, which the fund-grain models will not accept.
 *
 * What a page must do when a cost-centre filter is on and it is showing a cash figure is a
 * presentation question, answered in lib/dashboard/scope.ts and shown by
 * `<FundLevelOnly>` — see `narrowsCostCenter` below.
 */

export interface FinanceFilter {
  /** Selected funds. `undefined` = every fund; `[]` = none. See the header. */
  fundIds?: string[];
  /**
   * Selected cost centres — the district's schools, departments and operations units,
   * stored as `School` rows. `undefined` = every cost centre; `[]` = none.
   */
  costCenterIds?: string[];
}

/** Every fund, every cost centre. The default slice. */
export const ALL: FinanceFilter = {};

/**
 * One fund, nothing else narrowed.
 *
 * For the callers that genuinely are single-fund by nature rather than by selection: the
 * reserve KPI (General Fund only, whatever the page is scoped to), the multi-year forecast,
 * and a fund-balance override, which corrects one fund's figure.
 */
export function oneFund(fundId?: string): FinanceFilter {
  return fundId ? { fundIds: [fundId] } : {};
}

/**
 * The fund half alone.
 *
 * What every cash and fund-balance figure is computed against, because those tables cannot
 * honour a cost-centre narrowing (see the header). Returning the filter with its
 * cost-centre half dropped — rather than having callers hand-build `{ fundIds }` — keeps
 * the two families provably scoped to the same funds.
 */
export function fundOnly(filter: FinanceFilter = ALL): FinanceFilter {
  return filter.fundIds === undefined ? ALL : { fundIds: filter.fundIds };
}

/** True when a cost-centre narrowing is in force, and cash-family figures cannot honour it. */
export function narrowsCostCenter(filter: FinanceFilter = ALL): boolean {
  return filter.costCenterIds !== undefined;
}

/** True when this filter narrows anything at all. */
export function narrows(filter: FinanceFilter = ALL): boolean {
  return filter.fundIds !== undefined || filter.costCenterIds !== undefined;
}

/**
 * The single fund, when exactly one is selected.
 *
 * Three behaviours hang off "exactly one fund", and all three are right for one and wrong
 * for two: a fund-balance override corrects one fund's figure (there is no figure to
 * correct across a set), the alert attribution's "where to look" line is redundant when the
 * selector already answers it, and a mover card's fund column would repeat one value.
 *
 * Undefined for zero funds AND for several, which is the point — two funds is not "one
 * fund" and must not fall through to the single-fund path.
 */
export function soleFundId(filter: FinanceFilter = ALL): string | undefined {
  return filter.fundIds?.length === 1 ? filter.fundIds[0] : undefined;
}

/**
 * The cache-key fragment for a filter.
 *
 * Sorted, so two selections of the same funds in a different click order share a memo
 * entry. Sorting a copy, not the array — the caller's is rendered in the UI in its own
 * order, and mutating it here would reorder the filter chips as a side effect of computing
 * a number.
 *
 * The `*` sentinel distinguishes "no narrowing" from "narrowed to nothing", which is the
 * distinction the whole module exists to keep: without it both would key on the empty
 * string and an empty dashboard would be served a district-wide total from the memo store.
 */
export function filterKey(filter: FinanceFilter = ALL): string {
  const part = (ids: string[] | undefined) => (ids === undefined ? "*" : [...ids].sort().join(","));
  return `${part(filter.fundIds)}/${part(filter.costCenterIds)}`;
}

/**
 * The where fragment for the three tables that carry a cost centre — `BudgetLine`,
 * `RevenueActual`, `ExpenditureActual`.
 *
 * `{ in: [] }` is emitted deliberately for an empty selection. Postgres answers `IN ()` as
 * false for every row, which is the correct empty result.
 */
export function detailWhere(filter: FinanceFilter = ALL): {
  fundId?: Prisma.StringFilter;
  costCenterId?: Prisma.StringNullableFilter;
} {
  return {
    ...(filter.fundIds === undefined ? {} : { fundId: { in: filter.fundIds } }),
    ...(filter.costCenterIds === undefined ? {} : { costCenterId: { in: filter.costCenterIds } }),
  };
}

/**
 * The where fragment for the fund-grain tables — `CashPosition`, `OpeningFundBalance`,
 * `FundBalanceOverride`.
 *
 * Ignores the cost-centre half rather than failing on it: those tables have no such column,
 * and the page says so beside the figure instead of hiding it.
 */
export function fundWhere(filter: FinanceFilter = ALL): { fundId?: Prisma.StringFilter } {
  return filter.fundIds === undefined ? {} : { fundId: { in: filter.fundIds } };
}
