import { cn } from "@/lib/cn";
import { CARD_TITLE, COLUMN_HEADER, ROW_LABEL } from "@/components/dashboard/type-scale";
import { OverviewPanel } from "@/components/dashboard/overview-panel";
import { PacePill, PillLink } from "@/components/dashboard/revenue-shared";
import type { StatusRung } from "@/lib/dashboard/status";

/**
 * "Expenditures by function (YTD)" — a transcription of Figma 55:3056, the Expenditure
 * band's sibling of the Revenue source table and deliberately the same construction: a 20px
 * title with the white capsule at the right (the mockup's own label reads "Go to Revenue
 * Details" — a copy-paste the caller corrects), 14px regular headers, bold 14px function
 * names wrapping inside the 161px column, Available stacked over its utilisation the way
 * the source table stacks the variance, and the band's tinted pace pill on every row.
 *
 * The mockup draws the 4px scrollbar thumb beside the body (55:3118) — the rows SCROLL,
 * capped at the design's four visible rows, and the total stays outside the scroll.
 *
 * Rows keep the client's M4 vocabulary: an overspent function is lettered "Overspent" on
 * the red rung, one approaching its utilisation ceiling "Approaching" on the amber — the
 * same grading the old table carried, in the new band's pills.
 */

export interface FunctionRow {
  id: string;
  /** Already through codeName, so it honours Codes / Names; wraps, full label on hover. */
  label: string;
  budget: string;
  actual: string;
  encumbered: string;
  available: string;
  availableNegative: boolean;
  /** "84.25%" — stacked under Available in the design's 10px grey. */
  utilized: string;
  status: { label: string; rung: StatusRung };
}

/** The design's column grid — 161px of label, four figures, the pill hard right. */
const COLS =
  "grid grid-cols-[minmax(150px,161px)_minmax(56px,0.9fr)_minmax(64px,0.9fr)_minmax(64px,0.9fr)_minmax(76px,1fr)_minmax(64px,auto)] items-center gap-x-[12px]";

export function ExpenditureFunctionTable({
  title = "Expenditures by function (YTD)",
  ctaLabel = "Go to Expenditure Details",
  ctaHref,
  rows,
  total,
}: {
  title?: string;
  ctaLabel?: string;
  ctaHref: string;
  rows: FunctionRow[];
  total: FunctionRow;
}) {
  return (
    <OverviewPanel className="flex flex-col p-[18px]">
      {/* ---- header ---- */}
      <div className="flex flex-wrap items-center justify-between gap-[10px] pt-[9px]">
        <h2 className={CARD_TITLE}>{title}</h2>
        <PillLink href={ctaHref}>{ctaLabel}</PillLink>
      </div>

      {/* ---- column headers ---- */}
      <div className={cn(COLS, "mt-[22px] pb-[10px]", COLUMN_HEADER)}>
        <span>Indicator</span>
        <span>Budget</span>
        <span>
          Actual
          <br />
          (YTD)
        </span>
        <span>Encumbered</span>
        <span className="text-center">Available</span>
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
              <span title={r.label} className={ROW_LABEL}>
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
              <span className="flex flex-col items-center whitespace-nowrap text-center leading-normal">
                <span
                  className={cn(
                    "text-[14px]",
                    r.availableNegative ? "font-bold text-[#fd4438]" : "text-[#060606]",
                  )}
                >
                  {r.available}
                </span>
                <span className="text-[10px] text-[#060606]" title="Budget utilized">
                  {r.utilized} utilized
                </span>
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
          {total.encumbered}
        </span>
        <span
          className={cn(
            "flex flex-col items-center whitespace-nowrap text-center leading-normal",
            total.availableNegative ? "text-[#fd4438]" : "text-[#060606]",
          )}
        >
          <span className="text-[14px]">{total.available}</span>
          <span className="text-[10px]">{total.utilized} utilized</span>
        </span>
        <span className="flex justify-end">
          <PacePill status={total.status} />
        </span>
      </div>
    </OverviewPanel>
  );
}
