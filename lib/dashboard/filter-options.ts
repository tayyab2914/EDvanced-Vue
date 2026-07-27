import "server-only";
import type { TenantDb } from "@/lib/tenant-db";
import { memo, dbKey } from "@/lib/request-cache";
import { currentVersionIds } from "@/lib/finance/versions";
import { COST_CENTER_CATEGORIES } from "@/lib/master-data/cost-center";
import { masterLists, type MasterLists } from "@/lib/master-data/lists";
import type { FinanceFilter } from "@/lib/finance/filter";
import type { FilterSelection } from "@/lib/dashboard/filter-params";
import { codeName, DEFAULT_LABEL_MODE, type LabelMode } from "@/lib/text";

/**
 * The filter bar's option lists, and the rules that turn a URL selection into the slice the
 * engines compute over.
 *
 * ---------------------------------------------------------------------------
 * THE THREE RULES, ALL IN `resolveFilters` BELOW
 *
 * 1. CASCADE. Picking Fund Types narrows which Fund Codes are offered. A Fund Code that is
 *    no longer offered is DROPPED from the selection, not kept invisibly — a filter that is
 *    applied but not shown is the worst thing a filter bar can do, because the user is
 *    looking at a number they cannot account for.
 *
 * 2. THE FINER SELECTION WINS. Types and members are not two filters ANDed together; they
 *    are one filter at two grains. Pick "Special Revenue" and you get every special revenue
 *    fund. Then tick two of them and you get those two — the type is now describing which
 *    list you were choosing from, not narrowing the answer further.
 *
 * 3. A TYPE WITH NO MEMBERS MEANS NO ROWS. Pick a Fund Type the district runs no funds
 *    under and the answer is an empty dashboard. It would be easy — and wrong — to treat
 *    the empty resolution as "no filter" and show the district total under a chip claiming
 *    one type. See the header of lib/finance/filter.ts for how that distinction is carried.
 * ---------------------------------------------------------------------------
 *
 * ON "MARK THE EMPTY ONES". Every fund in master data is offered, including ones with no
 * rows in the scoped period, with `hasData: false` so the bar can grey them. Hiding them
 * instead would make the option list change under the user as they change period — and an
 * option that silently disappears takes any selection of it with it.
 */

export interface FilterOption {
  id: string;
  /** "1000 — General Fund". Codes are shown with names resolved everywhere (§5.19). */
  label: string;
  /** For sorting and for the search box, which matches code and name separately. */
  code: string | null;
  name: string;
  /**
   * The type this option rolls up to — a fund's Fund Type, a cost centre's Cost Center
   * Type. Null when the district has not classified it, which is why "Unclassified" is
   * reachable in the list rather than being silently unfilterable.
   */
  parentId: string | null;
  /** False when nothing in the scoped period references it. The bar greys these. */
  hasData: boolean;
}

/**
 * One dropdown's worth of cost centres — the client's "Department ▼ All [Select individual
 * or Dept Type]" and its School twin.
 *
 * A group per CATEGORY, and only for categories the district actually uses. The workbook
 * names two; the master data allows four (School, Department, Operations, Other), and a
 * district that records Operations cost centres would otherwise have no way to filter them
 * while their spending still moves every total on the page. Rendering per category means
 * the two-category district sees exactly the two controls the client drew.
 */
export interface CostCenterGroup {
  category: string;
  /** "School", "Department"… the label the master-data screen uses. */
  label: string;
  types: FilterOption[];
  /**
   * EVERY cost centre in this category, not the cascaded subset.
   *
   * The bar re-runs the cascade in the browser as the user ticks types, so the list has to
   * hold the members those ticks could reveal. Sending the pre-cascaded subset would make
   * ticking a second type show nothing until a round trip came back — and the round trip is
   * the thing the local cascade exists to avoid.
   *
   * The SERVER still cascades (`resolveFilters`); that is what decides which selections are
   * real. This copy only decides what is on screen.
   */
  members: FilterOption[];
}

export interface FilterOptions {
  fundTypes: FilterOption[];
  funds: FilterOption[];
  costCenters: CostCenterGroup[];
}

