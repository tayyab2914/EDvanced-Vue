import { cn } from "@/lib/cn";
import { OverviewPanel } from "@/components/dashboard/overview-panel";
import { PacePill, PillLink } from "@/components/dashboard/revenue-shared";
import type { PaceStatus } from "@/lib/dashboard/pace";

/**
 * "Revenue by major source" — a transcription of Figma 46:3339.
 *
 * A 20px title with the white "Go to Revenue Details" capsule at the right, then a six-column
 * table: 14px regular headers, bold 14px source names that wrap inside a 161px column, the
 * variance stacked over its own percentage, and the band's tinted pace pill on every row.
 * A solid rule under the header and above the total; dashed hairlines between body rows.
 *
 * The mockup draws a 4px scrollbar thumb beside the body (46:3401) — the rows SCROLL. The
 * body is capped at the design's four visible rows and the total row stays outside the
 * scroll, so the figure the table exists to state never scrolls away.
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

/** The design's column grid — 161px of label, four figures, the pill hard right. */
const COLS =
  "grid grid-cols-[minmax(150px,161px)_minmax(64px,0.9fr)_minmax(64px,0.9fr)_minmax(56px,0.8fr)_minmax(76px,1fr)_minmax(64px,auto)] items-center gap-x-[12px]";

export function RevenueSourceTable({
  title = "Revenue by major source",
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
        <h2 className="text-[20px] leading-[18px] tracking-[0.16px] text-[#060606]">{title}</h2>
        <PillLink href={ctaHref}>{ctaLabel}</PillLink>
      </div>

      {/* ---- column headers ---- */}
      <div className={cn(COLS, "mt-[22px] pb-[10px] text-[14px] leading-normal tracking-[0.14px] text-[#060606]")}>
        <span>Indicator</span>
        <span>
          Budget
          <br />
          (full year)
        </span>
        <span>
          Actual
          <br />
          (YTD)
        </span>
        <span>
          % of
          <br />
          budget
        </span>
        <span className="text-center">Variance $</span>
        <span className="text-right">Status</span>
      </div>
      <div aria-hidden className="h-px w-full bg-[#e7e7e7]" />

      {/* ---- body — the design's scroll area, four rows deep ---- */}
      <div className="max-h-[266px] min-h-0 overflow-y-auto overscroll-contain [scrollbar-color:#d9d9d9_transparent] [scrollbar-width:thin]">
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
              <span
                title={r.label}
                className="text-[14px] font-bold leading-[1.35] text-[#060606]"
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
                {r.pctBudget}
              </span>
              <span className="flex flex-col items-center whitespace-nowrap text-center leading-normal">
                <span className="text-[14px] text-[#060606]">{r.variance}</span>
                <span className="text-[10px] text-[#797979]">{r.variancePct}</span>
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
      <div className={cn(COLS, "pb-[4px] pt-[16px] font-bold")}>
        <span className="text-[14px] leading-normal text-[#060606]">{total.label}</span>
        <span className="whitespace-nowrap text-[14px] leading-normal text-[#060606]">
          {total.budget}
        </span>
        <span className="whitespace-nowrap text-[14px] leading-normal text-[#060606]">
          {total.actual}
        </span>
        <span className="whitespace-nowrap text-[14px] leading-normal text-[#060606]">
          {total.pctBudget}
        </span>
        <span
          className={cn(
            "flex flex-col items-center whitespace-nowrap text-center leading-normal",
            total.negative ? "text-[#fd4438]" : "text-[#1a932e]",
          )}
        >
          <span className="text-[14px]">{total.variance}</span>
          <span className="text-[10px] opacity-75">{total.variancePct}</span>
        </span>
        <span className="flex justify-end">
          <PacePill status={total.status} />
        </span>
      </div>
    </OverviewPanel>
  );
}
