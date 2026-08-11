import type { ReactNode } from "react";
import { niceTicks, linear } from "@/lib/dashboard/scale";
import { ChartFigure, ChartEmpty } from "@/components/dashboard/charts/chrome";
import {
  OverviewPanel,
  OverviewPanelHeader,
  OverviewMetricRail,
  type RailItem,
} from "@/components/dashboard/overview-panel";
import { OverviewInsightTip } from "@/components/dashboard/overview-insight-tip";

/**
 * "Fund Balance Trend" — a transcription of Figma 3:12327, with the white metric rail
 * (3:12428) and the Key insight tip (3:12493) the mockup floats over the frame reunited
 * into one card.
 *
 * The chart is the design's, read off its exported assets rather than eyeballed:
 * straight segments (NOT a spline, whatever the layer is named) at #038C8C with round
 * joins; the run under the line filled solid #F5FEF8 down to the axis rule; markers as
 * 11.5px white discs ringed #038C8C at 1.5px; gridlines and the axis rule #F2F4F7;
 * every label 12px #667085 on the design's own geometry (y labels at x46, plot from
 * x84 to x705, grid rows 61px apart).
 *
 * THE GEOMETRY IS COMPUTED, NOT TRACED — same rule as every chart in this redesign. The
 * mockup's line is frozen at its sample year; this one takes its y positions from the
 * district's series, keeps the design's grammar, and a month nobody reported draws a GAP,
 * never a zero (see LineChart for why that is load-bearing).
 */

export interface TrendPoint {
  value: number | null;
  label?: string;
}

export interface TrendSeries {
  key: string;
  label: string;
  points: TrendPoint[];
  /** Defaults: the design's teal for the first series, the file's purple for a second. */
  color?: string;
}

const SERIES_COLORS = ["#038C8C", "#6F4EC8"];

/** The plot's fixed geometry, in viewBox units — the design's own measurements. */
const W = 750;
const H = 345;
const PLOT_L = 84;
const PLOT_R = 705;
const GRID_TOP = 12;
const GRID_BOTTOM = 256;
const AXIS_Y = 291;
const YLABEL_X = 46;

function segmentedPath(pts: ({ x: number; y: number } | null)[]): string {
  let d = "";
  let pen = false;
  for (const p of pts) {
    if (p === null) {
      pen = false;
      continue;
    }
    d += `${pen ? " L" : " M"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    pen = true;
  }
  return d.trim();
}

/** Each contiguous run of the line, closed down to the axis rule — the #F5FEF8 wash. */
function areaPaths(pts: ({ x: number; y: number } | null)[]): string[] {
  const out: string[] = [];
  let run: { x: number; y: number }[] = [];
  const flush = () => {
    if (run.length > 1) {
      const d =
        `M ${run[0].x.toFixed(2)} ${AXIS_Y}` +
        run.map((p) => ` L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join("") +
        ` L ${run[run.length - 1].x.toFixed(2)} ${AXIS_Y} Z`;
      out.push(d);
    }
    run = [];
  };
  for (const p of pts) {
    if (p === null) flush();
    else run.push(p);
  }
  flush();
  return out;
}

