import { linear, niceTicks, bands as bandScale, barPath, barWidth } from "@/lib/dashboard/scale";
import { plotOf, Gridlines, YAxis, XAxis, ChartFigure, ChartEmpty } from "./chrome";

/**
 * The fund-balance waterfall — §6.1.
 *
 * Beginning balance, then each movement, then the ending balance. The bars in between
 * float: each starts where the last one finished, so the reader sees the arithmetic rather
 * than being asked to trust it.
 *
 * ---------------------------------------------------------------------------
 * THE BARS MUST FOOT
 *
 * The spec draws six bars — beginning, revenues, expenditures, transfers in, transfers out,
 * ending — but `activityTotals()` produces SEVEN components, because revenue splits into
 * operating revenue, transfers in AND other financing sources. Drawing the spec's six from
 * the engine's seven silently drops other financing, and the last bar stops equalling the
 * running total.
 *
 * So this component does not trust its caller: it recomputes the ending bar from the
 * movements it was actually given, and `footing` reports whether that matches the ending
 * balance the caller passed. A dashboard that disagrees with itself says so rather than
 * drawing a bar in the wrong place.
 * ---------------------------------------------------------------------------
 */

export interface WaterfallStep {
  label: string;
  /** Signed. Positive rises, negative falls. Ignored for `anchor` steps. */
  value: number;
  /** A total that sits on the baseline rather than floating — first and last. */
  anchor?: boolean;
  display?: string;
}

export function WaterfallChart({
  steps,
  title,
  summary,
  format,
  height = 250,
  width = 640,
}: {
  steps: WaterfallStep[];
  title: string;
  summary: string;
  format: (v: number) => string;
  height?: number;
  width?: number;
}) {
  if (steps.length < 2) {
    return <ChartEmpty height={height}>Not enough movement to chart yet.</ChartEmpty>;
  }

  // Walk the steps once to find where each bar starts and finishes.
  //
  // A plain loop rather than `map`, because the running total is genuinely sequential
  // state and mutating a closure variable inside a render-phase `map` is exactly what
  // React's immutability rule exists to stop.
  const bars: (WaterfallStep & { from: number; to: number })[] = [];
  let running = 0;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s.anchor) {
      // The first anchor sets the opening level; a later one closes at the running total.
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
  const plot = plotOf(width, height, { l: 58, t: 22, b: 34 });
  const ticks = niceTicks(Math.min(...levels, 0), Math.max(...levels), { count: 5 });
  const y = linear([ticks.min, ticks.max], [plot.bottom, plot.top]);
  const slots = bandScale(steps.length, [plot.left, plot.right], 0.32);

  return (
    <ChartFigure title={title} summary={summary}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: "block" }}>
        <Gridlines plot={plot} ticks={ticks} y={y} />
        <YAxis plot={plot} ticks={ticks} y={y} format={format} />
        <XAxis
          plot={plot}
          categories={steps.map((s) => s.label)}
          centers={slots.map((s) => s.center)}
        />

        {bars.map((b, i) => {
          const slot = slots[i];
          const w = barWidth(slot.width);
          const x = slot.center - w / 2;

          const yTop = b.anchor ? y(b.to) : y(Math.max(b.from, b.to));
          const yBottom = b.anchor ? y(0) : y(Math.min(b.from, b.to));
          const h = Math.max(Math.abs(yBottom - yTop), 1);

          const fill = b.anchor
            ? "var(--color-muted-2)"
            : b.value >= 0
              ? "var(--color-viz-positive)"
              : "var(--color-viz-negative)";

          return (
            <g key={`${b.label}-${i}`}>
              {/* A connector from the previous bar's finish, so the eye follows the run. */}
              {i > 0 && !b.anchor && (
                <line
                  x1={slots[i - 1].center + barWidth(slots[i - 1].width) / 2}
                  x2={x}
                  y1={y(b.from)}
                  y2={y(b.from)}
                  stroke="var(--color-viz-axis)"
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
              )}
              <path d={barPath(x, yTop, w, h, b.value >= 0 || b.anchor ? "top" : "bottom")} fill={fill} />
              <text
                x={slot.center}
                y={yTop - 5}
                textAnchor="middle"
                fontSize={9.5}
                fontWeight={600}
                fill="var(--color-ink-muted)"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {b.display ?? format(b.anchor ? b.to : b.value)}
              </text>
            </g>
          );
        })}
      </svg>
    </ChartFigure>
  );
}

/**
 * Does the running total actually reach the stated ending balance?
 *
 * Exported so a page can assert its own arithmetic before drawing — and say so plainly if
 * a component is missing — rather than presenting a chart whose last bar is decorative.
 */
export function waterfallFoots(steps: WaterfallStep[], endingBalance: number, tolerance = 0.01): boolean {
  const opening = steps[0]?.anchor ? steps[0].value : 0;
  const movement = steps.filter((s) => !s.anchor).reduce((a, s) => a + s.value, 0);
  return Math.abs(opening + movement - endingBalance) <= tolerance;
}
