import { cn } from "@/lib/cn";
import { CountUp } from "@/components/count-up";
import { Icon } from "@/components/icons";
import { ArrowGlyph } from "@/components/dashboard/overview-panel";
import type { StatusRung } from "@/lib/dashboard/status";

/**
 * The Revenue redesign's status strip — a transcription of Figma 46:3495 ("Cards") with the
 * two page-level floaters the mockup leaves outside it reunited: the "Unhealthy" pill
 * (46:3518) and the "→ Policy ± 5.00%" line (46:3520).
 *
 * Two panes on one white bordered card, the same construction as the Executive band's
 * OverviewSplitCard: "Revenue status" with its verdict in 25px ink and a sparkline of the
 * monthly variance beside it, then "Days in fiscal year" with the design's green calendar.
 *
 * THE SPARKLINE IS COMPUTED, NOT TRACED. The mockup ships a frozen red squiggle
 * (Chart 3, trend Down); this one draws the district's own monthly variance series in the
 * verdict's colour, so a district running ahead of budget gets a green line rather than a
 * decorative emergency. A single committed period draws nothing — one point is not a trend.
 *
 * FONT: the mockup sets DM Sans on the pane titles and figures and Aeonik Pro TRIAL on the
 * captions — the same trial-licence situation overview-kpi.tsx documents. Everything
 * inherits the app stack at the design's sizes and weights.
 */

/** The verdict's ink — the design's red for Action Required, extended along the ladder. */
const RUNG_INK: Record<StatusRung, string> = {
  Strong: "#1a932e",
  Acceptable: "#1a932e",
  Monitor: "#b76a12",
  "Action Required": "#fd4438",
  "N/A": "#797979",
};

/** The design's local vocabulary for the little pill under the verdict. */
const RUNG_WORD: Record<StatusRung, string> = {
  Strong: "Healthy",
  Acceptable: "Healthy",
  Monitor: "Watch",
  "Action Required": "Unhealthy",
  "N/A": "Not available",
};

const RUNG_PILL_BG: Record<StatusRung, string> = {
  Strong: "rgba(26,147,46,0.18)",
  Acceptable: "rgba(26,147,46,0.18)",
  Monitor: "rgba(239,138,31,0.18)",
  "Action Required": "rgba(238,32,28,0.18)",
  "N/A": "rgba(172,172,171,0.18)",
};

/** Catmull-Rom through the points, as cubic beziers — the squiggle's easing. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

/**
 * The 64px squiggle beside the verdict — the design's "Chart 3" instance, drawn from the
 * district's monthly variance series instead of shipped frozen.
 */
function StatusSpark({ points, color }: { points: (number | null)[]; color: string }) {
  const known = points.filter((v): v is number => v !== null);
  if (known.length < 2) return <span aria-hidden className="size-[64px] flex-none" />;

  const W = 64;
  const H = 40;
  const min = Math.min(...known);
  const max = Math.max(...known);
  const span = max - min || 1;
  const xs = points.map((_, i) => (points.length > 1 ? (i / (points.length - 1)) * W : W / 2));
  const pts = points
    .map((v, i) => (v === null ? null : { x: xs[i], y: 4 + (1 - (v - min) / span) * (H - 8) }))
    .filter((p): p is { x: number; y: number } => p !== null);

  const line = smoothPath(pts);
  const area = `${line} L ${pts[pts.length - 1].x.toFixed(2)} ${H} L ${pts[0].x.toFixed(2)} ${H} Z`;

  return (
    <span aria-hidden className="flex size-[64px] flex-none items-center justify-center">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        <defs>
          <linearGradient id="rev-status-spark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#rev-status-spark)" className="anim-fade" />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDashoffset={0}
          className="anim-draw"
        />
      </svg>
    </span>
  );
}

