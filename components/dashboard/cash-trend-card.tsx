import { niceTicks, linear } from "@/lib/dashboard/scale";
import { ChartFigure, ChartEmpty } from "@/components/dashboard/charts/chrome";
import { OverviewPanel, OverviewPanelHeader } from "@/components/dashboard/overview-panel";
import { CapsuleStatStrip, type CapsuleStat } from "@/components/dashboard/revenue-shared";

/**
 * "Cash Balance Trend" — a transcription of Figma 55:5283, on the same spline kit as the
 * Fund Balance trend card: the ending balance as a teal spline with dot markers over its
 * pale wash, #F2F4F7 gridlines, 12px #667085 labels with the "Month" caption, the "View
 * Cash Position Details" capsule beside the title, and the capsule stat strip — period
 * high, period low, average, volatility — at the card's floor.
 *
 * The 30-day projection survives from the old card as a dashed markerless continuation:
 * context, not a measurement, and drawn in the reference blue-grey so it can never be read
 * as reported cash. The design's mock freezes a single stroke; a month nobody reported
 * draws a GAP here, never a zero.
 */

export interface CashTrendPoint {
  value: number | null;
}

const CASH = "#038C8C";
const CASH_WASH = "#F5FEF8";
const FORECAST = "#6773B0";

/** The plot's fixed geometry, in viewBox units — the Revenue card's own measurements. */
const W = 650;
const H = 240;
const PLOT_L = 68;
const PLOT_R = 624;
const GRID_TOP = 10;
const AXIS_Y = 172;
const YLABEL_X = 40;

function smoothSegments(pts: ({ x: number; y: number } | null)[]): string {
  let d = "";
  let run: { x: number; y: number }[] = [];
  const flush = () => {
    if (run.length === 1) {
      d += ` M ${run[0].x.toFixed(2)} ${run[0].y.toFixed(2)}`;
    } else if (run.length > 1) {
      d += ` M ${run[0].x.toFixed(2)} ${run[0].y.toFixed(2)}`;
      for (let i = 0; i < run.length - 1; i++) {
        const p0 = run[Math.max(0, i - 1)];
        const p1 = run[i];
        const p2 = run[i + 1];
        const p3 = run[Math.min(run.length - 1, i + 2)];
        const c1x = p1.x + (p2.x - p0.x) / 6;
        const c1y = p1.y + (p2.y - p0.y) / 6;
        const c2x = p2.x - (p3.x - p1.x) / 6;
        const c2y = p2.y - (p3.y - p1.y) / 6;
        d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
      }
    }
    run = [];
  };
  for (const p of pts) {
    if (p === null) flush();
    else run.push(p);
  }
  flush();
  return d.trim();
}

