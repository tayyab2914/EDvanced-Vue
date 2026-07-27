"use client";

import { useState, useRef, useEffect } from "react";
import { Icon } from "@/components/icons";

/**
 * The header scope controls' shared parts — the option shape, and the export menu.
 *
 * The bar itself moved to components/dashboard/filter-bar.tsx when the single fund selector
 * became a multi-select, and the period dropdown that used to live here moved into the
 * Filters panel (components/dashboard/filter-menu.tsx) when every dimension was gathered
 * behind one button. Export stayed: it is a menu of ACTIONS, not a filter, and putting a
 * download inside a control whose other rows narrow the page would be a category error.
 *
 * A CLIENT component, but a very thin one: it only opens links or calls `print()`. The
 * scope is resolved on the server (lib/dashboard/scope.ts) and every figure is computed
 * there, so changing the period is a server navigation rather than a client refetch. That
 * is what keeps Prisma.Decimal out of the browser — no figure ever crosses the boundary.
 *
 * One filter row above everything it scopes, never a filter inside a card: all the charts
 * on the page re-render against the same slice, which is the only way a dashboard's cards
 * can be trusted to agree with one another.
 */

export interface ScopeOption {
  value: string;
  label: string;
}

/**
 * The export control — a MENU, not a link, since M4.
 *
 * The client asked for two exports and was specific about the difference: a one-page
 * landscape PDF "intended for board meetings and executive leadership", and the existing
 * multi-page detailed export "for analysis". Those are different artefacts for different
 * rooms, and collapsing them behind one button would mean whichever it did was wrong half
 * the time.
 *
 * The summary is a ROUTE, not a generated file: `?view=summary` re-renders the same server
 * components into a one-page print layout. That is the same bargain §8.5 struck for the
 * detailed PDF — the browser's own Save as PDF is the export — and it is why these charts
 * are server-rendered SVG rather than a client charting library, which would print blank.
 *
 * The heading says "One-page summary" rather than "Executive summary": every dashboard has
 * one now, and only one of them is the Executive dashboard.
 */
export function ExportMenu({
  detailHref,
  summaryHref,
}: {
  detailHref?: string;
  summaryHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const item =
    "block w-full px-3 py-2 text-left text-[12.5px] text-ink-muted transition-colors hover:bg-panel";

  return (
    <div ref={ref} className="relative print:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-[12.5px] font-medium text-ink-soft transition-colors hover:border-[#c8d3e4]"
      >
        <Icon name="upload" size={14} className="rotate-180" />
        Export
        <span aria-hidden className="text-[9px] text-muted-2">
          ▼
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-[264px] overflow-hidden rounded-lg border border-line bg-white py-1 shadow-lg"
        >
          {summaryHref && (
            <>
              <p className="px-3 pb-1 pt-1.5 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-muted-2">
                One-page summary
              </p>
              <a role="menuitem" href={summaryHref} className={item}>
                One-page landscape PDF
                <span className="mt-0.5 block text-[11px] text-muted-2">
                  For board meetings and leadership.
                </span>
              </a>
            </>
          )}

          <p className="border-t border-line-soft px-3 pb-1 pt-2 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-muted-2">
            Detailed export
          </p>
          {detailHref && (
            <>
              <a role="menuitem" href={detailHref} className={item}>
                Excel workbook (.xlsx)
              </a>
              <a
                role="menuitem"
                href={`${detailHref}${detailHref.includes("?") ? "&" : "?"}format=csv`}
                className={item}
              >
                CSV
              </a>
            </>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              window.print();
            }}
            className={item}
          >
            Print this dashboard (PDF)
            <span className="mt-0.5 block text-[11px] text-muted-2">
              Multi-page, everything on screen.
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
