import { niceTicks, linear } from "@/lib/dashboard/scale";
import { ChartFigure, ChartEmpty } from "@/components/dashboard/charts/chrome";
import {
  OverviewPanel,
  OverviewPanelHeader,
  PanelRungPill,
} from "@/components/dashboard/overview-panel";
import { CapsuleStatStrip, type CapsuleStat } from "@/components/dashboard/revenue-shared";
import type { StatusRung } from "@/lib/dashboard/status";

/**
 * "Fund Balance Trend" — a transcription of Figma 55:3838, on the same spline kit as the
 * Revenue trend card: the total in Indigo/500 navy over its #EAFAFE wash, the unassigned
 * reserve in Primary/500 teal over #F5FEF8, dot markers on both, #F2F4F7 gridlines, 12px
 * #667085 labels and the "Month" caption, the stacked legend top right with the reference
 * swatch hatched, the reserve's rung pill under the title, and the capsule stat strip at
 * the card's floor.
 *
 * The design's third line — "Budget Full year" — is the board's approved projection, drawn
 * as a dashed Night-Sky spline WITHOUT markers: context the two solid lines are tracking
 * against, not a third measurement. It is a real series here rather than the mockup's
 * frozen stroke, and a month nobody reported draws a GAP, never a zero.
 */

export interface TrendPoint {
  value: number | null;
}

const TOTAL = "#022859";
const UNASSIGNED = "#038C8C";
const BUDGETED = "#6773B0";
const TOTAL_WASH = "#EAFAFE";
const UNASSIGNED_WASH = "#F5FEF8";

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
  points: TrendPoint[],
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
              backgroundImage: `repeating-linear-gradient(135deg, ${BUDGETED} 0px, ${BUDGETED} 1px, transparent 1px, transparent 3px)`,
            }
          : { background: color }
      }
    />
  );
}

export function FundBalanceTrendCard({
  title = "Fund Balance Trend",
  subtitle,
  rung,
  categories,
  total,
  unassigned,
  /** The board's approved projection — dashed, markerless. Omit under a cost-centre filter. */
  budgeted,
  format,
  summary,
  stats,
}: {
  title?: string;
  subtitle: string;
  /** The reserve's rung — the pill under the title, as drawn (55:3926). */
  rung: StatusRung;
  categories: string[];
  total: TrendPoint[];
  unassigned: TrendPoint[];
  budgeted?: TrendPoint[] | null;
  format: (v: number) => string;
  summary: string;
  stats: CapsuleStat[];
}) {
  const hasBudgeted = (budgeted?.some((p) => p.value !== null) ?? false) && budgeted;
  const values = [...total, ...unassigned, ...(hasBudgeted ? budgeted : [])]
    .map((p) => p.value)
    .filter((v): v is number => v !== null);

  return (
    <OverviewPanel className="flex flex-col p-[18px]">
      {/* The legend is `flex-none` — it never gives ground — so beside a heading on a
          phone it simply printed over it. Below `sm` it drops under the header and runs as
          one wrapping row; from `sm` it is the design's stacked top-right key again. */}
      <div className="flex flex-col items-start gap-[10px] sm:flex-row sm:items-start sm:justify-between sm:gap-[12px]">
        <div className="flex flex-col items-start gap-[4px]">
          <OverviewPanelHeader title={title} subtitle={subtitle} />
          <PanelRungPill rung={rung} size="sm" />
        </div>
        {/* ---- legend — the design's stacked top-right key ---- */}
        <ul className="flex flex-row flex-wrap gap-x-[12px] gap-y-[4px] sm:flex-none sm:flex-col sm:gap-[4px] sm:pt-[6px]">
          <li className="flex items-center gap-[5px] text-[10px] leading-[2] tracking-[0.08px] text-[#060606]">
            <LegendSwatch color="rgba(2,40,89,0.6)" />
            Ending Fund Balance
          </li>
          <li className="flex items-center gap-[5px] text-[10px] leading-[2] tracking-[0.08px] text-[#060606]">
            <LegendSwatch color="rgba(3,140,140,0.6)" />
            Unassigned Fund Balance
          </li>
          {hasBudgeted && (
            <li className="flex items-center gap-[5px] text-[10px] leading-[2] tracking-[0.08px] text-[#060606]">
              <LegendSwatch hatched />
              Budgeted Ending Fund Balance
            </li>
          )}
        </ul>
      </div>

      {values.length === 0 ? (
        <ChartEmpty height={240}>No data for this period yet.</ChartEmpty>
      ) : (
        (() => {
          const ticks = niceTicks(Math.min(...values, 0), Math.max(...values, 0), { count: 6 });
          const y = linear([ticks.min, ticks.max], [AXIS_Y, GRID_TOP]);
          const step = categories.length > 1 ? (PLOT_R - PLOT_L) / (categories.length - 1) : 0;
          const xs = categories.map((_, i) =>
            categories.length > 1 ? PLOT_L + i * step : (PLOT_L + PLOT_R) / 2,
          );

          const totalPts = toPoints(total, xs, y);
          const unassignedPts = toPoints(unassigned, xs, y);
          const budgetedPts = hasBudgeted ? toPoints(budgeted, xs, y) : null;

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

                {/* washes first — the total's pale blue, the reserve's pale green over it */}
                {smoothAreas(totalPts).map((d, i) => (
                  <path key={`tw${i}`} d={d} fill={TOTAL_WASH} className="anim-fade" />
                ))}
                {smoothAreas(unassignedPts).map((d, i) => (
                  <path key={`uw${i}`} d={d} fill={UNASSIGNED_WASH} className="anim-fade" />
                ))}

                {/* the dashed budgeted spline — context, so no markers */}
                {budgetedPts && (
                  <path
                    d={smoothSegments(budgetedPts)}
                    fill="none"
                    stroke={BUDGETED}
                    strokeWidth={1.6}
                    strokeDasharray="5 4"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    className="anim-fade-late"
                  />
                )}

                {/* the two splines with their dot markers */}
                {[
                  { key: "total", pts: totalPts, color: TOTAL },
                  { key: "unassigned", pts: unassignedPts, color: UNASSIGNED },
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
