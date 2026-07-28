"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { ExportMenu, type ScopeOption } from "@/components/dashboard/scope-bar";
import { FilterMenu } from "@/components/dashboard/filter-menu";
import { SavedViews, type SavedViewItem } from "@/components/dashboard/saved-views";
import { useScopeNavigation, Spinner } from "@/components/dashboard/scope-navigation";
import {
  writeFilterParams,
  clearFilters,
  isEmptySelection,
  FILTER_PARAMS,
  type FilterSelection,
} from "@/lib/dashboard/filter-params";
import type { FilterOptions, FilterChip } from "@/lib/dashboard/filter-options";

/**
 * The global filter bar — one row above everything it scopes.
 *
 * ---------------------------------------------------------------------------
 * ONE SET OF FILTERS, EVERY CARD
 *
 * There is no per-card filter anywhere in this product and there should not be. Every
 * figure on the page comes from `loadCore` and the engines beneath it, all handed the same
 * `scope.filter`, so a KPI tile, a donut, an alert and a table cannot disagree about which
 * slice they are showing. That property is worth more than the flexibility of per-card
 * controls, and it is only free while the filter lives here.
 *
 * ONE CONTROL, NOT A ROW OF THEM. Every dimension — fund type, fund code, each cost-centre
 * category, and the reporting period — is inside the single Filters button
 * (components/dashboard/filter-menu.tsx), which is also how the Audit log has always
 * presented its filters. The bar itself is now three controls wide whatever the district's
 * master data looks like, and a change to several dimensions is ONE navigation instead of
 * one per dropdown.
 *
 * A CLIENT COMPONENT THAT ONLY WRITES URL PARAMETERS. The figures are computed on the
 * server (see components/dashboard/scope-bar.tsx for the original argument, which this
 * inherits): changing a filter is a navigation, not a refetch, which is what keeps
 * Prisma.Decimal out of the browser. Nothing here has ever seen a number.
 *
 * WHY THE URL SELF-CORRECTS. `pruned` says the server dropped part of the selection — a
 * fund id from another district, or one the cascade excluded. The bar rewrites the URL to
 * what is actually applied, with `replace` so the corrected address does not become a back
 * button destination. Otherwise the link a user copies would promise a filter the page is
 * not showing.
 * ---------------------------------------------------------------------------
 */
