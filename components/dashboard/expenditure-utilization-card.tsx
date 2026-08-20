import { niceTicks, linear } from "@/lib/dashboard/scale";
import { ChartFigure, ChartEmpty } from "@/components/dashboard/charts/chrome";
import { OverviewPanel, OverviewPanelHeader } from "@/components/dashboard/overview-panel";

/**
 * "Budget Utilization Trend" — a transcription of Figma 55:3483, on the same chart kit as
 * the Revenue variance card: #F2F4F7 gridlines, #667085 labels, the design's magenta
 * columns rounded only at the tip, the bold value tag at each tip, and the district's OWN
 * thresholds drawn as tagged dashed rules — warning in the axis grey, critical in red.
 *
 * THE GEOMETRY IS COMPUTED, NOT TRACED. The mockup freezes two sample bars (and its copy
 * still reads "Actual against the budget expected by each month" — the revenue caption);
 * these take their heights from the district's monthly utilisation — spend plus
 * encumbrances against that month's budget — and the rules from its expenditure policy.
 * A month nobody reported draws no bar, and its label still holds the month's place.
 */

const PINK = "#f72585";

const W = 640;
const H = 296;
const PLOT_L = 44;
const PLOT_R = 628;
const GRID_TOP = 18;
const GRID_BOTTOM = 240;
const BAR_W = 22;

/** A column rounded only at its tip — the design's 30px-one-pair corner treatment. */
function roundedTop(x: number, yTop: number, yBottom: number, w: number): string {
  const r = Math.min(w / 2, Math.max(0, yBottom - yTop));
  const x2 = x + w;
  return [
    `M ${x} ${yBottom}`,
    `L ${x} ${yTop + r}`,
    `A ${r} ${r} 0 0 1 ${x + r} ${yTop}`,
    `L ${x2 - r} ${yTop}`,
    `A ${r} ${r} 0 0 1 ${x2} ${yTop + r}`,
    `L ${x2} ${yBottom}`,
    "Z",
  ].join(" ");
}

export function ExpenditureUtilizationCard({
  title = "Budget Utilization Trend",
  subtitle = "Monthly budget utilization compared to established thresholds",
  categories,
  points,
  warning,
  critical,
  summary,
}: {
  title?: string;
  subtitle?: string;
  categories: string[];
  /** Monthly utilisation %, null where the month has no data. */
  points: (number | null)[];
  /** The district's own utilisation bands, as positive percentages. */
  warning: number;
  critical: number;
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
          // The domain always contains both rules plus air above them, so the tags never clip.
          const ticks = niceTicks(0, Math.max(...known, critical) + 10, { count: 5 });
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

                {/* the policy rules — warning dashed in the axis grey, critical in red */}
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
                  y1={y(critical)}
                  y2={y(critical)}
                  stroke="#fd4438"
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />

                {/* the magenta columns with their bold value tags */}
                {points.map((v, i) => {
                  if (v === null) return null;
                  const x = xs[i] - BAR_W / 2;
                  const clamped = Math.max(v, 0);
                  const label = `${clamped.toFixed(1)}%`;
                  return (
                    <g key={i} className="anim-fade">
                      <path d={roundedTop(x, y(clamped), y(0), BAR_W)} fill={PINK} />
                      <text
                        x={xs[i]}
                        y={y(clamped) - 8}
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

                {/* the rules' tags — drawn last so a full year of bars cannot bury them */}
                <text
                  x={PLOT_R}
                  y={y(critical) - 3}
                  textAnchor="end"
                  fontSize={7}
                  fill="rgba(6,6,6,0.56)"
                  letterSpacing="0.06"
                >
                  Critical {critical.toFixed(0)}%
                </text>
                <text
                  x={PLOT_R}
                  y={y(warning) + 8}
                  textAnchor="end"
                  fontSize={7}
                  fill="rgba(6,6,6,0.56)"
                  letterSpacing="0.06"
                >
                  Warning {warning.toFixed(0)}%
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
