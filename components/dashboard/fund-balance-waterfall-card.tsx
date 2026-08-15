import { niceTicks, linear } from "@/lib/dashboard/scale";
import { ChartFigure, ChartEmpty } from "@/components/dashboard/charts/chrome";
import { OverviewPanel, OverviewPanelHeader } from "@/components/dashboard/overview-panel";
import type { WaterfallStep } from "@/components/dashboard/charts/waterfall-chart";

/**
 * The fund balance waterfall — a transcription of Figma 55:4088, on the redesign's chart
 * kit: #F2F4F7 gridlines, 10px #667085 labels, the design's 32px columns rounded only at
 * their leading edge (r=4), anchors in the exported #797979 grey, rises in #1A932E, falls
 * in #E65F2B, and the dashed #797979 connectors that carry each bar's finish across the gap
 * to the next bar's start.
 *
 * (The mockup's own title still reads "Budget utilization trend" — a copy-paste from the
 * Expenditure band; the caller names it what it draws.)
 *
 * THE GEOMETRY IS COMPUTED, NOT TRACED — same walk as charts/waterfall-chart.tsx: each
 * floating bar starts where the last one finished, so the reader sees the arithmetic
 * rather than being asked to trust it. `waterfallFoots` stays the caller's assertion.
 */

const POSITIVE = "#1A932E";
const NEGATIVE = "#E65F2B";
const ANCHOR = "#797979";

const W = 660;
const H = 300;
const PLOT_L = 46;
const PLOT_R = 648;
const GRID_TOP = 18;
const GRID_BOTTOM = 244;
const BAR_W = 32;

/** A column rounded only at its leading edge — top for rises and anchors, bottom for falls. */
function roundedBar(x: number, yTop: number, yBottom: number, w: number, edge: "top" | "bottom") {
  const r = Math.min(4, Math.max(0, yBottom - yTop));
  const x2 = x + w;
  if (edge === "top") {
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
  return [
    `M ${x} ${yTop}`,
    `L ${x} ${yBottom - r}`,
    `A ${r} ${r} 0 0 0 ${x + r} ${yBottom}`,
    `L ${x2 - r} ${yBottom}`,
    `A ${r} ${r} 0 0 0 ${x2} ${yBottom - r}`,
    `L ${x2} ${yTop}`,
    "Z",
  ].join(" ");
}

export function FundBalanceWaterfallCard({
  title = "Fund balance waterfall",
  subtitle,
  steps,
  format,
  summary,
  /** Printed under the chart when the movements do not add up to the ending balance. */
  footNote,
}: {
  title?: string;
  subtitle: string;
  steps: WaterfallStep[];
  format: (v: number) => string;
  summary: string;
  footNote?: string | null;
}) {
  return (
    <OverviewPanel className="flex flex-col p-[18px]">
      <OverviewPanelHeader title={title} subtitle={subtitle} />

      {steps.length < 2 ? (
        <ChartEmpty height={260}>Not enough movement to chart yet.</ChartEmpty>
      ) : (
        (() => {
          // The walk — same sequential state as charts/waterfall-chart.tsx, same licence.
          const bars: (WaterfallStep & { from: number; to: number })[] = [];
          let running = 0;
          for (let i = 0; i < steps.length; i++) {
            const s = steps[i];
            if (s.anchor) {
              const level = i === 0 ? s.value : running;
              if (i === 0) running = s.value;
              bars.push({ ...s, from: 0, to: level });
              continue;
            }
            const from = running;
            running += s.value;
            bars.push({ ...s, from, to: running });
          }

          const levels = bars.flatMap((b) => [b.from, b.to]);
          const ticks = niceTicks(Math.min(...levels, 0), Math.max(...levels), { count: 5 });
          const y = linear([ticks.min, ticks.max], [GRID_BOTTOM, GRID_TOP]);
          const slot = (PLOT_R - PLOT_L) / Math.max(steps.length, 1);
          const xs = steps.map((_, i) => PLOT_L + slot * i + slot / 2);

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
                    {format(v)}
                  </text>
                ))}

                {bars.map((b, i) => {
                  const x = xs[i] - BAR_W / 2;
                  const yTop = b.anchor ? y(Math.max(b.to, 0)) : y(Math.max(b.from, b.to));
                  const yBottom = b.anchor ? y(Math.min(0, b.to)) : y(Math.min(b.from, b.to));
                  const h = Math.max(yBottom - yTop, 1);
                  const falls = !b.anchor && b.value < 0;
                  const fill = b.anchor ? ANCHOR : falls ? NEGATIVE : POSITIVE;

                  return (
                    <g key={`${b.label}-${i}`} className="anim-fade">
                      {/* the dashed carry-over from the previous bar's finish */}
                      {i > 0 && (
                        <line
                          x1={xs[i - 1] + BAR_W / 2}
                          x2={x}
                          y1={y(b.anchor ? b.to : b.from)}
                          y2={y(b.anchor ? b.to : b.from)}
                          stroke={ANCHOR}
                          strokeWidth={1}
                          strokeDasharray="2 2"
                          shapeRendering="crispEdges"
                        />
                      )}
                      <path
                        d={roundedBar(x, yTop, yTop + h, BAR_W, falls ? "bottom" : "top")}
                        fill={fill}
                      />
                      <text
                        x={xs[i]}
                        y={yTop - 7}
                        textAnchor="middle"
                        fontSize={10}
                        fontWeight={700}
                        fill="#060606"
                      >
                        {b.display ?? format(b.anchor ? b.to : b.value)}
                      </text>
                    </g>
                  );
                })}

                {/* category labels */}
                {steps.map((s, i) => (
                  <text
                    key={`${s.label}-${i}`}
                    x={xs[i]}
                    y={274}
                    textAnchor="middle"
                    fontSize={10}
                    fill="#667085"
                  >
                    {s.label}
                  </text>
                ))}
              </svg>
            </ChartFigure>
          );
        })()
      )}

      {footNote && (
        <p className="mt-[8px] text-[10px] leading-[2] tracking-[0.1px] text-[#b76a12]">
          {footNote}
        </p>
      )}
    </OverviewPanel>
  );
}