export function RevenueStatusStrip({
  rung,
  /** "needs a revenue budget for the year" — replaces the verdict when it cannot be judged. */
  verdict,
  policyNote,
  spark,
  days,
  elapsedNote,
}: {
  rung: StatusRung;
  verdict?: string;
  /** "Policy ± 5.00%" — the rule the verdict was judged against. */
  policyNote: string;
  /** Monthly variance %, nulls for months without data — the squiggle's series. */
  spark: (number | null)[];
  /** Days into the fiscal year, pre-formatted. */
  days: string;
  /** "16.7% elapsed" — the outlined capsule under the figure. */
  elapsedNote: string;
}) {
  const ink = RUNG_INK[rung];

  return (
    <div
      data-reveal
      className="mx-auto flex w-[676px] max-w-full flex-col rounded-[24px] bg-[#FFFFFF9E]"
    >
      <div className="flex w-full flex-col items-stretch gap-[8px] px-[8px] pb-[8px] pt-0 sm:flex-row sm:gap-[16px]">
        {/* ---- Revenue status ---- */}
        <div className="flex w-full min-w-0 flex-col gap-[6px] rounded-[16px] p-[16px] sm:w-[301px] sm:min-w-[254px] sm:flex-none">
          <div className="flex items-start justify-between gap-[8px]">
            <div className="flex min-w-0 flex-col items-start">
              <span className="text-[15px] font-medium leading-[20px] text-[#1f1f21]">
                Revenue status
              </span>
              <span className="text-[14px] leading-normal text-[rgba(121,121,121,0.55)]">
                Year to date
              </span>
              <span
                className="whitespace-nowrap text-[25px] font-medium leading-[36px]"
                style={{ color: ink }}
              >
                {verdict ?? (rung === "N/A" ? "Not available" : rung)}
              </span>
            </div>
            <StatusSpark points={spark} color={ink} />
          </div>
          <div className="flex flex-col items-start gap-[6px]">
            <span
              className="inline-flex items-center rounded-[20px] px-[8px] py-px text-[10px] leading-normal tracking-[0.1px]"
              style={{ background: RUNG_PILL_BG[rung], color: ink }}
            >
              {RUNG_WORD[rung]}
            </span>
            <span className="flex items-center gap-[4px] text-[10px] leading-[12px] tracking-[0.2px] text-[#060606]">
              <span className="flex size-[14px] flex-none items-center justify-center">
                <ArrowGlyph color="#060606" />
              </span>
              {policyNote}
            </span>
          </div>
        </div>

        {/* The 40px hairline driver — full-width when the panes stack on a phone. */}
        <div
          aria-hidden
          className={cn(
            "h-px w-full flex-none self-stretch bg-[#e7e7e7]",
            "sm:h-[40px] sm:w-px sm:self-center",
          )}
        />

        {/* ---- Days in fiscal year ---- */}
        <div className="relative flex w-full min-w-0 flex-col gap-[10px] rounded-[16px] p-[16px] sm:w-[290px] sm:min-w-[254px] sm:flex-none">
          <div className="flex items-start justify-between gap-[8px]">
            <div className="flex min-w-0 flex-col items-start gap-[8px]">
              <span className="text-[15px] font-medium leading-[20px] text-[#1f1f21]">
                Days in fiscal year
              </span>
              <span className="text-[32px] font-medium leading-[36px] text-[#1f1f21] [font-variant-numeric:proportional-nums]">
                <CountUp value={days} />
              </span>
            </div>
            {/* The design's Calendar_Week glyph — a 68px box whose stroke is the band's green. */}
            <span aria-hidden className="flex size-[68px] flex-none items-center justify-center text-[#1a932e]">
              <Icon name="calendar" size={46} />
            </span>
          </div>
          <span className="inline-flex w-fit items-center rounded-[20px] border-[0.8px] border-[#9e9e9e] bg-white px-[8px] py-px text-[10px] leading-normal tracking-[0.1px] text-black">
            {elapsedNote}
          </span>
        </div>
      </div>
    </div>
  );
}
