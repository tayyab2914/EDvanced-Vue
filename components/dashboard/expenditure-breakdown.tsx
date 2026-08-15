"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { OverviewPanel, OverviewPanelHeader } from "@/components/dashboard/overview-panel";
import { PacePill, PillLink } from "@/components/dashboard/revenue-shared";
import { VIEW_PARAM, type ViewOption } from "@/lib/dashboard/view";
import type { StatusRung } from "@/lib/dashboard/status";

/**
 * The Expenditure redesign's "view by" band — a transcription of Figma 55:2941: the
 * seven-column breakdown table on its own card (55:2977), then the Object / Function /
 * Cost Center Type / Project capsule, the full-width share bars and the centred
 * "View Expenditure Details" capsule sitting DIRECTLY ON THE CANVAS below it (55:2942).
 * The bars deliberately have no card behind them — that is the design's own move, and it
 * is what makes this band read as one wide instrument rather than two more tiles.
 *
 * ONE CLIENT COMPONENT for the whole band, same bargain as the Revenue category switcher
 * (revenue-view-tabs.tsx): choosing a perspective is a server navigation on the `groupBy`
 * URL parameter, and while the server regroups, the table AND the bars — which both change
 * with the view — show skeletons of themselves together. Every figure arrives pre-formatted
 * from the server page; no Prisma.Decimal crosses into the client.
 *
 * THE BAR GEOMETRY IS COMPUTED, NOT TRACED — the mockup paints every row 64%. Each row's
 * filled run is its true share of YTD spending, with the money label riding at the filled
 * run's tip exactly as drawn, and the remainder hatched in CSS (no asset, prints clean).
 *
 * FONT: Aeonik Pro TRIAL in the mockup; everything inherits the app stack. The mockup's
 * 8px status pills are set at 10px — the redesign's standard normalisation.
 */

export interface BreakdownTableRow {
  id: string;
  /** The dimension as this card labels it — the name, never the number (see the page). */
  label: string;
  /** The hidden code, surfaced on hover so the ascending order can still be checked. */
  note?: string;
  budget: string;
  actual: string;
  encumbered: string;
  available: string;
  /** Tints the Available figure red — a group that committed more than it was given. */
  availableNegative?: boolean;
  utilized: string;
  /** Tints the Utilized figure red — past the district's own critical ceiling. */
  utilizedCritical?: boolean;
  status?: { label: string; rung: StatusRung };
}

export interface BreakdownBarRow {
  id: string;
  label: string;
  /** Actual YTD, pre-formatted — rides at the filled run's tip. */
  display: string;
  /** "64.0%" — the share of total spending, pinned hard right. */
  share: string;
  /** 0–100 — the filled run's length. */
  sharePct: number;
  color: string;
}

/** The design's column grid — the label, five figures, the pill; left-aligned as drawn. */
const COLS =
  "grid grid-cols-[minmax(150px,1.4fr)_minmax(64px,1fr)_minmax(64px,1fr)_minmax(70px,1fr)_minmax(64px,1fr)_minmax(52px,0.8fr)_minmax(56px,auto)] items-center gap-x-[12px]";

const HATCH: React.CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(135deg, #dcdcdc 0px, #dcdcdc 2px, transparent 2px, transparent 6px)",
};