/** One line of "what is currently applied", for the chips under the bar. */
export interface FilterChip {
  /** "Fund Type", "Fund Code", "School"… */
  dimension: string;
  /** The names, in list order. The bar shows the first few and a "+N" for the rest. */
  values: string[];
  /** Which parameter a "remove this chip" clears out of. */
  param: string;
  /**
   * The ids this chip stands for.
   *
   * Carried because one parameter can back several chips: `cc` holds the schools AND the
   * departments, so "remove the School chip" has to subtract those ids rather than clear
   * the parameter and take the departments with it.
   */
  ids: string[];
}

export interface ResolvedFilters {
  /**
   * The selection AFTER pruning — unknown ids dropped, cascaded-away ids dropped.
   *
   * The bar renders from this rather than from the raw URL, so what is ticked is always
   * what is applied. When it differs from the URL the page rewrites the URL to match
   * (see `pruned`), rather than leaving a link that means something else than it shows.
   */
  selection: FilterSelection;
  /** True when pruning changed the selection — the URL is out of date and says more than it does. */
  pruned: boolean;
  /** What the finance engines take. */
  filter: FinanceFilter;
  options: FilterOptions;
  chips: FilterChip[];
  /** True when any narrowing is applied — what Reset lights up against. */
  active: boolean;
}

// ===================== reading the master data =====================

/**
 * The option lists come from the SHARED master-data read.
 *
 * This module used to run its own four queries for them, on top of the two `listFunds` and
 * `generalFund` were already running — one `resolveScope` read the Fund table three times.
 * They all answer from lib/master-data/lists.ts now, which is one read per render for the
 * whole render. The re-export keeps the name this module's callers already use.
 */
export { masterLists as loadFilterMasterData, type MasterLists as FilterMasterData };

/**
 * Which funds and cost centres the scoped period actually has rows for.
 *
 * THREE queries, not five. Grouping the two detail tables by `[fundId, costCenterId]`
 * answers both questions at once — the fund half and the cost-centre half come out of the
 * same scan — and cash contributes funds only, having no cost centre to contribute.
 *
 * Grouped on `versionId`, never on `(fiscalYear, period)`. Filtering by period sweeps in
 * superseded versions, so a fund whose only rows were in a replaced upload would light up
 * as "has data" against a period where it has none. Same rule as lib/finance/series.ts.
 */
export const dataPresence = memo(
  "dataPresence",
  (db: TenantDb, fiscalYear: string, period: number) => {
    const k = dbKey(db);
    return k === null ? null : `${k}|${fiscalYear}|${period}`;
  },
  async (
    db: TenantDb,
    fiscalYear: string,
    period: number,
  ): Promise<{ funds: Set<string>; costCenters: Set<string> }> => {
    const versions = await currentVersionIds(db, { fiscalYear, period });
    const rev = versions.get("REVENUE_DETAIL");
    const exp = versions.get("EXPENDITURE_DETAIL");
    const cash = versions.get("CASH_POSITION");

    const [revRows, expRows, cashRows] = await Promise.all([
      rev
        ? db.revenueActual.groupBy({ by: ["fundId", "costCenterId"], where: { versionId: rev } })
        : Promise.resolve([]),
      exp
        ? db.expenditureActual.groupBy({
            by: ["fundId", "costCenterId"],
            where: { versionId: exp },
          })
        : Promise.resolve([]),
      cash
        ? db.cashPosition.groupBy({ by: ["fundId"], where: { versionId: cash } })
        : Promise.resolve([]),
    ]);

    const funds = new Set<string>();
    const costCenters = new Set<string>();
    for (const r of [...revRows, ...expRows]) {
      funds.add(r.fundId);
      if (r.costCenterId) costCenters.add(r.costCenterId);
    }
    for (const r of cashRows) funds.add(r.fundId);

    return { funds, costCenters };
  },
);

// ===================== resolving a selection =====================

const CATEGORY_LABEL = new Map(COST_CENTER_CATEGORIES.map((c) => [c.value, c.label]));

