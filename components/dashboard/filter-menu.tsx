"use client";

import { useState, useRef, useEffect, useLayoutEffect, useMemo, useId } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/components/icons";
import { Spinner } from "@/components/dashboard/scope-navigation";
import { CHIP_TONE, PILL_BUTTON, PillChevron } from "@/components/dashboard/pill";
import type { ScopeOption } from "@/components/dashboard/scope-bar";
import type {
  FilterOptions,
  FilterOption,
  CostCenterGroup,
} from "@/lib/dashboard/filter-options";
import { EMPTY_SELECTION, type FilterSelection } from "@/lib/dashboard/filter-params";

/**
 * Every filter on a dashboard, behind ONE control.
 *
 * ---------------------------------------------------------------------------
 * ONE BUTTON, A LIST OF DIMENSIONS, A PANEL TO THE RIGHT
 *
 * This replaces the row of five side-by-side dropdowns. That row grew a control per
 * cost-centre category the district records, so its width was a function of the district's
 * master data — a district with four categories pushed the page title off its own header.
 * A single "Filters" button with a count does not, and it is the shape the Audit log
 * already uses, so the two screens now open filters the same way.
 *
 * The left column names the dimensions and what each currently narrows to. Clicking one
 * expands its options to the RIGHT, in place, so the reader never loses sight of the other
 * dimensions or of what is already applied.
 *
 * ---------------------------------------------------------------------------
 * IT STAGES EVERYTHING, AND COMMITS ONCE
 *
 * Every figure on these dashboards is computed on the server, so applying a filter is a
 * NAVIGATION, not a re-render. The old bar committed per dropdown: picking a fund type, two
 * funds and a school was three round trips to a database on another continent. Here the
 * whole panel is one draft — every dimension AND the reporting period — and closing it is a
 * single navigation.
 *
 * That is also why the cascade is duplicated here: with fund types ticked locally, the fund
 * list has to narrow immediately or the staging is a lie. The SERVER still cascades and
 * still prunes (lib/dashboard/filter-options.ts). This copy decides what is on screen; that
 * copy decides what is true. If they disagree the server wins and the bar re-renders from
 * the pruned selection, which is the right way round.
 *
 * ESC BACKS OUT ONE LEVEL: out of an open dimension first, then out of the panel —
 * discarding the draft, because a user who opened the wrong thing and ticked three items
 * needs a way out that is not "untick them again from memory". Clicking away commits, which
 * is what the old dropdowns did and what a reader who has finished ticking expects.
 * ---------------------------------------------------------------------------
 */

/** The panel is `position: fixed` so it escapes the header's stacking and clipping. */
const LIST_W = 272;
const DETAIL_W = 300;
const GAP = 6;
/** Breathing room kept between the panel and every edge of the window. */
const MARGIN = 8;

/**
 * Where a dimension's options open, decided from the room actually available.
 *
 * The bar lives in a right-aligned page header, so on most windows there is no room to the
 * right of the panel at all — reserving it up front (the first version of this control did)
 * only dragged the panel away from its own button and still ran off the edge. So the panel
 * anchors to the button and the flyout takes whichever side fits, falling back to replacing
 * the list entirely when neither does.
 */
type Side = "right" | "left" | "stack";

interface Placement {
  top: number;
  left: number;
  listW: number;
  detailW: number;
  side: Side;
  /** Both cards scroll internally rather than growing past the bottom of the window. */
  maxH: number;
}

interface Section {
  key: string;
  kind: "period" | "fundType" | "fund" | "costCenter";
  label: string;
  icon: IconName;
  /** Set on the cost-centre sections — the category this one filters. */
  group?: CostCenterGroup;
}

/** One dimension's state, read out of a draft selection. */
interface SectionView {
  /** Every member, before the local cascade — what a summary label resolves against. */
  all: FilterOption[];
  /** What the list offers, after the type cascade. */
  members: FilterOption[];
  selected: string[];
  types: FilterOption[];
  selectedTypes: string[];
  typeLabel?: string;
}

/** Matches on code and on name, so "1000" and "general" both find the General Fund. */
function matches(option: FilterOption, term: string): boolean {
  if (!term) return true;
  const t = term.toLowerCase();
  return (
    option.name.toLowerCase().includes(t) || (option.code ?? "").toLowerCase().includes(t)
  );
}

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

