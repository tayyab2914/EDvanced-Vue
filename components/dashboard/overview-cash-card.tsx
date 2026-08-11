import type { ReactNode } from "react";
import { CountUp } from "@/components/count-up";
import { ChartFigure, ChartEmpty } from "@/components/dashboard/charts/chrome";
import type { StatusBand, StatusRung } from "@/lib/dashboard/status";
import {
  OverviewPanel,
  OverviewPanelHeader,
  OverviewMetricRail,
  OverviewInfoStrip,
  PanelRungPill,
  type RailItem,
  type StripItem,
} from "@/components/dashboard/overview-panel";

/**
 * "Cash position" — a transcription of Figma 3:12343, reuniting the frame with its white
 * metric rail (3:12462) and the five-figure cash flow strip (3:12495).
 *
 * The gauge is redrawn from the design's exported arcs rather than shipped as their
 * pictures: the track is a full semicircle of black at 8%; the segments are #EE201C,
 * #E65F2B and #1A932E pill-ended arcs; the tick ring is a run of hairlines in the frame's
 * own #060606; the needle is a 2px rule from the pivot with its 10.7px disc AT THE TIP,
 * which is the design's own odd, correct choice — at 0 days the disc sits exactly on the
 * scale's zero, which is where the eye should land.
 *
 * THE BANDS COME FROM THE DISTRICT'S OWN THRESHOLDS, not from the mockup's frozen
 * geometry. The design hand-places its 45 and 60 marks (its red span works out to a
 * different scale than its green one); this gauge maps value → angle linearly, so the
 * needle, the bands and the labels can never disagree with the badge and the alert that
 * read the same thresholds — the same rule the original Gauge component enforces.
 */

/** The design's segment fills. Acceptable falls back to the app ladder's mark step —
 *  this scale's bands (no target) never produce one, but the type allows it. */
const GAUGE_FILL: Record<StatusRung, string> = {
  "Action Required": "#EE201C",
  Monitor: "#E65F2B",
  Acceptable: "var(--color-acceptable-mark)",
  Strong: "#1A932E",
  "N/A": "rgba(0,0,0,0.08)",
};

const RAD = Math.PI / 180;

/** viewBox geometry — scaled off the mockup's 614.5px outer arc. */
const W = 720;
const H = 372;
const CX = 360;
const CY = 356;
const R = 296; // band centreline
const BAND = 25; // band thickness
const CAP_DEG = (BAND / 2 / R) / RAD; // what a round cap adds past the arc's end

/** t runs 0 → 180 from the scale's zero (left) clockwise over the top. */
function pt(t: number, r: number) {
  return `${(CX - r * Math.cos(t * RAD)).toFixed(2)} ${(CY - r * Math.sin(t * RAD)).toFixed(2)}`;
}