/**
 * "1000 — General Fund" / "0021 — Lincoln Elementary".
 *
 * The names are already title-cased by the shared master-data read, so this is the same
 * `codeName` every other label in the application is built from rather than a second
 * definition of what a labelled code looks like.
 *
 * The reader's Codes / Names setting reaches the filter bar through here. A dropdown that
 * kept showing both while every table on the page showed one would be the loudest place the
 * preference did not apply — and the bar is where a district reads a fund's name most
 * often, not least.
 */
const labelOf = codeName;

/**
 * Applies rules 1–3 from the header to one dimension.
 *
 * Shared by funds and by each cost-centre category because the rules are identical and
 * writing them twice is how the Fund cascade and the School cascade end up disagreeing
 * about what an empty type means.
 */
function cascade(
  members: FilterOption[],
  selectedTypeIds: string[],
  selectedMemberIds: string[],
): {
  /** What the dropdown offers — rule 1. */
  visible: FilterOption[];
  /** The member selection, pruned to what is still offered — rule 1. */
  members: string[];
  /** The ids to filter on, or undefined for "this dimension narrows nothing". */
  resolved: string[] | undefined;
} {
  const types = new Set(selectedTypeIds);
  const visible = types.size ? members.filter((m) => m.parentId && types.has(m.parentId)) : members;

  const offered = new Set(visible.map((m) => m.id));
  const picked = selectedMemberIds.filter((id) => offered.has(id));

  // Rule 2: the finer selection wins. Rule 3: a type with no members resolves to the empty
  // set — `[]`, which matches nothing — and NOT to `undefined`, which would match everything.
  const resolved = picked.length ? picked : types.size ? visible.map((m) => m.id) : undefined;

  return { visible, members: picked, resolved };
}