export function ExpenditureBreakdownSection({
  title,
  subtitle,
  column,
  options,
  value,
  rows,
  total,
  bars,
  ctaLabel,
  ctaHref,
  empty,
}: {
  title: string;
  subtitle: string;
  /** The first column's header — "Object", "Function", "Cost center type", "Project". */
  column: string;
  options: readonly ViewOption[];
  value: string;
  rows: BreakdownTableRow[];
  total: BreakdownTableRow;
  bars: BreakdownBarRow[];
  ctaLabel: string;
  ctaHref: string;
  empty: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  // The tab the reader just chose — highlighted at once, while the server regroups. Null
  // until the first click, so the initial page load keeps its scroll-triggered reveal.
  const [target, setTarget] = useState<string | null>(null);

  const active = pending && target ? target : value;

  const choose = (next: string) => {
    if (next === active) return;
    setTarget(next);
    const qp = new URLSearchParams(params.toString());
    if (next === options[0].value) qp.delete(VIEW_PARAM);
    else qp.set(VIEW_PARAM, next);
    const qs = qp.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  };

  return (
    <section className="w-full">
      {/* ---- the table card ---- */}
      <OverviewPanel className="flex flex-col p-[18px]">
        <OverviewPanelHeader title={title} subtitle={subtitle} />

        {pending ? (
          <TableSkeleton />
        ) : (
          <div key={value} className={cn(target !== null && "rev-swap-in")}>
            {/* column headers */}
            <div
              className={cn(
                COLS,
                "mt-[10px] pb-[10px] text-[14px] leading-normal tracking-[0.14px] text-[#060606]",
              )}
            >
              <span>{column}</span>
              <span>Budget</span>
              <span>Actual (YTD)</span>
              <span>Encumbered</span>
              <span>Available</span>
              <span>Utilized</span>
              <span>Status</span>
            </div>
            <div aria-hidden className="h-px w-full bg-[#e7e7e7]" />

            {rows.length === 0 ? (
              <p className="flex items-center justify-center py-[36px] text-[12px] text-[#797979]">
                {empty}
              </p>
            ) : (
              <div className="max-h-[272px] min-h-0 overflow-y-auto overscroll-contain [scrollbar-color:#d9d9d9_transparent] [scrollbar-width:thin]">
                <ul>
                  {rows.map((r) => (
                    <li key={r.id} className={cn(COLS, "py-[11px]")}>
                      <span
                        title={r.note ? `${r.note} — ${r.label}` : r.label}
                        className="truncate text-[14px] font-bold leading-[1.35] text-[#060606]"
                      >
                        {r.label}
                      </span>
                      <span className="whitespace-nowrap text-[14px] leading-normal text-[#060606]">
                        {r.budget}
                      </span>
                      <span className="whitespace-nowrap text-[14px] leading-normal text-[#060606]">
                        {r.actual}
                      </span>
                      <span className="whitespace-nowrap text-[14px] leading-normal text-[#060606]">
                        {r.encumbered}
                      </span>
                      <span
                        className={cn(
                          "whitespace-nowrap text-[14px] leading-normal",
                          r.availableNegative ? "font-bold text-[#fd4438]" : "text-[#060606]",
                        )}
                      >
                        {r.available}
                      </span>
                      <span
                        className={cn(
                          "whitespace-nowrap text-[14px] leading-normal",
                          r.utilizedCritical ? "font-bold text-[#fd4438]" : "text-[#060606]",
                        )}
                      >
                        {r.utilized}
                      </span>
                      <span>{r.status && <PacePill status={r.status} />}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* ---- total — outside the scroll, under its own solid rule ---- */}
            <div aria-hidden className="h-px w-full bg-[#e7e7e7]" />
            <div className={cn(COLS, "pb-[4px] pt-[16px] text-[14px] font-bold leading-normal text-[#060606]")}>
              <span>{total.label}</span>
              <span className="whitespace-nowrap">{total.budget}</span>
              <span className="whitespace-nowrap">{total.actual}</span>
              <span className="whitespace-nowrap">{total.encumbered}</span>
              <span className={cn("whitespace-nowrap", total.availableNegative && "text-[#fd4438]")}>
                {total.available}
              </span>
              <span className="whitespace-nowrap">{total.utilized}</span>
              <span>{total.status && <PacePill status={total.status} />}</span>
            </div>
          </div>
        )}
      </OverviewPanel>

      {/* ---- the capsule — on the canvas, centred, as drawn ---- */}
      <div className="mt-[30px] flex justify-center">
        <div
          role="tablist"
          aria-label="View by"
          className="flex h-[33px] w-fit max-w-full items-center overflow-x-auto rounded-[38px] bg-[#f7f7f7] p-px print:hidden"
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="tab"
              aria-selected={o.value === active}
              onClick={() => choose(o.value)}
              className={cn(
                "flex h-[31px] items-center whitespace-nowrap rounded-[38px] px-[18px] text-[10px] font-bold leading-[2] tracking-[0.1px] text-black transition-colors",
                o.value === active
                  ? "bg-white shadow-[0_1px_2px_rgba(0,6,6,0.06)]"
                  : "hover:bg-white/60",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* ---- the share bars — full width, no card, as drawn ---- */}
      {pending ? (
        <BarsSkeleton />
      ) : (
        <div key={`bars-${value}`} className={cn(target !== null && "rev-swap-in")}>
          {bars.length > 0 && (
            <ul className="mt-[46px] flex flex-col gap-[10px]">
              {bars.map((r) => {
                const pct = Math.max(Math.min(r.sharePct, 100), r.sharePct > 0 ? 2 : 0);
                /**
                 * The money label rides at the filled run's tip, as drawn — but only when
                 * the run is long enough to have carried it past the row's own label. On a
                 * short run it docks beside the share instead, because a tag that rides a
                 * 8% tip lands on top of the words "Purchased Services".
                 */
                const tipRiding = pct >= 30;
                return (
                  <li key={r.id}>
                    <div className="relative flex h-[30px] items-center justify-between gap-[16px]">
                      <span
                        className="min-w-0 truncate text-[15px] leading-[2] tracking-[0.15px] text-black"
                        title={r.label}
                      >
                        {r.label}
                      </span>
                      <span className="flex flex-none items-center gap-[16px]">
                        {!tipRiding && (
                          <span className="whitespace-nowrap text-[10px] font-bold leading-[2] tracking-[0.1px] text-black">
                            {r.display}
                          </span>
                        )}
                        <span className="whitespace-nowrap text-[10px] leading-[2] tracking-[0.1px] text-black">
                          {r.share}
                        </span>
                      </span>
                      {tipRiding && (
                        <span
                          className="absolute top-1/2 -translate-x-full -translate-y-1/2 whitespace-nowrap pr-[4px] text-[10px] font-bold leading-[2] tracking-[0.1px] text-black"
                          style={{ left: `clamp(240px, ${pct}%, calc(100% - 58px))` }}
                        >
                          {r.display}
                        </span>
                      )}
                    </div>
                    {/* The 13px track: the share in its slot colour, the rest hatched. */}
                    <div className="relative h-[13px] w-full overflow-clip rounded-full" style={HATCH}>
                      <span
                        className="anim-bar absolute inset-y-0 left-0 rounded-full"
                        style={{ width: `${pct}%`, background: r.color }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <div className="mt-[24px] flex justify-center">
        <PillLink href={ctaHref}>{ctaLabel}</PillLink>
      </div>
    </section>
  );
}

/** The table's own shape as placeholder, pulsing — sized so the card does not jump. */
function TableSkeleton() {
  return (
    <div role="status" aria-live="polite" className="animate-pulse">
      <span className="sr-only">Regrouping…</span>
      <div aria-hidden className="mt-[10px]">
        <div className="flex items-center gap-[12px] pb-[12px]">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-[12px] flex-1 rounded-full bg-[#060606]/[0.08]" />
          ))}
        </div>
        <div className="h-px w-full bg-[#e7e7e7]" />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-[12px] py-[13px]">
            {[0, 1, 2, 3, 4, 5, 6].map((j) => (
              <div key={j} className="h-[12px] flex-1 rounded-full bg-[#060606]/[0.06]" />
            ))}
          </div>
        ))}
        <div className="h-px w-full bg-[#e7e7e7]" />
        <div className="flex items-center gap-[12px] pt-[16px]">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-[12px] flex-1 rounded-full bg-[#060606]/[0.08]" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Three pulsing share rows — the bars' own shape as placeholder. */
function BarsSkeleton() {
  return (
    <ul aria-hidden className="mt-[46px] flex animate-pulse flex-col gap-[10px]">
      {[0, 1, 2].map((i) => (
        <li key={i}>
          <div className="flex h-[30px] items-center justify-between">
            <div className="h-[12px] w-2/5 rounded-full bg-[#060606]/[0.08]" />
            <div className="h-[10px] w-[76px] rounded-full bg-[#060606]/[0.08]" />
          </div>
          <div className="h-[13px] w-full rounded-full bg-[#060606]/[0.06]" />
        </li>
      ))}
    </ul>
  );
}
