import { OverviewPanel, OverviewPanelHeader } from "@/components/dashboard/overview-panel";
import { RevenueCategorySwitcher } from "@/components/dashboard/revenue-view-tabs";
import {
  CapsuleStatStrip,
  PillLink,
  type CapsuleStat,
} from "@/components/dashboard/revenue-shared";
import type { ViewOption } from "@/lib/dashboard/view";

/**
 * "Revenue by category (YTD)" — a transcription of Figma 46:3184.
 *
 * The band's 16px/10px header, the segmented Type / Code & Name / Project-Grant switcher,
 * share rows whose 13px track is painted in the app's categorical slot colour with the
 * REMAINDER hatched, the capsule stat strip, and the centred "View Revenue details"
 * capsule at the foot.
 *
 * The rows and the strip live INSIDE the switcher (a client island), which shows a
 * skeleton of them while a chosen perspective is regrouped on the server and replays the
 * bar entrance when the new rows land — see revenue-view-tabs.tsx. The card itself stays
 * a Server Component; the figures never enter the client.
 *
 * THE BAR GEOMETRY IS COMPUTED, NOT TRACED — the mockup paints every row 64%. Each row's
 * filled run is its true share of the total; the hatched run is everything it is not. The
 * hatch itself is CSS (a 135° repeating gradient) rather than the design's exported
 * pattern, so it needs no asset and prints.
 */

export interface CategoryRow {
  id: string;
  label: string;
  /** Actual YTD, pre-formatted. */
  display: string;
  /** "64.0%" — the share of total collections. */
  share: string;
  /** 0–100 — the filled run's length. */
  sharePct: number;
  color: string;
}

const HATCH: React.CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(135deg, #dcdcdc 0px, #dcdcdc 2px, transparent 2px, transparent 6px)",
};

export function RevenueCategoryCard({
  title,
  subtitle,
  view,
  viewOptions,
  rows,
  stats,
  ctaLabel = "View Revenue details",
  ctaHref,
  empty = "Nothing to break down for this period yet.",
}: {
  title: string;
  subtitle: string;
  /** The active perspective — REVENUE_VIEWS's value, resolved by the page. */
  view: string;
  /** The switcher's short labels — the design's "Type" / "Code & Name" / "Project/Grant". */
  viewOptions: readonly ViewOption[];
  rows: CategoryRow[];
  stats: CapsuleStat[];
  ctaLabel?: string;
  ctaHref: string;
  empty?: string;
}) {
  return (
    <OverviewPanel className="flex flex-col p-[18px]">
      <OverviewPanelHeader title={title} subtitle={subtitle} />

      <RevenueCategorySwitcher options={viewOptions} value={view}>
        {/* ---- share rows ---- */}
        {rows.length === 0 ? (
          <p className="flex flex-1 items-center justify-center py-[36px] text-[12px] text-[#060606]">
            {empty}
          </p>
        ) : (
          <ul className="mt-[14px] flex flex-col gap-[10px]">
            {rows.map((r) => (
              <li key={r.id}>
                <div className="flex items-baseline justify-between gap-[10px]">
                  <span
                    className="min-w-0 truncate text-[14px] leading-[2] tracking-[0.15px] text-[#060606]"
                    title={r.label}
                  >
                    {r.label}
                  </span>
                  <span className="flex flex-none items-baseline gap-[16px]">
                    <span className="text-[10px] font-bold leading-[2] tracking-[0.1px] text-[#060606]">
                      {r.display}
                    </span>
                    <span className="text-[10px] leading-[2] tracking-[0.1px] text-[#060606]">
                      {r.share}
                    </span>
                  </span>
                </div>
                {/* The 13px track: the share in its slot colour, the rest hatched. */}
                <div className="relative h-[13px] w-full overflow-clip rounded-full" style={HATCH}>
                  <span
                    className="anim-bar absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${Math.max(Math.min(r.sharePct, 100), r.sharePct > 0 ? 2 : 0)}%`,
                      background: r.color,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* ---- the capsule strip, pinned to the card's foot ---- */}
        <div className="mt-auto pt-[16px]">
          <CapsuleStatStrip items={stats} />
        </div>
      </RevenueCategorySwitcher>

      <div className="mt-[12px] flex justify-center pb-[2px]">
        <PillLink href={ctaHref}>{ctaLabel}</PillLink>
      </div>
    </OverviewPanel>
  );
}