export function resolveFilters(
  master: MasterLists,
  presence: { funds: Set<string>; costCenters: Set<string> },
  raw: FilterSelection,
  /**
   * How much of each dimension to render. Defaulted rather than required so the verify
   * scripts — which run outside a request and have no cookie to read — keep calling this
   * with three arguments and get the client's recommended default.
   */
  mode: LabelMode = DEFAULT_LABEL_MODE,
): ResolvedFilters {
  // ---- funds ----
  const knownFundTypes = new Set(master.fundTypes.map((t) => t.id));
  const fundTypeIds = raw.fundTypeIds.filter((id) => knownFundTypes.has(id));

  const fundOptions: FilterOption[] = master.funds.map((f) => ({
    id: f.id,
    label: labelOf(f.code, f.name, mode),
    code: f.code,
    name: f.name,
    parentId: f.fundTypeId,
    hasData: presence.funds.has(f.id),
  }));

  const fundCascade = cascade(fundOptions, fundTypeIds, raw.fundIds);

  // A Fund Type is offered only when the district runs funds under it. The global lookup
  // carries every type the platform defines — Enterprise, Internal Service, Fiduciary —
  // and offering a district a type it has never used is offering it an empty dashboard.
  const usedFundTypes = new Set(master.funds.map((f) => f.fundTypeId).filter(Boolean));
  const fundTypeOptions: FilterOption[] = master.fundTypes
    .filter((t) => usedFundTypes.has(t.id))
    .map((t) => ({
      id: t.id,
      label: t.name,
      code: t.code,
      name: t.name,
      parentId: null,
      hasData: master.funds.some((f) => f.fundTypeId === t.id && presence.funds.has(f.id)),
    }));

  // ---- cost centres, one group per category the district uses ----
  const knownCentreTypes = new Set(master.costCenterTypes.map((t) => t.id));
  const costCenterTypeIds = raw.costCenterTypeIds.filter((id) => knownCentreTypes.has(id));

  const categories = [...new Set(master.costCenters.map((c) => c.category ?? "OTHER"))];
  const groups: CostCenterGroup[] = [];
  const keptCentreTypeIds: string[] = [];
  const keptCentreIds: string[] = [];
  /** Undefined until some category narrows; then the union across all of them. */
  let costCenterIds: string[] | undefined;

  for (const category of COST_CENTER_CATEGORIES.map((c) => c.value)) {
    if (!categories.includes(category)) continue;

    const members: FilterOption[] = master.costCenters
      .filter((c) => (c.category ?? "OTHER") === category)
      .map((c) => ({
        id: c.id,
        label: labelOf(c.schoolNumber, c.name, mode),
        code: c.schoolNumber,
        name: c.name,
        parentId: c.typeId,
        hasData: presence.costCenters.has(c.id),
      }));

    const memberTypeIds = new Set(members.map((m) => m.parentId).filter(Boolean));
    const types: FilterOption[] = master.costCenterTypes
      .filter((t) => t.category === category && memberTypeIds.has(t.id))
      .map((t) => ({
        id: t.id,
        label: t.name,
        code: t.code,
        name: t.name,
        parentId: null,
        hasData: members.some((m) => m.parentId === t.id && m.hasData),
      }));

    const offeredTypes = new Set(types.map((t) => t.id));
    const selectedTypes = costCenterTypeIds.filter((id) => offeredTypes.has(id));
    const result = cascade(members, selectedTypes, raw.costCenterIds);

    keptCentreTypeIds.push(...selectedTypes);
    keptCentreIds.push(...result.members);
    if (result.resolved !== undefined) {
      // Union across categories: picking two schools AND a department asks for rows
      // belonging to any of the three, which is what a pivot's row filter means.
      costCenterIds = [...(costCenterIds ?? []), ...result.resolved];
    }

    groups.push({
      category,
      label: CATEGORY_LABEL.get(category) ?? category,
      types,
      // The full list — see the note on `CostCenterGroup.members`.
      members,
    });
  }

  const selection: FilterSelection = {
    fundTypeIds,
    fundIds: fundCascade.members,
    costCenterTypeIds: keptCentreTypeIds,
    costCenterIds: keptCentreIds,
  };

  const sameSet = (a: string[], b: string[]) =>
    a.length === b.length && new Set(a).size === new Set([...a, ...b]).size;
  const pruned =
    !sameSet(selection.fundTypeIds, raw.fundTypeIds) ||
    !sameSet(selection.fundIds, raw.fundIds) ||
    !sameSet(selection.costCenterTypeIds, raw.costCenterTypeIds) ||
    !sameSet(selection.costCenterIds, raw.costCenterIds);

  const filter: FinanceFilter = {
    ...(fundCascade.resolved === undefined ? {} : { fundIds: fundCascade.resolved }),
    ...(costCenterIds === undefined ? {} : { costCenterIds }),
  };

  return {
    selection,
    pruned,
    filter,
    // `fundOptions`, not `fundCascade.visible`: the bar cascades locally as the user ticks
    // Fund Types, so it needs every fund those ticks could reveal.
    options: { fundTypes: fundTypeOptions, funds: fundOptions, costCenters: groups },
    chips: buildChips(selection, { fundTypeOptions, fundOptions, groups }),
    active: filter.fundIds !== undefined || filter.costCenterIds !== undefined,
  };
}

/**
 * What is applied, in words.
 *
 * Named values rather than a count. "3 funds" tells a reader that a filter exists; "1000,
 * 2100, 2200" tells them which slice the $4.2M in front of them is — and that is the
 * question a filter chip is answering.
 */
function buildChips(
  selection: FilterSelection,
  lists: {
    fundTypeOptions: FilterOption[];
    fundOptions: FilterOption[];
    groups: CostCenterGroup[];
  },
): FilterChip[] {
  const out: FilterChip[] = [];

  /** Only the ids this list actually knows — which is what splits `cc` per category. */
  const mine = (options: FilterOption[], ids: string[]) => {
    const byId = new Map(options.map((o) => [o.id, o]));
    return ids.filter((id) => byId.has(id)).map((id) => ({ id, label: byId.get(id)!.label }));
  };

  const push = (dimension: string, hits: { id: string; label: string }[], param: string) => {
    if (hits.length) {
      out.push({ dimension, values: hits.map((h) => h.label), ids: hits.map((h) => h.id), param });
    }
  };

  push("Fund Type", mine(lists.fundTypeOptions, selection.fundTypeIds), "ftype");
  push("Fund Code", mine(lists.fundOptions, selection.fundIds), "funds");

  for (const group of lists.groups) {
    push(`${group.label} Type`, mine(group.types, selection.costCenterTypeIds), "cctype");
    push(group.label, mine(group.members, selection.costCenterIds), "cc");
  }

  return out;
}