/** Each contiguous run, splined and closed down to the axis — the wash. */
function smoothAreas(pts: ({ x: number; y: number } | null)[]): string[] {
  const out: string[] = [];
  let run: { x: number; y: number }[] = [];
  const flush = () => {
    if (run.length > 1) {
      const spline = smoothSegments(run);
      out.push(
        `M ${run[0].x.toFixed(2)} ${AXIS_Y} L ${spline.slice(2)} L ${run[run.length - 1].x.toFixed(2)} ${AXIS_Y} Z`,
      );
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

function toPoints(
  points: CashTrendPoint[],
  xs: number[],
  y: (v: number) => number,
): ({ x: number; y: number } | null)[] {
  return points.map((p, i) => (p.value === null ? null : { x: xs[i], y: y(p.value) }));
}

export function CashTrendCard({
  title = "Cash Balance Trend",
  subtitle,
  ctaLabel,
  ctaHref,
  categories,
  cash,
  /** One point past the last actual, nulls elsewhere. Omit when there is no projection. */
  forecast,
  format,
  summary,
  stats,
}: {
  title?: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  categories: string[];
  cash: CashTrendPoint[];
  forecast?: CashTrendPoint[] | null;
  format: (v: number) => string;
  summary: string;
  stats: CapsuleStat[];
}) {
  const hasForecast = (forecast?.some((p) => p.value !== null) ?? false) && forecast;
  const values = [...cash, ...(hasForecast ? forecast : [])]
    .map((p) => p.value)
    .filter((v): v is number => v !== null);

  return (
    <OverviewPanel className="flex flex-col p-[18px]">
      <div className="flex items-start justify-between gap-[12px]">
        <OverviewPanelHeader
          title={title}
          subtitle={subtitle}
          ctaLabel={ctaLabel}
          ctaHref={ctaHref}
        />
        {/* the legend earns its place only when there are two lines to tell apart */}
        {hasForecast && (
          <ul className="flex flex-none flex-col gap-[4px] pt-[6px]">
            <li className="flex items-center gap-[5px] text-[8px] leading-[2] tracking-[0.08px] text-[#060606]/[0.56]">
              <span aria-hidden className="size-[9px] flex-none rounded-[2px]" style={{ background: "rgba(3,140,140,0.6)" }} />
              Ending cash balance
            </li>
            <li className="flex items-center gap-[5px] text-[8px] leading-[2] tracking-[0.08px] text-[#060606]/[0.56]">
              <span
                aria-hidden
                className="size-[9px] flex-none rounded-[2px]"
                style={{
                  backgroundImage: `repeating-linear-gradient(135deg, ${FORECAST} 0px, ${FORECAST} 1px, transparent 1px, transparent 3px)`,
                }}
              />
              30-day projection
            </li>
          </ul>
        )}
      </div>

      {values.length === 0 ? (
        <ChartEmpty height={240}>No cash position committed for this year yet.</ChartEmpty>
      ) : (
        (() => {
          const ticks = niceTicks(Math.min(...values, 0), Math.max(...values, 0), { count: 6 });
          const y = linear([ticks.min, ticks.max], [AXIS_Y, GRID_TOP]);
          const step = categories.length > 1 ? (PLOT_R - PLOT_L) / (categories.length - 1) : 0;
          const xs = categories.map((_, i) =>
            categories.length > 1 ? PLOT_L + i * step : (PLOT_L + PLOT_R) / 2,
          );

          const cashPts = toPoints(cash, xs, y);
          const forecastPts = hasForecast ? toPoints(forecast, xs, y) : null;
          // The dashed run needs somewhere to start: prepend the last actual so the
          // projection draws as a continuation rather than a floating dot.
          if (forecastPts) {
            const lastActual = cashPts.reduce<number | null>(
              (a, p, i) => (p !== null ? i : a),
              null,
            );
            if (lastActual !== null) forecastPts[lastActual] = cashPts[lastActual];
          }

          return (
            <ChartFigure title={title} summary={summary} className="mt-[10px] w-full">
              <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
                {/* gridlines + y labels — the design's #F2F4F7 / #667085 axis kit */}
                {ticks.values.map((v) => (
                  <line
                    key={v}
                    x1={PLOT_L - 14}
                    x2={W}
                    y1={y(v)}
                    y2={y(v)}
                    stroke="#F2F4F7"
                    strokeWidth={1}
                    shapeRendering="crispEdges"
                  />
                ))}
                {ticks.values.map((v) => (
                  <text
                    key={`l${v}`}
                    x={YLABEL_X}
                    y={y(v) + 4}
                    textAnchor="middle"
                    fontSize={12}
                    fill="#667085"
                  >
                    {format(v)}
                  </text>
                ))}

                {/* the wash first, then the dashed projection, then the line and markers */}
                {smoothAreas(cashPts).map((d, i) => (
                  <path key={`w${i}`} d={d} fill={CASH_WASH} className="anim-fade" />
                ))}

                {forecastPts && (
                  <path
                    d={smoothSegments(forecastPts)}
                    fill="none"
                    stroke={FORECAST}
                    strokeWidth={1.6}
                    strokeDasharray="5 4"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    className="anim-fade-late"
                  />
                )}

                <path
                  d={smoothSegments(cashPts)}
                  fill="none"
                  stroke={CASH}
                  strokeWidth={2.4}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  pathLength={1}
                  strokeDashoffset={0}
                  className="anim-draw"
                />
                {cashPts.map(
                  (p, i) =>
                    p && (
                      <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r={3.2}
                        fill={CASH}
                        className="anim-fade-late"
                      />
                    ),
                )}

                {/* month labels + the axis caption */}
                {categories.map((c, i) => (
                  <text
                    key={`${c}-${i}`}
                    x={xs[i]}
                    y={198}
                    textAnchor="middle"
                    fontSize={12}
                    fill="#667085"
                  >
                    {c}
                  </text>
                ))}
                <text
                  x={(PLOT_L + PLOT_R) / 2}
                  y={224}
                  textAnchor="middle"
                  fontSize={12}
                  fill="#667085"
                >
                  Month
                </text>
              </svg>
            </ChartFigure>
          );
        })()
      )}

      <div className="mt-auto pt-[12px]">
        <CapsuleStatStrip items={stats} className="mx-auto w-full max-w-[460px]" />
      </div>
    </OverviewPanel>
  );
}