export function FilterBar({
  periods,
  period,
  options,
  selection,
  chips,
  active,
  pruned,
  savedViews,
  exportHref,
  summaryHref,
}: {
  periods: ScopeOption[];
  /** "<fy>:<period>" */
  period: string;
  options: FilterOptions;
  selection: FilterSelection;
  chips: FilterChip[];
  active: boolean;
  pruned: boolean;
  savedViews: SavedViewItem[];
  exportHref?: string;
  /** Only the Executive dashboard has a one-page summary view. */
  summaryHref?: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  /**
   * `pending` is true from the click until the re-rendered page lands. Every control below
   * reads it, and the main column dims against it — see components/dashboard/scope-navigation.tsx.
   */
  const { pending, go } = useScopeNavigation();

  const push = (next: URLSearchParams, replace = false) => {
    const qs = next.toString();
    go(qs ? `${pathname}?${qs}` : pathname, { replace });
  };

  /** Writes a whole selection at once — every control commits through here. */
  const commit = (patch: Partial<FilterSelection>, replace = false) => {
    const next = new URLSearchParams(params.toString());
    writeFilterParams(next, { ...selection, ...patch });
    push(next, replace);
  };

  // See "WHY THE URL SELF-CORRECTS" above.
  useEffect(() => {
    if (!pruned) return;
    const next = new URLSearchParams(params.toString());
    writeFilterParams(next, selection);
    push(next, true);
    // Only when the server says the URL disagrees with what it applied.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pruned]);

  const periodQuery = (() => {
    const p = new URLSearchParams();
    const fy = params.get(FILTER_PARAMS.fiscalYear);
    const per = params.get(FILTER_PARAMS.period);
    if (fy) p.set(FILTER_PARAMS.fiscalYear, fy);
    if (per) p.set(FILTER_PARAMS.period, per);
    return p.toString();
  })();

  const currentFilters = (() => {
    const p = new URLSearchParams();
    writeFilterParams(p, selection);
    return p.toString();
  })();

  /** The whole staged scope, in one navigation. */
  const applyScope = (next: { selection: FilterSelection; period: string }) => {
    const params_ = new URLSearchParams(params.toString());
    writeFilterParams(params_, next.selection);
    if (next.period !== period) {
      const [fy, p] = next.period.split(":");
      params_.set(FILTER_PARAMS.fiscalYear, fy);
      params_.set(FILTER_PARAMS.period, p);
    }
    push(params_);
  };

  /** Subtracts one chip's ids from its parameter, leaving the rest of that parameter alone. */
  const removeChip = (chip: FilterChip) => {
    const drop = (ids: string[]) => ids.filter((id) => !chip.ids.includes(id));
    const patch: Partial<FilterSelection> =
      chip.param === FILTER_PARAMS.fundType
        ? { fundTypeIds: drop(selection.fundTypeIds) }
        : chip.param === FILTER_PARAMS.fund
          ? { fundIds: drop(selection.fundIds) }
          : chip.param === FILTER_PARAMS.costCenterType
            ? { costCenterTypeIds: drop(selection.costCenterTypeIds) }
            : { costCenterIds: drop(selection.costCenterIds) };
    commit(patch);
  };

  const reset = () => push(clearFilters(params));

  const periodLabel = periods.find((p) => p.value === period)?.label;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <FilterMenu
          periods={periods}
          period={period}
          options={options}
          selection={selection}
          onApply={applyScope}
          pending={pending}
        />

        <div className="ml-auto flex items-center gap-2">
          <SavedViews
            views={savedViews}
            currentFilters={currentFilters}
            periodQuery={periodQuery}
            hasFilters={!isEmptySelection(selection)}
          />

          <ExportMenu detailHref={exportHref} summaryHref={summaryHref} />
        </div>
      </div>

      {/*
        The applied slice, named. It prints — unlike the control above it, which does not,
        because a printed dropdown is furniture. A board packet page showing $4.2M has to
        carry the sentence that says which $4.2M.

        The PERIOD leads the line. It used to be a dropdown of its own and was therefore
        always on screen; now that it lives inside the Filters panel it has to be stated
        here, or a reader would have to open a menu to learn which month they are looking
        at — and the printed page would not say at all.
      */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-2">
          Showing
        </span>

        {periodLabel && (
          <span className="inline-flex items-center rounded-full border border-line bg-panel px-2.5 py-1 text-[11.5px] text-ink-muted">
            {periodLabel}
          </span>
        )}

        {active && chips.length > 0 ? (
          chips.map((chip) => (
            <span
              key={`${chip.param}:${chip.dimension}`}
              className="inline-flex max-w-[380px] items-center gap-1.5 rounded-full border border-brand/25 bg-brand/[0.07] py-1 pl-2.5 pr-1 text-[11.5px] text-brand"
            >
              <span className="truncate">
                <span className="font-semibold">{chip.dimension}:</span>{" "}
                {chip.values.slice(0, 3).join(", ")}
                {chip.values.length > 3 && ` +${chip.values.length - 3}`}
              </span>
              {/* Disabled mid-navigation: the chips still name the OUTGOING filter until
                  the server answers, so a second × would subtract from a selection that is
                  already being replaced. */}
              <button
                type="button"
                onClick={() => removeChip(chip)}
                disabled={pending}
                aria-label={`Remove the ${chip.dimension} filter`}
                className="flex-none rounded-full px-1 text-[13px] leading-none text-brand/70 transition-colors hover:text-brand disabled:cursor-not-allowed disabled:opacity-40 print:hidden"
              >
                ×
              </button>
            </span>
          ))
        ) : (
          <span className="inline-flex items-center rounded-full border border-line bg-panel px-2.5 py-1 text-[11.5px] text-muted-2">
            All funds
          </span>
        )}

        {active && (
          <button
            type="button"
            onClick={reset}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11.5px] font-medium text-brand transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60 print:hidden"
          >
            {pending && <Spinner size={11} />}
            {pending ? "Clearing…" : "Clear filters"}
          </button>
        )}

        {/*
          The wait, in words, for a reader who cannot see the fade.
          `role="status"` announces politely — it never interrupts what a screen reader is
          already saying, which matters because this fires on every filter change.
        */}
        <span role="status" aria-live="polite" className="sr-only">
          {pending ? "Applying filters, loading the dashboard." : ""}
        </span>
      </div>
    </div>
  );
}