function arc(a0: number, a1: number, r: number) {
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${pt(a0, r)} A ${r} ${r} 0 ${large} 1 ${pt(a1, r)}`;
}

export function CashReserveGauge({
  value,
  bands,
  rung,
  title,
  summary,
  max,
}: {
  value: number | null;
  /** Worst-first, as `bands()` returns them — derived from the district's thresholds. */
  bands: StatusBand[];
  rung: StatusRung;
  title: string;
  summary: string;
  /** The open end of the scale. Defaults to 4/3 of the best band's floor — 60 days → 80. */
  max?: number;
}) {
  if (value === null || bands.length === 0) {
    return <ChartEmpty height={260}>Not enough data to work this out yet.</ChartEmpty>;
  }

  const lastFrom = bands[bands.length - 1].from ?? 0;
  const scaleMax = max ?? Math.max(Math.ceil((lastFrom * 4) / 3 / 5) * 5, Math.ceil(value * 1.1), 1);
  const theta = (v: number) => (Math.max(0, Math.min(v, scaleMax)) / scaleMax) * 180;

  const labels = [
    ...new Set(
      bands
        .map((b) => b.from)
        .filter((v): v is number => v !== null)
        .concat(0, scaleMax),
    ),
  ].sort((a, b) => a - b);

  const needleT = theta(value);
  const tipX = CX - R * Math.cos(needleT * RAD);
  const tipY = CY - R * Math.sin(needleT * RAD);

  // The tick ring — hairlines every ~4.6°, running a few degrees past both ends the way
  // the design's ring does.
  const ticks = Array.from({ length: 43 }, (_, i) => -6 + i * (192 / 42));

  return (
    <ChartFigure title={title} summary={summary} className="w-full">
      <div className="relative mx-auto w-full max-w-[700px]">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
          {ticks.map((t) => (
            <line
              key={t}
              x1={CX - (R + 20) * Math.cos(t * RAD)}
              y1={CY - (R + 20) * Math.sin(t * RAD)}
              x2={CX - (R + 36) * Math.cos(t * RAD)}
              y2={CY - (R + 36) * Math.sin(t * RAD)}
              stroke="#060606"
              strokeOpacity={0.45}
              strokeWidth={1.2}
            />
          ))}

          {/* the 8% black track, full span, pill ends */}
          <path
            d={arc(CAP_DEG, 180 - CAP_DEG, R)}
            fill="none"
            stroke="black"
            strokeOpacity={0.08}
            strokeWidth={BAND}
            strokeLinecap="round"
          />

          {/* the district's bands. 0.8° of surface between neighbours, on top of the cap
              inset, so segments read as separate pills the way the mockup's do. */}
          {bands.map((b, i) => {
            const from = theta(b.from ?? 0) + CAP_DEG + (i > 0 ? 0.8 : 0);
            const to = theta(b.to ?? scaleMax) - CAP_DEG - (i < bands.length - 1 ? 0.8 : 0);
            if (to <= from) return null;
            return (
              <path
                key={b.rung}
                d={arc(from, to, R)}
                fill="none"
                stroke={GAUGE_FILL[b.rung]}
                strokeWidth={BAND}
                strokeLinecap="round"
              />
            );
          })}

          {/* scale labels, set tangentially outside the tick ring */}
          {labels.map((v) => {
            const t = theta(v);
            const x = CX - (R + 48) * Math.cos(t * RAD);
            const y = CY - (R + 48) * Math.sin(t * RAD);
            // Tangential, except the scale's top — the design sets its "80" upright while
            // its "0" stands on end. Copying the inconsistency is the point.
            const rotate = v === scaleMax ? 0 : t - 90;
            return (
              <text
                key={v}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={12}
                letterSpacing="0.12"
                fill="#060606"
                transform={rotate === 0 ? undefined : `rotate(${rotate} ${x} ${y})`}
              >
                {Math.round(v)}
              </text>
            );
          })}

          {/* the needle — pivot to tip, disc at the tip. On first view it sweeps in from
              the scale's zero: drawn at its true angle, wound back by --sweep until the
              card's reveal releases it (see the entrance-animations block in globals.css). */}
          <g
            className="anim-needle"
            style={{
              transformOrigin: `${CX}px ${CY}px`,
              transformBox: "view-box",
              ["--sweep" as string]: `${-needleT}deg`,
            }}
          >
            <line x1={CX} y1={CY} x2={tipX} y2={tipY} stroke="#060606" strokeWidth={2} />
            <circle cx={tipX} cy={tipY} r={5.33} fill="#060606" />
          </g>
        </svg>

        {/* The centre cluster — badge over the headline over its caption, standing well up
            inside the arc (the design sets the headline ~88px above the pivot line, not on
            it). Positioned as a fraction of the box so it scales with the gauge. */}
        <div className="absolute inset-x-0 bottom-[18%] flex flex-col items-center gap-[8px]">
          <PanelRungPill rung={rung} size="sm" />
          <p className="whitespace-nowrap text-[28px] leading-[normal] tracking-[0.28px] text-[#060606] [font-variant-numeric:proportional-nums]">
            <CountUp value={`${Math.round(value)} Days of Cash Reserve`} />
          </p>
          <p className="text-[14px] leading-[normal] tracking-[0.14px] text-[#9a9a9a]">
            Cash Reserve
          </p>
        </div>
      </div>
    </ChartFigure>
  );
}

export function OverviewCashCard({
  title,
  subtitle,
  ctaLabel,
  ctaHref,
  badge,
  gauge,
  rail,
  strip,
}: {
  title: string;
  subtitle?: string;
  ctaLabel: string;
  ctaHref: string;
  badge?: ReactNode;
  gauge: {
    value: number | null;
    bands: StatusBand[];
    rung: StatusRung;
    summary: string;
    max?: number;
  };
  rail: RailItem[];
  strip: StripItem[];
}) {
  return (
    <OverviewPanel>
      <OverviewPanelHeader
        title={title}
        subtitle={subtitle}
        ctaLabel={ctaLabel}
        ctaHref={ctaHref}
        badge={badge}
      />
      <div className="mt-[24px] flex flex-col gap-[24px] xl:flex-row xl:items-center">
        <div className="min-w-0 flex-1">
          <CashReserveGauge
            value={gauge.value}
            bands={gauge.bands}
            rung={gauge.rung}
            title="Days cash on hand"
            summary={gauge.summary}
            max={gauge.max}
          />
        </div>
        <OverviewMetricRail items={rail} />
      </div>
      <div className="mt-[24px]">
        <OverviewInfoStrip items={strip} />
      </div>
    </OverviewPanel>
  );
}
