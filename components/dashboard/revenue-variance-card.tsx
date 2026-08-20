import { niceTicks, linear } from "@/lib/dashboard/scale";
import { ChartFigure, ChartEmpty } from "@/components/dashboard/charts/chrome";
import { OverviewPanel, OverviewPanelHeader } from "@/components/dashboard/overview-panel";

/**
 * "Revenue Variance Trend" — a transcription of Figma 46:3259.
 *
 * The design's columns are two-tone pills: a violet cap spanning the district's own ±warning
 * band, and the magenta run for everything BEYOND the band — so the pink ink on the chart is
 * literally the amount of variance the policy says to worry about. The warning thresholds
 * are drawn as a dashed rule at +warning and a dotted orange rule at −warning with the
 * design's 6px "Warning ±X%" tags, the value sits bold under each bar's tip, and the axis
 * kit is the band's #F2F4F7 / #667085 pair.
 *
 * THE GEOMETRY IS COMPUTED, NOT TRACED — the mockup freezes two sample bars; these take
 * their heights from the district's monthly variance and the band from its policy. A month
 * nobody reported draws no bar, and its label still holds the month's place on the axis.
 */

const PINK = "#f72585";
const VIOLET = "#7209b7";

const W = 640;
const H = 296;
const PLOT_L = 44;
const PLOT_R = 628;
const GRID_TOP = 18;
const GRID_BOTTOM = 240;
const BAR_W = 22;

/**
 * The magenta run's shape — square where it leaves the violet band, rounded only at its
 * far end, exactly the design's column (Figma rounds ONE pair of corners at 30px and the
 * band segment none; a both-ends pill turned the short violet cap into a circle).
 */
function roundedEnd(
  x: number,
  yTop: number,
  yBottom: number,
  w: number,
  end: "top" | "bottom",
): string {
  const r = Math.min(w / 2, Math.max(0, yBottom - yTop));
  const x2 = x + w;
  return end === "bottom"
    ? [
        `M ${x} ${yTop}`,
        `L ${x2} ${yTop}`,
        `L ${x2} ${yBottom - r}`,
        `A ${r} ${r} 0 0 1 ${x2 - r} ${yBottom}`,
        `L ${x + r} ${yBottom}`,
        `A ${r} ${r} 0 0 1 ${x} ${yBottom - r}`,
        "Z",
      ].join(" ")
    : [
        `M ${x} ${yBottom}`,
        `L ${x} ${yTop + r}`,
        `A ${r} ${r} 0 0 1 ${x + r} ${yTop}`,
        `L ${x2 - r} ${yTop}`,
        `A ${r} ${r} 0 0 1 ${x2} ${yTop + r}`,
        `L ${x2} ${yBottom}`,
        "Z",
      ].join(" ");
}

export function RevenueVarianceCard({
  title = "Revenue Variance Trend",
  subtitle = "Monthly variance from expected YTD collections",
  categories,
  points,
  warning,
  summary,
}: {
  title?: string;
  subtitle?: string;
  categories: string[];
  /** Monthly variance %, null where the month has no data. */
  points: (number | null)[];
  /** The district's own warning band, as a positive percentage. */
  warning: number;
  summary: string;
}) {
  const known = points.filter((v): v is number => v !== null);

  return (
    <OverviewPanel className="flex flex-col p-[18px]">
      <OverviewPanelHeader title={title} subtitle={subtitle} />

      {known.length === 0 ? (
        <ChartEmpty height={260}>No data for this period yet.</ChartEmpty>
      ) : (
        (() => {
          // The domain always contains the band plus air above it, so the cap never clips.
          const ticks = niceTicks(
            Math.min(...known, -warning) - 5,
            Math.max(...known, warning) + 12,
            { count: 5, zeroBased: false },
          );
          const y = linear([ticks.min, ticks.max], [GRID_BOTTOM, GRID_TOP]);
          const slot = (PLOT_R - PLOT_L) / Math.max(categories.length, 1);
          const xs = categories.map((_, i) => PLOT_L + slot * i + slot / 2);

          return (
            <ChartFigure title={title} summary={summary} className="mt-[16px] w-full">
              <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
                {/* gridlines + y labels */}
                {ticks.values.map((v) => (
                  <line
                    key={v}
                    x1={PLOT_L - 8}
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
                    x={PLOT_L - 14}
                    y={y(v) + 3.5}
                    textAnchor="end"
                    fontSize={10}
                    fill="#667085"
                  >
                    {v.toFixed(0)}%
                  </text>
                ))}

                {/* the warning band's rules — dashed above, dotted orange below */}
                <line
                  x1={PLOT_L}
                  x2={PLOT_R}
                  y1={y(warning)}
                  y2={y(warning)}
                  stroke="#667085"
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
                <line
                  x1={PLOT_L}
                  x2={PLOT_R}
                  y1={y(-warning)}
                  y2={y(-warning)}
                  stroke="#e65f2b"
                  strokeWidth={1}
                  strokeDasharray="1.5 2.5"
                />

                {/* the two-tone pills with their bold value tags */}
                {points.map((v, i) => {
                  if (v === null) return null;
                  const x = xs[i] - BAR_W / 2;
                  const capTop = y(warning);
                  const capBottom = y(-warning);
                  const beyond = v < -warning || v > warning;
                  const positive = v > warning;
                  const label = `${v < 0 ? "-" : ""}${Math.abs(v).toFixed(1)}%`;
                  const labelY = v >= 0 ? capTop - 8 : y(v) + 16;
                  return (
                    <g key={i} className="anim-fade">
                      {/* the violet band cap — always the district's own ±warning span,
                          square-cornered as drawn */}
                      <rect x={x} y={capTop} width={BAR_W} height={capBottom - capTop} fill={VIOLET} />
                      {/* the magenta excess — flush against the band, rounded at its tip */}
                      {beyond && (
                        <path
                          d={
                            positive
                              ? roundedEnd(x, y(v), capTop, BAR_W, "top")
                              : roundedEnd(x, capBottom, y(v), BAR_W, "bottom")
                          }
                          fill={PINK}
                        />
                      )}
                      <text
                        x={xs[i]}
                        y={labelY}
                        textAnchor="middle"
                        fontSize={10}
                        fontWeight={700}
                        fill="#060606"
                      >
                        {label}
                      </text>
                    </g>
                  );
                })}

                {/* the band's tags — drawn last so a full year of bars cannot bury them */}
                <text
                  x={PLOT_R}
                  y={y(warning) - 3}
                  textAnchor="end"
                  fontSize={7}
                  fill="rgba(6,6,6,0.56)"
                  letterSpacing="0.06"
                >
                  Warning +{warning.toFixed(0)}%
                </text>
                <text
                  x={PLOT_R}
                  y={y(-warning) + 8}
                  textAnchor="end"
                  fontSize={7}
                  fill="rgba(6,6,6,0.56)"
                  letterSpacing="0.06"
                >
                  Warning -{warning.toFixed(0)}%
                </text>

                {/* month labels */}
                {categories.map((c, i) => (
                  <text
                    key={`${c}-${i}`}
                    x={xs[i]}
                    y={272}
                    textAnchor="middle"
                    fontSize={10}
                    fill="#667085"
                  >
                    {c}
                  </text>
                ))}
              </svg>
            </ChartFigure>
          );
        })()
      )}
    </OverviewPanel>
  );
}