function TrendChart({
  series,
  categories,
  title,
  summary,
  format,
}: {
  series: TrendSeries[];
  categories: string[];
  title: string;
  summary: string;
  format: (v: number) => string;
}) {
  const values = series
    .flatMap((s) => s.points.map((p) => p.value))
    .filter((v): v is number => v !== null);

  if (values.length === 0) {
    return <ChartEmpty height={280}>No data for this period yet.</ChartEmpty>;
  }

  const ticks = niceTicks(0, Math.max(...values, 0), { count: 5 });
  const y = linear([ticks.min, ticks.max], [GRID_BOTTOM, GRID_TOP]);
  const step = categories.length > 1 ? (PLOT_R - PLOT_L) / (categories.length - 1) : 0;
  const xs = categories.map((_, i) =>
    categories.length > 1 ? PLOT_L + i * step : (PLOT_L + PLOT_R) / 2,
  );

  const drawn = series.map((s, si) => ({
    ...s,
    color: s.color ?? SERIES_COLORS[si % SERIES_COLORS.length],
    pts: s.points.map((p, i) => (p.value === null ? null : { x: xs[i], y: y(p.value) })),
  }));

  return (
    <div className="flex flex-col items-center gap-[28px]">
      {/* The design's chart title — 18px Gray/700, centred over the plot. */}
      <div className="flex flex-col items-center gap-[8px]">
        <p className="whitespace-nowrap text-[18px] leading-[1.5] text-[#344054]">{title}</p>
        {/* Identity must never rest on colour-matching alone: a second series gets a key.
            The single-series card matches the mockup, whose title carries the identity. */}
        {drawn.length > 1 && (
          <ul className="flex items-center gap-[16px]">
            {drawn.map((s) => (
              <li key={s.key} className="flex items-center gap-[6px] text-[12px] text-[#667085]">
                <span
                  aria-hidden
                  className="size-[9px] rounded-full border-[1.5px] bg-white"
                  style={{ borderColor: s.color }}
                />
                {s.label}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ChartFigure title={title} summary={summary} className="w-full">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
          {/* gridlines, then the axis rule with its bare "0" — the design's own axis kit */}
          {ticks.values.map((v) => (
            <line
              key={v}
              x1={68}
              x2={W}
              y1={y(v)}
              y2={y(v)}
              stroke="#F2F4F7"
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
          ))}
          <line
            x1={68}
            x2={W}
            y1={AXIS_Y}
            y2={AXIS_Y}
            stroke="#F2F4F7"
            strokeWidth={1}
            shapeRendering="crispEdges"
          />
          {ticks.values.map((v) => (
            <text
              key={v}
              x={YLABEL_X}
              y={y(v) + 4}
              textAnchor="middle"
              fontSize={12}
              fill="#667085"
            >
              {format(v)}
            </text>
          ))}
          <text x={YLABEL_X + 14} y={AXIS_Y + 4} textAnchor="end" fontSize={12} fill="#667085">
            0
          </text>

          {/* the wash first, so neither line is dimmed by the other's fill */}
          {drawn.map(
            (s, si) =>
              si === 0 &&
              areaPaths(s.pts).map((d, i) => (
                <path key={`${s.key}-a${i}`} d={d} fill="#F5FEF8" className="anim-fade" />
              )),
          )}

          {/* pathLength=1 normalises the draw animation — one dash unit is the whole
              line, so the entrance CSS never has to measure anything. */}
          {drawn.map((s) => (
            <g key={s.key}>
              <path
                d={segmentedPath(s.pts)}
                fill="none"
                stroke={s.color}
                strokeWidth={3.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                pathLength={1}
                strokeDashoffset={0}
                className="anim-draw"
              />
              {s.pts.map(
                (p, i) =>
                  p && (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={5}
                      fill="#ffffff"
                      stroke={s.color}
                      strokeWidth={1.5}
                      className="anim-fade-late"
                    />
                  ),
              )}
            </g>
          ))}

          {/* month labels and the axis caption */}
          {categories.map((c, i) => (
            <text
              key={`${c}-${i}`}
              x={xs[i]}
              y={312}
              textAnchor="middle"
              fontSize={12}
              fill="#667085"
            >
              {c}
            </text>
          ))}
          <text
            x={(PLOT_L + PLOT_R) / 2}
            y={338}
            textAnchor="middle"
            fontSize={12}
            fill="#667085"
          >
            Month
          </text>
        </svg>
      </ChartFigure>
    </div>
  );
}

export function OverviewTrendCard({
  title,
  subtitle,
  ctaLabel,
  ctaHref,
  badge,
  chartTitle,
  categories,
  series,
  format,
  summary,
  rail,
  insight,
}: {
  title: string;
  subtitle?: string;
  ctaLabel: string;
  ctaHref: string;
  badge?: ReactNode;
  /** "All funds", or the selected fund's name — the design's centred chart heading. */
  chartTitle: string;
  categories: string[];
  series: TrendSeries[];
  format: (v: number) => string;
  /** For the figure exposed to assistive tech. */
  summary: string;
  rail: RailItem[];
  /** The sentence for the Key insight tip; null renders no tip. */
  insight?: string | null;
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
      <div className="mt-[24px] flex flex-col gap-[24px] xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1">
          <TrendChart
            series={series}
            categories={categories}
            title={chartTitle}
            summary={summary}
            format={format}
          />
        </div>
        <OverviewMetricRail items={rail} />
      </div>
      {insight && <OverviewInsightTip>{insight}</OverviewInsightTip>}
    </OverviewPanel>
  );
}
