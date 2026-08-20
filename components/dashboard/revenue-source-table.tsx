import { cn } from "@/lib/cn";
import { CARD_TITLE, COLUMN_HEADER, ROW_LABEL } from "@/components/dashboard/type-scale";
import { OverviewPanel } from "@/components/dashboard/overview-panel";
import { PacePill, PillLink } from "@/components/dashboard/revenue-shared";
import type { PaceStatus } from "@/lib/dashboard/pace";

/**
 * "Revenues by Major Source" — a transcription of Figma 46:3339.
 *
 * A 20px title with the white "Go to Revenue Details" capsule at the right, then a six-column
 * table: 14px regular headers, bold 14px source names that wrap inside a 161px column, the
 * variance stacked over its own percentage, and the band's tinted pace pill on every row.
 * A solid rule under the header and above the total; dashed hairlines between body rows.
 *
 * The mockup draws a 4px scrollbar thumb beside the body (46:3401) — the rows SCROLL. The
 * body is capped at the visible-row count of the full-width revision (64:8868 shows six)
 * and the total row stays outside the scroll, so the figure the table exists to state
 * never scrolls away.
 *
 * FONT: Aeonik Pro TRIAL in the mockup; everything inherits the app stack, as everywhere in
 * this redesign. The mockup's 8px pill text is set at 10px — the standard normalisation.
 */

export interface SourceRow {
  id: string;
  /**
   * The source label — already through codeName, so it honours Codes / Names. A plain
   * string that WRAPS inside the design's 161px column (the mockup runs "Florida Education
   * Finance Program" to three lines), with the full label on hover.
   */
  label: string;
  budget: string;
  actual: string;
  pctBudget: string;
  variance: string;
  variancePct: string;
  negative: boolean;
  status: PaceStatus;
}

/**
 * The column grid. The mockup's 161px label column is widened to 280px — the label is the
 * only wrapping text, so it earns the slack.
 *
 * Every other track is DETERMINISTIC (an fr share, or a fixed px for the pill), never
 * `auto`. The header, the scrolling body and the total are three separate grids: an `auto`
 * track sizes to the content of ITS OWN grid, so the bold total measured wider than the body,
 * the body wider than the headers, and the columns drifted apart. fr tracks depend only on
 * the container width, which is the same for all three — see GUTTER.
 */
const COLS =
  "grid grid-cols-[minmax(150px,280px)_minmax(76px,1fr)_minmax(76px,1fr)_minmax(72px,0.8fr)_minmax(84px,1fr)_84px] items-center gap-x-[12px]";

/**
 * The other half of that: the body scrolls, so its scrollbar eats into its content box and
 * every fr track there would come out a few px narrower than the header's. `scrollbar-gutter:
 * stable` reserves that gutter on ALL THREE grids — permanently, whether or not the rows
 * actually overflow — so the three containers are always exactly the same width.
 */
const GUTTER = "overflow-y-auto [scrollbar-gutter:stable] [scrollbar-width:thin]";

/**
 * Every figure cell. Money and percentages are RIGHT-aligned with tabular figures so the
 * digits — and the decimal points — stack down the column: left-aligned, "$0" and
 * "$716.11K" share a left edge and line up nowhere else.
 */
const NUM = "whitespace-nowrap text-right tabular-nums text-[14px] leading-normal text-[#060606]";

export function RevenueSourceTable({
  title = "Revenues by Major Source",
  ctaLabel = "Go to Revenue Details",
  ctaHref,
  rows,
  total,
}: {
  title?: string;
  ctaLabel?: string;
  ctaHref: string;
  rows: SourceRow[];
  total: SourceRow;
}) {
  return (
    <OverviewPanel className="flex flex-col p-[18px]">
      {/* ---- header ---- */}
      <div className="flex flex-wrap items-center justify-between gap-[10px] pt-[9px]">
        <h2 className={CARD_TITLE}>{title}</h2>
        <PillLink href={ctaHref}>{ctaLabel}</PillLink>
      </div>

      {/* The six/seven columns have hard `minmax` floors — they were never going to shrink
          into a phone's ~307px of card, they simply overflowed and `OverviewPanel`'s
          `overflow-clip` sliced the last columns off the screen. Scrolled sideways instead,
          the same wrapper fund-balance-by-fund-table.tsx and cash-by-fund-table.tsx already
          use: `-mx`/`px` so the scroll runs edge to edge under the card's own padding, and a
          `min-w` that keeps the header, the scrolling body and the total on one track so the
          three grids cannot drift apart. Above the floor it costs nothing — the container is
          wider than `min-w`, so no scrollbar appears and the desktop layout is untouched. */}
      <div className="-mx-[18px] overflow-x-auto px-[18px]">
        <div className="min-w-[620px]">
      {/* ---- column headers ---- */}
      <div className={cn(COLS, GUTTER, "mt-[22px] pb-[10px]", COLUMN_HEADER)}>
        <span>Revenue Source</span>
        <span className="text-right">
          Annual
          <br />
          Budget
        </span>
        <span className="text-right">
          Collected
          <br />
          YTD
        </span>
        <span className="text-right">
          %
          <br />
          Collected
        </span>
        <span className="text-right">Variance</span>
        <span className="text-right">Status</span>
      </div>
      <div aria-hidden className="h-px w-full bg-[#e7e7e7]" />

      {/* ---- body — the design's scroll area, six rows deep (64:8868) ---- */}
      <div className={cn(GUTTER, "max-h-[356px] min-h-0 overscroll-contain [scrollbar-color:#d9d9d9_transparent]")}>
        <ul>
          {rows.map((r, i) => (
            <li
              key={r.id}
              className={cn(
                COLS,
                "py-[10px]",
                i > 0 && "border-t border-dashed border-[#e7e7e7]",
              )}
            >
              <span title={r.label} className={ROW_LABEL}>
                {r.label}
              </span>
              <span className={NUM}>{r.budget}</span>
              <span className={NUM}>{r.actual}</span>
              <span className={NUM}>{r.pctBudget}</span>
              <span className="flex flex-col items-end whitespace-nowrap text-right tabular-nums leading-normal">
                <span className="text-[14px] text-[#060606]">{r.variance}</span>
                <span className="text-[10px] text-[#060606]">{r.variancePct}</span>
              </span>
              <span className="flex justify-end">
                <PacePill status={r.status} />
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* ---- total — outside the scroll, under its own solid rule ---- */}
      <div aria-hidden className="h-px w-full bg-[#e7e7e7]" />
      <div className={cn(COLS, GUTTER, "pb-[4px] pt-[16px] font-bold")}>
        <span className="text-[14px] leading-normal text-[#060606]">{total.label}</span>
        <span className={NUM}>{total.budget}</span>
        <span className={NUM}>{total.actual}</span>
        <span className={NUM}>{total.pctBudget}</span>
        <span
          className={cn(
            "flex flex-col items-end whitespace-nowrap text-right tabular-nums leading-normal",
            total.negative ? "text-[#fd4438]" : "text-[#1a932e]",
          )}
        >
          <span className="text-[14px]">{total.variance}</span>
          <span className="text-[10px]">{total.variancePct}</span>
        </span>
        <span className="flex justify-end">
          <PacePill status={total.status} />
        </span>
      </div>
        </div>
      </div>
    </OverviewPanel>
  );
}
