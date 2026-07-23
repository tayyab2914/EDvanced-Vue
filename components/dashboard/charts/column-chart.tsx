import { linear, niceTicks, bands as bandScale, barPath, barWidth } from "@/lib/dashboard/scale";
import { plotOf, Gridlines, YAxis, XAxis, ZeroLine, ThresholdLine, ChartFigure, ChartEmpty } from "./chrome";

/**
 * Vertical bars, in two shapes the spec asks for:
 *
 *   SIGNED — values either side of a zero baseline, coloured by sign.
 *            §4.2 Revenue Variance Trend, §5.2 Forecast vs Budget.
 *
 *   THRESHOLD — unsigned bars with the district's policy lines drawn across them, and the
 *            bar's fill taking the colour of the band it has reached.
 *            §5.2 Budget Utilization Trend ("bars past the warning line take the amber
 *            fill; past critical, red").
 *
 * One component rather than two because they differ only in the fill rule and whether the
 * baseline sits inside the plot. Everything else — banding, bar caps, labels — is shared.
 *
 * The thresholds are NEVER hardcoded. §5.16's whole argument is that a district declares
 * its own, and a chart that painted 80% amber for everyone would be the second copy of a
 * rule that is supposed to have exactly one.
 */

export interface Column {
  label: string;
  value: number;
  /** Pre-formatted, because the page owns formatting. See the note in line-chart.tsx. */
  display?: string;
}

export function ColumnChart({
  columns,
  title,
  summary,
  format,
  height = 220,
  width = 640,
  mode = "signed",
  thresholds = [],
  color,
  showValues = true,
}: {
  columns: Column[];
  title: string;
  summary: string;
  format: (v: number) => string;
  height?: number;
  width?: number;
  mode?: "signed" | "threshold";
  /** Ascending. The bar takes the colour of the highest band it has reached. */
  thresholds?: { at: number; label: string; color: string }[];
  /** Fill for `threshold` mode below every band. Ignored in `signed` mode. */
  color?: string;
  showValues?: boolean;
}) {
  if (columns.length === 0) {
    return <ChartEmpty height={height}>No data for this period yet.</ChartEmpty>;
  }

  const values = columns.map((c) => c.value);
  const thresholdValues = thresholds.map((t) => t.at);
  const plot = plotOf(width, height, { l: 52, t: 20 });

  const ticks = niceTicks(
    Math.min(...values, ...thresholdValues, 0),
    Math.max(...values, ...thresholdValues),
    { count: 4, zeroBased: true },
  );
  const y = linear([ticks.min, ticks.max], [plot.bottom, plot.top]);
  const slots = bandScale(columns.length, [plot.left, plot.right], 0.35);
  const zero = y(0);

  const fillOf = (v: number): string => {
    if (mode === "signed") {
      return v < 0 ? "var(--color-viz-negative)" : "var(--color-viz-positive)";
    }
    // Highest band reached wins, so a bar past critical is never merely amber.
    let fill = color ?? "var(--color-viz-budget)";
    for (const t of thresholds) if (v >= t.at) fill = t.color;
    return fill;
  };

  return (
    <ChartFigure title={title} summary={summary}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: "block" }}>
        <Gridlines plot={plot} ticks={ticks} y={y} />
        <YAxis plot={plot} ticks={ticks} y={y} format={format} />
        <XAxis
          plot={plot}
          categories={columns.map((c) => c.label)}
          centers={slots.map((s) => s.center)}
          every={columns.length > 14 ? 2 : 1}
        />

        {thresholds.map((t) => (
          <ThresholdLine key={t.label} plot={plot} y={y} at={t.at} label={t.label} color={t.color} />
        ))}

        {/* Only where the data actually crosses zero. A zero rule at the foot of an
            all-positive chart is just a second axis. */}
        {ticks.min < 0 && <ZeroLine plot={plot} y={y} />}

        {columns.map((c, i) => {
          const slot = slots[i];
          const w = barWidth(slot.width);
          const x = slot.center - w / 2;
          const top = c.value >= 0 ? y(c.value) : zero;
          const h = Math.abs(y(c.value) - zero);
          const label = c.display ?? format(c.value);

          return (
            <g key={`${c.label}-${i}`}>
              <path
                // 4px rounded data-end, square at the baseline — the end that grows is the
                // end that gets the radius.
                d={barPath(x, top, w, Math.max(h, 1), c.value >= 0 ? "top" : "bottom")}
                fill={fillOf(c.value)}
              />
              {showValues && (
                <text
                  x={slot.center}
                  y={c.value >= 0 ? top - 5 : top + h + 11}
                  textAnchor="middle"
                  fontSize={9.5}
                  fontWeight={600}
                  // Text wears a text token, never the series colour.
                  fill="var(--color-ink-muted)"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </ChartFigure>
  );
}
