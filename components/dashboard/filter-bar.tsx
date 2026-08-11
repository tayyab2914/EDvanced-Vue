"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { ExportMenu, type ScopeOption } from "@/components/dashboard/scope-bar";
import { FilterMenu } from "@/components/dashboard/filter-menu";
import { SavedViews, type SavedViewItem } from "@/components/dashboard/saved-views";
import { useScopeNavigation, Spinner } from "@/components/dashboard/scope-navigation";
import { CHIP_FACE, CHIP_ROTATION, CHIP_TONE } from "@/components/dashboard/pill";
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
  asOf,
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
  /**
   * "Data as of August 31, 2026" — pre-formatted by the server wrapper. See the note beside
   * where it renders for why it lives in this row rather than on a line of its own.
   */
  asOf?: string;
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

  const periodOption = periods.find((p) => p.value === period);

  /**
   * How many chips stand on their own before the row folds.
   *
   * A district that filters by fund type, fund code and three cost-centre categories puts
   * five chips under a two-line header, and the applied slice — the thing this row exists to
   * state — stops being readable at exactly the moment it has the most to say. Three is what
   * fits beside the "Showing" label on one line at 1440px; the rest are one click away and
   * still every one of them prints, because `expanded` only gates the screen (see the print
   * note below).
   */
  const VISIBLE_CHIPS = 3;
  const [expanded, setExpanded] = useState(false);
  const overflow = Math.max(0, chips.length - VISIBLE_CHIPS);
  const shownChips = expanded ? chips : chips.slice(0, VISIBLE_CHIPS);

  /** A small capsule that is a control rather than a statement — "+2 more", "Clear". */
  const chipButton = cn(
    CHIP_FACE,
    "gap-[4px] py-[5px] font-semibold transition-colors print:hidden",
    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#301a93]",
    "disabled:cursor-not-allowed disabled:opacity-50",
  );

  return (
    <div className="space-y-[10px]">
      {/*
        VIEWS · FILTERS · EXPORT, in one group, at the right.

        Filters used to sit alone on the left with the other two pushed away by `ml-auto`,
        which read as two unrelated toolbars — and the gap between them grew with the window,
        so on a wide screen the button that changes the page and the button that saves that
        change were a foot apart. They are one set of header controls and they now travel as
        one, whatever is applied beneath them.
      */}
      <div className="flex flex-wrap items-center justify-end gap-[10px]">
        <SavedViews
          views={savedViews}
          currentFilters={currentFilters}
          periodQuery={periodQuery}
          hasFilters={!isEmptySelection(selection)}
        />

        <FilterMenu
          periods={periods}
          period={period}
          options={options}
          selection={selection}
          onApply={applyScope}
          pending={pending}
        />

        <ExportMenu detailHref={exportHref} summaryHref={summaryHref} />
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
      <div className="flex flex-wrap items-center gap-x-[8px] gap-y-[6px]">
        <span className="text-[11px] font-bold uppercase leading-[16px] tracking-[0.66px] text-[#797979]">
          Showing:
        </span>

        {/* The period, in green on every page — the one tone no filter dimension may wear,
            so that "which month" is always the same colour wherever a reader looks. */}
        {periodOption && (
          <span
            className={cn(CHIP_FACE, "gap-[6px] px-[11px] py-[5px] font-semibold")}
            style={{ background: CHIP_TONE.green.bg, color: CHIP_TONE.green.fg }}
          >
            {periodOption.primary ?? periodOption.label}
            {periodOption.secondary && (
              <span className="font-semibold opacity-75">{periodOption.secondary}</span>
            )}
          </span>
        )}

        {active && chips.length > 0 ? (
          <>
            {shownChips.map((chip) => {
              // The tone follows the chip's POSITION in the row, not a hash of its name, so
              // the dimensions keep the order the resolver put them in and a district always
              // sees Fund Type in the same colour.
              const tone = CHIP_TONE[CHIP_ROTATION[chips.indexOf(chip) % CHIP_ROTATION.length]];
              return (
                <span
                  key={`${chip.param}:${chip.dimension}`}
                  className={cn(
                    CHIP_FACE,
                    "max-w-[320px] gap-[4px] py-[5px] pl-[11px] pr-[4px] font-semibold",
                  )}
                  style={{ background: tone.bg, color: tone.fg }}
                >
                  <span className="truncate">
                    <span className="font-bold">{chip.dimension}:</span>{" "}
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
                    className="flex-none rounded-full px-[5px] text-[14px] leading-none opacity-60 transition-opacity hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30 print:hidden"
                  >
                    ×
                  </button>
                </span>
              );
            })}

            {/* The folded chips still PRINT — `hidden` only takes them off the screen, and a
                board packet that named three of five filters would misstate its own figures. */}
            {!expanded && overflow > 0 && (
              <span className="hidden flex-wrap items-center gap-[8px] print:flex">
                {chips.slice(VISIBLE_CHIPS).map((chip) => {
                  const tone =
                    CHIP_TONE[CHIP_ROTATION[chips.indexOf(chip) % CHIP_ROTATION.length]];
                  return (
                    <span
                      key={`${chip.param}:${chip.dimension}`}
                      className={cn(CHIP_FACE, "gap-[4px] px-[11px] py-[5px] font-semibold")}
                      style={{ background: tone.bg, color: tone.fg }}
                    >
                      <span className="font-bold">{chip.dimension}:</span>{" "}
                      {chip.values.slice(0, 3).join(", ")}
                      {chip.values.length > 3 && ` +${chip.values.length - 3}`}
                    </span>
                  );
                })}
              </span>
            )}

            {overflow > 0 && (
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                aria-expanded={expanded}
                className={cn(chipButton, "px-[10px] hover:brightness-95")}
                style={{ background: CHIP_TONE.slate.bg, color: CHIP_TONE.slate.fg }}
              >
                {expanded ? "Show less" : `+${overflow} more`}
              </button>
            )}
          </>
        ) : (
          <span
            className={cn(CHIP_FACE, "px-[11px] py-[5px] font-bold uppercase")}
            style={{ background: CHIP_TONE.red.bg, color: CHIP_TONE.red.fg }}
          >
            All funds
          </span>
        )}

        {active && (
          <button
            type="button"
            onClick={reset}
            disabled={pending}
            className={cn(chipButton, "px-[8px] text-[#797979] hover:text-[#060606]")}
          >
            {pending && <Spinner size={11} />}
            {pending ? "Clearing…" : "Clear filters"}
          </button>
        )}

        {/*
          THE AS-OF DATE, at the end of the row that already names the slice.

          It used to be a line of its own beneath this one — `DataAsOf`, since deleted — and
          that line carried the applied filters a second time, word for word, because it was
          given `scopeDescription(scope)` and the chips above are built from the same
          `scope.filters.chips`. Reading "Fund Type: General" twice in two lines is how a
          reader learns to stop reading either.

          The DAY is the part that was never duplicated. "August 2026" on the period chip does
          not say whether the month is complete; "August 31, 2026" does, and the date is the
          end of the scoped period rather than the upload time (lib/dashboard/scope.ts), which
          is the whole reason it is worth stating. So the date stays and the repetition goes.
        */}
        {asOf && (
          <span className="flex items-center gap-[5px] text-[11px] leading-[16px] text-[#797979]">
            <span aria-hidden>🗓</span>
            {asOf}
          </span>
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
