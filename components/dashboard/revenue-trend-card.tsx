import { niceTicks, linear } from "@/lib/dashboard/scale";
import { ChartFigure, ChartEmpty } from "@/components/dashboard/charts/chrome";
import { OverviewPanel, OverviewPanelHeader } from "@/components/dashboard/overview-panel";
import { CapsuleStatStrip, type CapsuleStat } from "@/components/dashboard/revenue-shared";

/**
 * "Revenues — budget vs actual" — a transcription of Figma 46:2938.
 *
 * The design's spline chart, read off its exported assets: the actual line in Primary/500
 * teal (#038C8C) with the #F5FEF8 wash under it, the budget line in Indigo/500 navy
 * (#022859) with the #EAFAFE wash, the full-year budget as a dashed Night-Sky (#6773B0)
 * reference with hollow endpoints, dot markers on both lines, #F2F4F7 gridlines, 12px
 * #667085 labels and the "Month" caption. The legend stands at the card's top right with
 * the reference's swatch hatched, as drawn.
 *
 * THE GEOMETRY IS COMPUTED, NOT TRACED — same rule as every chart in this redesign. The
 * mockup's curves are frozen at its sample year; these take their y positions from the
 * district's series, drawn as Catmull-Rom splines to keep the design's easing, and a month
 * nobody reported draws a GAP, never a zero.
 */

export interface RevenueTrendPoint {
  value: number | null;
}

const ACTUAL = "#038C8C";
const BUDGET = "#022859";
const REFERENCE = "#6773B0";
const ACTUAL_WASH = "#F5FEF8";
const BUDGET_WASH = "#EAFAFE";

/** The plot's fixed geometry, in viewBox units — the design's own measurements. */
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

/** Each contiguous run, splined and closed down to the axis — the washes. */
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
  points: RevenueTrendPoint[],
  xs: number[],
  y: (v: number) => number,
): ({ x: number; y: number } | null)[] {
  return points.map((p, i) => (p.value === null ? null : { x: xs[i], y: y(p.value) }));
}

function LegendSwatch({ color, hatched }: { color?: string; hatched?: boolean }) {
  return (
    <span
      aria-hidden
      className="size-[9px] flex-none rounded-[2px]"
      style={
        hatched
          ? {
              backgroundImage: `repeating-linear-gradient(135deg, ${REFERENCE} 0px, ${REFERENCE} 1px, transparent 1px, transparent 3px)`,
            }
          : { background: color }
      }
    />
  );
}

export function RevenueTrendCard({
  title,
  subtitle,
  categories,
  actual,
  budget,
  /** The full-year budget — the dashed reference, constant across the plot. */
  reference,
  format,
  summary,
  stats,
}: {
  title: string;
  subtitle: string;
  categories: string[];
  actual: RevenueTrendPoint[];
  budget: RevenueTrendPoint[];
  reference: number | null;
  format: (v: number) => string;
  summary: string;
  stats: CapsuleStat[];
}) {
  const values = [...actual, ...budget]
    .map((p) => p.value)
    .filter((v): v is number => v !== null);
  if (reference !== null && reference > 0) values.push(reference);

  return (
    <OverviewPanel className="flex flex-col p-[18px]">
      {/* The legend is `flex-none` — it never gives ground — so beside a heading on a
          phone it simply printed over it. Below `sm` it drops under the header and runs as
          one wrapping row; from `sm` it is the design's stacked top-right key again. */}
      <div className="flex flex-col items-start gap-[10px] sm:flex-row sm:items-start sm:justify-between sm:gap-[12px]">
        <OverviewPanelHeader title={title} subtitle={subtitle} />
        {/* ---- legend — the design's stacked top-right key ---- */}
        <ul className="flex flex-row flex-wrap gap-x-[12px] gap-y-[4px] sm:flex-none sm:flex-col sm:gap-[4px] sm:pt-[6px]">
          <li className="flex items-center gap-[5px] text-[10px] leading-[2] tracking-[0.08px] text-[#060606]">
            <LegendSwatch color="rgba(3,140,140,0.6)" />
            Actual (YTD)
          </li>
          <li className="flex items-center gap-[5px] text-[10px] leading-[2] tracking-[0.08px] text-[#060606]">
            <LegendSwatch color="rgba(2,40,89,0.6)" />
            Budget (YTD)
          </li>
          <li className="flex items-center gap-[5px] text-[10px] leading-[2] tracking-[0.08px] text-[#060606]">
            <LegendSwatch hatched />
            Budget Full year
          </li>
        </ul>
      </div>

      {values.length === 0 ? (
        <ChartEmpty height={240}>No data for this period yet.</ChartEmpty>
      ) : (
        (() => {
          const ticks = niceTicks(0, Math.max(...values, 0), { count: 6 });
          const y = linear([ticks.min, ticks.max], [AXIS_Y, GRID_TOP]);
          const step = categories.length > 1 ? (PLOT_R - PLOT_L) / (categories.length - 1) : 0;
          const xs = categories.map((_, i) =>
            categories.length > 1 ? PLOT_L + i * step : (PLOT_L + PLOT_R) / 2,
          );

          const actualPts = toPoints(actual, xs, y);
          const budgetPts = toPoints(budget, xs, y);
          const refY = reference === null ? null : y(reference);

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

                {/* washes first — actual's pale green, then budget's pale blue over it */}
                {smoothAreas(actualPts).map((d, i) => (
                  <path key={`aw${i}`} d={d} fill={ACTUAL_WASH} className="anim-fade" />
                ))}
                {smoothAreas(budgetPts).map((d, i) => (
                  <path key={`bw${i}`} d={d} fill={BUDGET_WASH} className="anim-fade" />
                ))}

                {/* the dashed full-year reference with its hollow endpoints */}
                {refY !== null && (
                  <g className="anim-fade-late">
                    <line
                      x1={PLOT_L}
                      x2={PLOT_R}
                      y1={refY}
                      y2={refY}
                      stroke={REFERENCE}
                      strokeWidth={1.6}
                      strokeDasharray="5 4"
                    />
                    <circle cx={PLOT_L} cy={refY} r={3.4} fill="#fff" stroke={REFERENCE} strokeWidth={1.4} />
                    <circle cx={PLOT_R} cy={refY} r={3.4} fill="#fff" stroke={REFERENCE} strokeWidth={1.4} />
                  </g>
                )}

                {/* the two splines with their dot markers */}
                {[
                  { key: "budget", pts: budgetPts, color: BUDGET },
                  { key: "actual", pts: actualPts, color: ACTUAL },
                ].map((s) => (
                  <g key={s.key}>
                    <path
                      d={smoothSegments(s.pts)}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={2.4}
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
                            r={3.2}
                            fill={s.color}
                            className="anim-fade-late"
                          />
                        ),
                    )}
                  </g>
                ))}

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
        <CapsuleStatStrip items={stats} />
      </div>
    </OverviewPanel>
  );
}
