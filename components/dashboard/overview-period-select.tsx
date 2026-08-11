"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import type { ScopeOption } from "@/components/dashboard/scope-bar";
import { useScopeNavigation, Spinner } from "@/components/dashboard/scope-navigation";
import {
  PILL_FACE,
  PILL_INTERACTIVE,
  PILL_MENU,
  PillChevron,
} from "@/components/dashboard/pill";
import { FILTER_PARAMS } from "@/lib/dashboard/filter-params";

/**
 * The period pill beside the Overview title — now the reporting-period selector itself.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS AT ALL, GIVEN THE FILTERS PANEL ALREADY HAS A PERIOD ROW
 *
 * It used to be static, and the comment that stood here argued for that: the period is set in
 * the filter bar, and a control that looked like a menu but only reported would be a lie about
 * what it does. The chevron was the design's, so the pill wore one and hid it from assistive
 * tech.
 *
 * That reasoning cuts the other way once the chevron is honoured. Two controls that write the
 * SAME two URL parameters are not two sources of truth — `fy` and `period` are still resolved
 * once, on the server, by lib/dashboard/scope.ts, and both this and the Filters panel only
 * navigate. What was worth avoiding was a second control with its own state; this has none.
 *
 * A pill with one option stays a pill. A menu whose every opening offers the reader the thing
 * they are already looking at is the lie the original note was about, so a district with a
 * single committed period sees the static capsule and no chevron.
 *
 * A CLIENT COMPONENT THAT ONLY WRITES URL PARAMETERS — the same bargain the filter bar
 * struck (see components/dashboard/filter-bar.tsx). Nothing here has ever seen a figure.
 * ---------------------------------------------------------------------------
 *
 * COLOURS AND TYPE come from components/dashboard/pill.tsx — the same face Views / Filters /
 * Export wear, at the Overview band's slightly smaller size. Sharing the constant is what
 * stops this pill and the header's three drifting apart the way the header's three drifted
 * apart from each other.
 */

/**
 * The header's capsule at the Overview band's own size — one notch shorter and a little
 * tighter than Views / Filters / Export, which is the design's, not an accident.
 */
const PERIOD_PILL = cn(PILL_FACE, "h-[34px] gap-[12px] px-[14px] py-[2px]");

/** The tick on the applied period. Drawn rather than fetched — the icon set has no check. */
function Tick() {
  return (
    <svg
      aria-hidden
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-none"
    >
      <path d="m5 13 4.5 4.5L19 7" />
    </svg>
  );
}

/**
 * The static capsule — what the pill is when there is nothing to choose between.
 *
 * Kept as its own export because the design draws this shape in places that are genuinely
 * only a statement, and because the selector below falls back to it.
 */
export function OverviewPeriodPill({ children }: { children: ReactNode }) {
  return <span className={PERIOD_PILL}>{children}</span>;
}

export function OverviewPeriodSelect({
  label,
  periods,
  value,
}: {
  /** The pill's face — `scope.label`, "July 2026 (FY 2026-27)". */
  label: string;
  periods: ScopeOption[];
  /** "<fy>:<period>", the applied option. */
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const pathname = usePathname();
  const params = useSearchParams();
  /** True from the click until the re-rendered page lands; the main column dims against it. */
  const { pending, go } = useScopeNavigation();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  /** Opening lands on the applied period, so ↑/↓ move from where the reader already is. */
  useEffect(() => {
    if (!open) return;
    const i = Math.max(
      0,
      periods.findIndex((p) => p.value === value),
    );
    itemsRef.current[i]?.focus();
  }, [open, periods, value]);

  if (periods.length <= 1) return <OverviewPeriodPill>{label}</OverviewPeriodPill>;

  const select = (next: string) => {
    setOpen(false);
    if (next === value) return;
    const [fy, period] = next.split(":");
    const search = new URLSearchParams(params.toString());
    search.set(FILTER_PARAMS.fiscalYear, fy);
    search.set(FILTER_PARAMS.period, period);
    const qs = search.toString();
    // The FILTERS ride along untouched. A reader who has narrowed to two funds and then
    // changes the month is asking the same question of a different period, not starting over.
    go(qs ? `${pathname}?${qs}` : pathname);
  };

  const dismiss = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onItemKeyDown = (e: KeyboardEvent, i: number) => {
    const last = periods.length - 1;
    const move = (to: number) => {
      e.preventDefault();
      itemsRef.current[to]?.focus();
    };
    if (e.key === "ArrowDown") move(i === last ? 0 : i + 1);
    else if (e.key === "ArrowUp") move(i === 0 ? last : i - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(last);
    else if (e.key === "Escape") dismiss();
    else if (e.key === "Tab") setOpen(false);
  };

  return (
    <div ref={ref} className="relative flex-none">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          } else if (e.key === "Escape" && open) {
            setOpen(false);
          }
        }}
        disabled={pending}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Reporting period: ${label}. Change period.`}
        className={cn(PERIOD_PILL, PILL_INTERACTIVE)}
      >
        {label}
        {pending ? (
          <Spinner size={13} />
        ) : (
          /* Furniture on paper: the printed page keeps the period, loses the affordance. */
          <PillChevron open={open} className="print:hidden" />
        )}
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Reporting period"
          className={cn(
            PILL_MENU,
            "absolute right-0 top-[calc(100%+6px)] z-30 max-h-[300px] w-[232px] overflow-y-auto p-[6px]",
          )}
        >
          <p className="px-[10px] pb-[4px] pt-[6px] text-[10px] font-bold uppercase leading-normal tracking-[0.6px] text-[#797979]">
            Reporting period
          </p>
          {periods.map((p, i) => {
            const selected = p.value === value;
            return (
              <button
                key={p.value}
                ref={(el) => {
                  itemsRef.current[i] = el;
                }}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => select(p.value)}
                onKeyDown={(e) => onItemKeyDown(e, i)}
                className={cn(
                  "flex w-full items-center justify-between gap-[8px] rounded-[11px] px-[10px] py-[7px] text-left transition-colors",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#301a93]",
                  selected ? "bg-[rgba(0,6,6,0.06)]" : "hover:bg-[rgba(0,6,6,0.04)]",
                )}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[13px] font-semibold leading-[17px] tracking-[0.13px] text-[#060606]">
                    {p.primary ?? p.label}
                  </span>
                  {p.secondary && (
                    <span className="truncate text-[11px] font-semibold leading-[15px] text-[#797979]">
                      {p.secondary}
                    </span>
                  )}
                </span>
                {selected && (
                  <span className="text-[#1a932e]">
                    <Tick />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