export function FilterMenu({
  periods,
  period,
  options,
  selection,
  onApply,
  pending = false,
}: {
  periods: ScopeOption[];
  /** "<fy>:<period>" */
  period: string;
  options: FilterOptions;
  /** What is applied — the pruned selection, never the raw URL. */
  selection: FilterSelection;
  /** Called once, with the whole staged scope. One navigation, not one per dimension. */
  onApply: (next: { selection: FilterSelection; period: string }) => void;
  /**
   * True while a scope change this button started is still being rendered on the server.
   *
   * The panel closes on Apply, so its own Apply button is gone by the time the wait begins —
   * this trigger is the only part of the control still on screen to carry it.
   */
  pending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [draft, setDraft] = useState<FilterSelection>(selection);
  const [draftPeriod, setDraftPeriod] = useState(period);
  const [pos, setPos] = useState<Placement | null>(null);

  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const panelId = useId();

  /**
   * The panel is PORTALLED to `<body>`, and that is not cosmetic.
   *
   * `position: fixed` is only relative to the window while no ancestor establishes a
   * containing block — and `transform`, `filter`, `backdrop-filter` and `contain` all do.
   * The dashboards animate in under `.animate-fade-up`, which is a transform animation, so
   * a panel left in the header resolves its coordinates against that box instead of the
   * viewport and lands off to one side, clipped. Out at the body there is nothing above it
   * to get this wrong.
   *
   * No mounted flag is needed to keep this off the server: the panel only exists once
   * `open` is true, and nothing but a click in the browser sets that.
   */

  const sections = useMemo<Section[]>(
    () => [
      { key: "period", kind: "period", label: "Reporting period", icon: "calendar" },
      { key: "fundType", kind: "fundType", label: "Fund Type", icon: "layers" },
      { key: "fund", kind: "fund", label: "Fund Code", icon: "building" },
      ...options.costCenters.map(
        (group): Section => ({
          key: `cc:${group.category}`,
          kind: "costCenter",
          label: group.label,
          icon: "bank",
          group,
        }),
      ),
    ],
    [options],
  );

  // ===================== reading a dimension out of the draft =====================

  const viewOf = (s: Section, d: FilterSelection): SectionView => {
    switch (s.kind) {
      case "fundType":
        return {
          all: options.fundTypes,
          members: options.fundTypes,
          selected: d.fundTypeIds,
          types: [],
          selectedTypes: [],
        };
      case "fund":
        return {
          all: options.funds,
          // The local cascade — fund types tick, fund codes narrow, no round trip.
          members: d.fundTypeIds.length
            ? options.funds.filter((f) => f.parentId && d.fundTypeIds.includes(f.parentId))
            : options.funds,
          selected: d.fundIds,
          types: [],
          selectedTypes: [],
        };
      case "costCenter": {
        const g = s.group!;
        const selectedTypes = d.costCenterTypeIds.filter((id) =>
          g.types.some((t) => t.id === id),
        );
        return {
          all: g.members,
          members: selectedTypes.length
            ? g.members.filter((m) => m.parentId && selectedTypes.includes(m.parentId))
            : g.members,
          // Each control owns only its own category's ids — that is what lets a School
          // filter and a Department filter coexist in one `cc` parameter.
          selected: d.costCenterIds.filter((id) => g.members.some((m) => m.id === id)),
          types: g.types,
          selectedTypes,
          typeLabel: `${g.label} Type`,
        };
      }
      default:
        return { all: [], members: [], selected: [], types: [], selectedTypes: [] };
    }
  };

  // ===================== writing a dimension back into the draft =====================

  /**
   * Both writers take an UPDATER over the dimension's current ids, not the ids themselves,
   * and re-read the dimension out of the draft they are handed. Computing the next set from
   * the render's `draft` instead would drop a tick whenever two checkboxes are clicked
   * inside one render — the second click would be computed from a selection that no longer
   * exists.
   */
  const setMembers = (s: Section, next: (current: string[]) => string[]) =>
    setDraft((d) => {
      const ids = next(viewOf(s, d).selected);
      switch (s.kind) {
        case "fundType":
          // Ticking a Fund Type re-offers the Fund Code list, so any fund the new type set
          // excludes has to go with it — the server would prune it anyway, and carrying it
          // for one navigation makes the bar flicker through a state nobody asked for.
          return {
            ...d,
            fundTypeIds: ids,
            fundIds: ids.length
              ? d.fundIds.filter((id) => {
                  const fund = options.funds.find((f) => f.id === id);
                  return fund?.parentId ? ids.includes(fund.parentId) : false;
                })
              : d.fundIds,
          };
        case "fund":
          return { ...d, fundIds: ids };
        case "costCenter": {
          const g = s.group!;
          const others = d.costCenterIds.filter((id) => !g.members.some((m) => m.id === id));
          return { ...d, costCenterIds: [...others, ...ids] };
        }
        default:
          return d;
      }
    });

  const setTypes = (s: Section, next: (current: string[]) => string[]) =>
    setDraft((d) => {
      if (s.kind !== "costCenter") return d;
      const g = s.group!;
      const ids = next(viewOf(s, d).selectedTypes);
      const otherTypes = d.costCenterTypeIds.filter((id) => !g.types.some((t) => t.id === id));
      // Untick a type and the members it revealed go with it. Leaving them selected but
      // hidden is the "applied but invisible" failure the whole cascade exists to avoid.
      const allowed = ids.length
        ? new Set(
            g.members.filter((m) => m.parentId && ids.includes(m.parentId)).map((m) => m.id),
          )
        : null;
      const others = d.costCenterIds.filter((id) => !g.members.some((m) => m.id === id));
      const mine = d.costCenterIds.filter((id) => g.members.some((m) => m.id === id));
      return {
        ...d,
        costCenterTypeIds: [...otherTypes, ...ids],
        costCenterIds: [...others, ...(allowed ? mine.filter((id) => allowed.has(id)) : mine)],
      };
    });

  // ===================== what each row says on the right =====================

  const summaryOf = (s: Section, d: FilterSelection): string => {
    if (s.kind === "period") {
      return periods.find((p) => p.value === draftPeriod)?.label ?? "—";
    }
    const v = viewOf(s, d);
    if (v.selected.length === 0 && v.selectedTypes.length === 0) return "All";
    if (v.selected.length === 1 && v.selectedTypes.length === 0) {
      return v.all.find((o) => o.id === v.selected[0])?.label ?? "1 selected";
    }
    if (v.selectedTypes.length && !v.selected.length) {
      const noun = (v.typeLabel ?? "type").toLowerCase();
      return `${v.selectedTypes.length} ${noun}${v.selectedTypes.length > 1 ? "s" : ""}`;
    }
    return `${v.selected.length} selected`;
  };

  const isNarrowed = (s: Section, d: FilterSelection): boolean => {
    if (s.kind === "period") return false;
    const v = viewOf(s, d);
    return v.selected.length > 0 || v.selectedTypes.length > 0;
  };

  /**
   * The badge counts DIMENSIONS, not ticks.
   *
   * "2" reads as "two things are narrowing this page", which is the question the badge
   * answers; the chips under the bar say which values. Counting ticks would put "17" on a
   * button whose panel lists four rows.
   */
  const applied = open ? draft : selection;
  const activeCount = sections.filter((s) => isNarrowed(s, applied)).length;

  // ===================== open, close, commit =====================

  /**
   * The draft is seeded when the panel OPENS, and is meaningless while it is closed.
   *
   * That is what keeps the applied selection the single source of truth. Mirroring the
   * props into state and re-syncing them in an effect is the obvious alternative and it is
   * wrong twice over: it re-renders on every navigation for nothing, and it races — a saved
   * view or a back-button navigation lands new props while a stale draft is still mounted,
   * and which one wins depends on effect ordering.
   */
  const openPanel = () => {
    setDraft(selection);
    setDraftPeriod(period);
    setSection(null);
    setTerm("");
    setOpen(true);
  };

  const dirty =
    !sameSet(draft.fundTypeIds, selection.fundTypeIds) ||
    !sameSet(draft.fundIds, selection.fundIds) ||
    !sameSet(draft.costCenterTypeIds, selection.costCenterTypeIds) ||
    !sameSet(draft.costCenterIds, selection.costCenterIds) ||
    draftPeriod !== period;

  const close = (commit: boolean) => {
    setOpen(false);
    setSection(null);
    setTerm("");
    if (commit && dirty) onApply({ selection: draft, period: draftPeriod });
  };

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const b = btnRef.current?.getBoundingClientRect();
      if (!b) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const avail = vw - MARGIN * 2;

      // Both cards shrink on a narrow window rather than overflowing it.
      const listW = Math.min(LIST_W, avail);
      const detailW = Math.min(DETAIL_W, avail);

      // RIGHT-ALIGNED to its trigger, which is where the eye already is. The panel then
      // stays put whatever the flyout does — nothing jumps when a dimension is opened.
      const left = Math.min(Math.max(MARGIN, b.right - listW), Math.max(MARGIN, vw - listW - MARGIN));

      const roomRight = vw - MARGIN - (left + listW + GAP);
      const roomLeft = left - GAP - MARGIN;
      const side: Side =
        roomRight >= detailW ? "right" : roomLeft >= detailW ? "left" : "stack";

      // Vertically: below the button, capped to the window. Only when that leaves less
      // than a usable card does it lift clear of the bottom edge.
      let top = b.bottom + 6;
      let maxH = vh - top - MARGIN;
      if (maxH < 260) {
        maxH = Math.min(vh - MARGIN * 2, 440);
        top = Math.max(MARGIN, vh - MARGIN - maxH);
      }

      setPos((prev) =>
        prev &&
        prev.top === top &&
        prev.left === left &&
        prev.listW === listW &&
        prev.detailW === detailW &&
        prev.side === side &&
        prev.maxH === maxH
          ? prev
          : { top, left, listW, detailW, side, maxH },
      );
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  /**
   * The correction pass — what the panel MEASURES, not what it was told.
   *
   * The placement above works from the two width constants, which is right until something
   * makes the rendered box a different size than they claim: browser zoom, a user font
   * size, a long district name widening a row. So once it is on screen the real rectangles
   * are read back, and anything hanging over an edge is pulled in — the flyout flipping
   * sides, the panel sliding along. It settles in one pass because the corrected position
   * no longer overflows, and `place` above bails when nothing changed.
   */
  useLayoutEffect(() => {
    if (!open || !pos) return;
    const panel = panelRef.current?.getBoundingClientRect();
    if (!panel) return;
    const vw = window.innerWidth;

    let left = pos.left;
    let side = pos.side;

    if (panel.right > vw - MARGIN) left -= panel.right - (vw - MARGIN);
    if (left < MARGIN) left = MARGIN;

    if (side !== "stack") {
      const flyout = flyoutRef.current?.getBoundingClientRect();
      const width = flyout?.width ?? pos.detailW;
      const roomRight = vw - MARGIN - (left + panel.width + GAP);
      const roomLeft = left - GAP - MARGIN;
      if (side === "right" && roomRight < width) side = roomLeft >= width ? "left" : "stack";
      else if (side === "left" && roomLeft < width) side = roomRight >= width ? "right" : "stack";
    }

    if (left !== pos.left || side !== pos.side) setPos({ ...pos, left, side });
  }, [open, pos, section]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      close(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // One level at a time — see the header.
      if (section) {
        setSection(null);
        setTerm("");
      } else {
        close(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  });

  useEffect(() => {
    if (section && section !== "period") searchRef.current?.focus();
  }, [section]);

  const active = sections.find((s) => s.key === section) ?? null;
  /** No room either side — the options replace the list instead of hanging off it. */
  const stacked = pos?.side === "stack";

  /** Declared once, placed either in the flyout or inside the panel. */
  const detail = active && (
    <div className="flex min-h-0 flex-1 flex-col">
      {active.kind === "period" ? (
        <PeriodList
          periods={periods}
          value={draftPeriod}
          // Stacked mode already names the dimension, on the row that walks back up.
          showHeading={!stacked}
          onPick={(v) => {
            setDraftPeriod(v);
            setSection(null);
          }}
        />
      ) : (
        <OptionList
          section={active}
          view={viewOf(active, draft)}
          showHeading={!stacked}
          term={term}
          setTerm={setTerm}
          searchRef={searchRef}
          onToggle={(id) =>
            setMembers(active, (cur) =>
              cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
            )
          }
          onToggleType={(id) =>
            setTypes(active, (cur) =>
              cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
            )
          }
          onSelectAll={(ids) => setMembers(active, (cur) => [...new Set([...cur, ...ids])])}
          onClear={() => {
            setTypes(active, () => []);
            setMembers(active, () => []);
          }}
        />
      )}
    </div>
  );

  return (
    <div className="print:hidden">
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? close(true) : openPanel())}
        // Re-opening the panel mid-navigation would seed the draft from a selection the
        // server is in the middle of replacing — the reader would stage their next change
        // on top of a state that is about to change under them.
        disabled={pending}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className={PILL_BUTTON}
      >
        {pending && <Spinner size={13} />}
        {pending ? "Applying…" : "Filters"}
        {/* The count, in the chips' own teal rather than the brand blue — it says how many
            of the chips below belong to this button, so it wears their colour. SOLID, not
            the chips' 16% wash: this is the one mark on a white pill that has to be seen
            from across the header, and a tint at 11px is not. */}
        {activeCount > 0 && !pending && (
          <span
            className="inline-flex h-[19px] min-w-[19px] items-center justify-center rounded-full px-[5px] text-[11px] font-bold leading-none text-white"
            style={{ background: CHIP_TONE.teal.fg }}
          >
            {activeCount}
          </span>
        )}
        {!pending && <PillChevron open={open} />}
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label="Filters"
            style={{
              position: "fixed",
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              width: pos?.listW ?? LIST_W,
              maxHeight: pos?.maxH,
              visibility: pos ? "visible" : "hidden",
            }}
            // NOT `overflow-hidden`, however much the 16px radius wants it — the options
            // flyout is an absolutely positioned child that hangs off this box's side, and
            // clipping to the panel would clip the flyout out of existence.
            className="z-50 flex flex-col rounded-[16px] border border-line bg-white text-left shadow-[0_12px_30px_rgba(0,6,6,0.14)] print:hidden"
          >
          {stacked && active ? (
            /* Drill-down: one card, a step at a time, with a way back up. */
            <button
              type="button"
              onClick={() => {
                setSection(null);
                setTerm("");
              }}
              className="flex flex-none items-center gap-1.5 border-b border-line-soft px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-2 transition-colors hover:bg-panel"
            >
              <span aria-hidden className="rotate-180">
                <Icon name="arrow-right" size={12} />
              </span>
              {active.label}
            </button>
          ) : (
            <div className="flex flex-none items-center justify-between border-b border-line-soft px-3 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-2">
                Filters
              </span>
              <button
                type="button"
                onClick={() => setDraft(EMPTY_SELECTION)}
                disabled={activeCount === 0}
                className="text-[12px] font-medium text-brand transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:text-muted-2 disabled:opacity-50"
              >
                Clear all
              </button>
            </div>
          )}

          {stacked && active ? (
            detail
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto py-1">
              {sections.map((s) => {
                const isOpen = section === s.key;
                const on = isNarrowed(s, draft);
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => {
                      setSection(isOpen ? null : s.key);
                      setTerm("");
                    }}
                    aria-expanded={isOpen}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-panel",
                      isOpen && "bg-panel",
                    )}
                  >
                    <span className={cn("flex-none", on ? "text-brand" : "text-muted-2")}>
                      <Icon name={s.icon} size={14} />
                    </span>
                    <span className="flex-none text-[12.5px] text-ink-soft">{s.label}</span>
                    <span
                      className={cn(
                        "ml-auto min-w-0 truncate text-right text-[12px]",
                        on ? "font-semibold text-brand" : "text-muted-2",
                      )}
                    >
                      {summaryOf(s, draft)}
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        "flex-none",
                        isOpen ? "text-brand" : "text-muted-2",
                        // The chevron points at the side the options actually open on.
                        pos?.side === "left" && "rotate-180",
                      )}
                    >
                      <Icon name="arrow-right" size={13} />
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* `rounded-b-lg` rather than `overflow-hidden` on the panel — the flyout hangs
              outside it and clipping the box would clip the flyout with it. */}
          <div className="flex flex-none items-center justify-end gap-1.5 rounded-b-lg border-t border-line-soft bg-panel px-2 py-1.5">
            <button
              type="button"
              onClick={() => close(false)}
              className="rounded-md border border-line bg-white px-2.5 py-1 text-[11.5px] font-medium text-ink-soft transition-colors hover:border-[#c8d3e4]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => close(true)}
              disabled={!dirty}
              className="rounded-md bg-brand px-2.5 py-1 text-[11.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Apply
            </button>
          </div>

            {/* The flyout — whichever side the window has room for. */}
            {active && !stacked && (
              <div
                ref={flyoutRef}
                role="group"
                aria-label={active.label}
                style={{
                  width: pos?.detailW ?? DETAIL_W,
                  maxHeight: pos?.maxH,
                  ...(pos?.side === "left" ? { marginRight: GAP } : { marginLeft: GAP }),
                }}
                className={cn(
                  "absolute top-0 flex flex-col overflow-hidden rounded-[16px] border border-line bg-white shadow-[0_12px_30px_rgba(0,6,6,0.14)]",
                  pos?.side === "left" ? "right-full" : "left-full",
                )}
              >
                {detail}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

// ===================== the flyouts =====================

function PeriodList({
  periods,
  value,
  showHeading,
  onPick,
}: {
  periods: ScopeOption[];
  value: string;
  showHeading: boolean;
  onPick: (v: string) => void;
}) {
  return (
    <>
      {showHeading && (
        <p className="flex-none border-b border-line-soft px-3 py-2 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-muted-2">
          Reporting period
        </p>
      )}
      <ul
        role="listbox"
        aria-label="Reporting period"
        className="max-h-[380px] min-h-0 flex-1 overflow-y-auto py-1"
      >
        {periods.map((p) => (
          <li key={p.value}>
            <button
              type="button"
              role="option"
              aria-selected={p.value === value}
              onClick={() => onPick(p.value)}
              className={cn(
                "block w-full px-3 py-1.5 text-left text-[12.5px] transition-colors hover:bg-panel",
                p.value === value ? "font-semibold text-brand" : "text-ink-muted",
              )}
            >
              {p.label}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function OptionList({
  section,
  view,
  term,
  setTerm,
  searchRef,
  showHeading,
  onToggle,
  onToggleType,
  onSelectAll,
  onClear,
}: {
  section: Section;
  view: SectionView;
  term: string;
  setTerm: (v: string) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  showHeading: boolean;
  onToggle: (id: string) => void;
  onToggleType: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
  onClear: () => void;
}) {
  const visible = view.members.filter((o) => matches(o, term));

  return (
    <>
      {showHeading && (
        <p className="flex-none border-b border-line-soft px-3 py-2 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-muted-2">
          {section.label}
        </p>
      )}

      <div className="flex-none border-b border-line-soft p-2">
        <div className="relative">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-2">
            <Icon name="search" size={13} />
          </span>
          <input
            ref={searchRef}
            type="text"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={`Search ${section.label.toLowerCase()}…`}
            className="h-8 w-full rounded-md border border-line bg-panel pl-7 pr-2 text-[12.5px] text-ink-soft outline-none placeholder:text-muted-2 focus:border-brand/50"
          />
        </div>
      </div>

      {view.types.length > 0 && (
        <div className="flex-none border-b border-line-soft px-2 py-1.5">
          <p className="px-1 pb-1 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-muted-2">
            {view.typeLabel ?? "Type"}
          </p>
          <div className="max-h-[110px] overflow-y-auto">
            {view.types.map((t) => (
              <Check
                key={t.id}
                label={t.label}
                checked={view.selectedTypes.includes(t.id)}
                muted={!t.hasData}
                onChange={() => onToggleType(t.id)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="max-h-[220px] min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
        {visible.length === 0 ? (
          <p className="px-1 py-3 text-center text-[12px] text-muted-2">
            {term ? "Nothing matches that." : "Nothing to choose from."}
          </p>
        ) : (
          visible.map((o) => (
            <Check
              key={o.id}
              label={o.label}
              checked={view.selected.includes(o.id)}
              muted={!o.hasData}
              // The "mark the empty ones" rule. Still selectable: the honest result of
              // picking it is an empty card, which is a better answer than an option that
              // vanished.
              hint={!o.hasData ? "No data this period" : undefined}
              onChange={() => onToggle(o.id)}
            />
          ))
        )}
      </div>

      <div className="flex flex-none items-center justify-between gap-2 border-t border-line-soft bg-panel px-2 py-1.5">
        <div className="flex gap-1">
          {/*
            Select all takes what is VISIBLE, not everything. With a search term typed it
            means the eleven rows the user is looking at; selecting the hidden ninety as well
            is the behaviour that makes people stop trusting the button.
          */}
          <Mini onClick={() => onSelectAll(visible.map((o) => o.id))} disabled={visible.length === 0}>
            Select all
          </Mini>
          <Mini
            onClick={onClear}
            disabled={view.selected.length === 0 && view.selectedTypes.length === 0}
          >
            Clear
          </Mini>
        </div>
        <span className="pr-1 text-[11px] text-muted-2">
          {view.selected.length + view.selectedTypes.length || "No"} selected
        </span>
      </div>
    </>
  );
}

function Check({
  label,
  checked,
  onChange,
  muted,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  muted?: boolean;
  hint?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 transition-colors hover:bg-panel",
        muted && !checked && "opacity-55",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-[3px] h-3.5 w-3.5 flex-none accent-[color:var(--brand,#4c7cf6)]"
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-[12.5px]",
            checked ? "font-semibold text-brand" : "text-ink-muted",
          )}
        >
          {label}
        </span>
        {hint && <span className="block text-[10.5px] text-muted-2">{hint}</span>}
      </span>
    </label>
  );
}

function Mini({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-line bg-white px-2 py-1 text-[11.5px] font-medium text-ink-soft transition-colors hover:border-[#c8d3e4] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
