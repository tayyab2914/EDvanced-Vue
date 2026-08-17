import type { ReactNode } from "react";
import { OverviewPanel, OverviewPanelHeader } from "@/components/dashboard/overview-panel";
import { FundChip, PillLink } from "@/components/dashboard/revenue-shared";

/**
 * "Cash composition" — a transcription of Figma 55:5363: the share rows with their 13px
 * coloured runs and hatched remainders (the Fund Balance composition card's bar
 * treatment), the little "View by" capsule at the top right, the outlined caption chip
 * centred over the bars naming the active view, and the centred "View … Details" capsule
 * at the card's floor.
 *
 * THE BAR GEOMETRY IS COMPUTED, NOT TRACED — the mockup paints every row "Salaries ·
 * $15.8M · 64.0%" (a paste from the Expenditure band). Each run here is its true share of
 * the ending cash balance, on whichever view the capsule has chosen.
 */

export interface CashCompositionRow {
  id: string;
  label: string;
  /** Pre-formatted money — "$15.8M". */
  display: string;
  /** "64.0%" — pinned hard right. */
  share: string;
  /** 0–100 — the filled run's length. */
  sharePct: number;
  color: string;
}

const HATCH: React.CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(135deg, #dcdcdc 0px, #dcdcdc 2px, transparent 2px, transparent 6px)",
};

export function CashCompositionCard({
  title = "Cash composition",
  subtitle,
  /** The centred outlined chip — "By cash category · all funds". */
  caption,
  control,
  rows,
  ctaLabel,
  ctaHref,
  empty,
}: {
  title?: string;
  subtitle: string;
  caption: string;
  /** The "View by" capsule — a PillSelect, passed in so this card stays on the server. */
  control?: ReactNode;
  rows: CashCompositionRow[];
  ctaLabel: string;
  ctaHref: string;
  empty: string;
}) {
  return (
    <OverviewPanel className="flex flex-col p-[18px]">
      <div className="flex items-start justify-between gap-[10px]">
        <OverviewPanelHeader title={title} subtitle={subtitle} />
        {control}
      </div>

      <div className="mt-[10px] flex justify-center">
        <FundChip>{caption}</FundChip>
      </div>

      {rows.length === 0 ? (
        <p className="flex flex-1 items-center justify-center py-[36px] text-center text-[12px] leading-relaxed text-[#060606]">
          {empty}
        </p>
      ) : (
        <ul className="mt-[14px] flex flex-col gap-[8px]">
          {rows.map((r) => {
            const pct = Math.max(Math.min(r.sharePct, 100), r.sharePct > 0 ? 2 : 0);
            return (
              <li key={r.id}>
                <div className="flex h-[30px] items-center justify-between gap-[12px]">
                  <span
                    className="min-w-0 truncate text-[14px] leading-[2] tracking-[0.15px] text-[#060606]"
                    title={r.label}
                  >
                    {r.label}
                  </span>
                  <span className="flex flex-none items-baseline gap-[14px]">
                    <span className="whitespace-nowrap text-[10px] font-bold leading-[2] tracking-[0.1px] text-[#060606]">
                      {r.display}
                    </span>
                    <span className="whitespace-nowrap text-[10px] leading-[2] tracking-[0.1px] text-[#060606]">
                      {r.share}
                    </span>
                  </span>
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

      <div className="mt-auto flex justify-center pt-[16px]">
        <PillLink href={ctaHref}>{ctaLabel}</PillLink>
      </div>
    </OverviewPanel>
  );
}
