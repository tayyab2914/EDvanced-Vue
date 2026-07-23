import { linePath, linear, niceTicks, bands as bandScale } from "@/lib/dashboard/scale";
import { plotOf, Gridlines, YAxis, XAxis, ThresholdLine, Legend, ChartFigure, ChartEmpty, type LegendItem } from "./chrome";

/**
 * The multi-series line chart — the workhorse of these dashboards.
 *
 * Serves §3.2b (fund balance trend), §4.2 and §5.2 (budget vs actual, three series with a
 * flat full-year reference), §6.1 (fund balance by month), §6.2.4 (reserve % over four
 * years drawn across policy bands), and §7.2 (cash with a dashed forward forecast).
 *
 * ---------------------------------------------------------------------------
 * THE NUMBER TYPE, WHICH IS LOAD-BEARING
 *
 * `value` is a plain number because it becomes a pixel coordinate, and `label` is a
 * pre-formatted string because it becomes text a district reads. That split is deliberate:
 * every figure in this product is a Prisma.Decimal, and the moment a component formats one
 * itself it does so with float arithmetic and a nine-figure total quietly loses cents
 * against the CSV export of the same number. Charts get geometry; the page gets the
 * formatting.
 * ---------------------------------------------------------------------------
 *
 * A Server Component with no state, so it renders into the PDF export as readily as into
 * the browser. Interactivity (range toggles) wraps it from outside; the SVG never moves.
 */

export interface LinePoint {
  /** Null draws a GAP, not a zero — a month nobody reported is not a month of no money. */
  value: number | null;
  label?: string;
}

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  points: LinePoint[];
  /** A projection or a reference, never an actual. */
  dashed?: boolean;
  /** Draw a dot at each point. Off for reference lines, which are context, not data. */
  markers?: boolean;
  /** Print the last point's label at the end of the line. */
  labelLast?: boolean;
}

export function LineChart({
  series,
  categories,
  title,
  summary,
  format,
  height = 240,
  width = 640,
  zeroBased = true,
  thresholds = [],
  legend = true,
  everyNthLabel,
}: {
  series: LineSeries[];
  categories: string[];
  title: string;
  summary: string;
  /** Formats an axis tick. The page owns formatting; see the note above. */
  format: (v: number) => string;
  height?: number;
  width?: number;
  zeroBased?: boolean;
  thresholds?: { at: number; label: string; color?: string }[];
  legend?: boolean;
  everyNthLabel?: number;
}) {
  const values = series.flatMap((s) => s.points.map((p) => p.value)).filter((v): v is number => v !== null);
  const thresholdValues = thresholds.map((t) => t.at);

  if (values.length === 0) {
    return <ChartEmpty height={height}>No data for this period yet.</ChartEmpty>;
  }

  const plot = plotOf(width, height, { l: 58 });
  const ticks = niceTicks(
    Math.min(...values, ...thresholdValues),
    Math.max(...values, ...thresholdValues),
    { count: 5, zeroBased },
  );
  const y = linear([ticks.min, ticks.max], [plot.bottom, plot.top]);

  // A line chart's points sit ON the category, not in a slot of their own — so the band
  // centres are the x positions, with no inset.
  const slots = bandScale(categories.length, [plot.left, plot.right], 0);
  const centers = slots.map((s) => s.center);

  // Twelve month labels fit; more do not, and overlapping axis text is worse than fewer
  // labels — the table beneath carries the rest.
  const every = everyNthLabel ?? (categories.length > 14 ? Math.ceil(categories.length / 12) : 1);

  const legendItems: LegendItem[] = series.map((s) => ({
    label: s.label,
    color: s.color,
    dashed: s.dashed,
  }));

  return (
    <div>
      {legend && series.length > 1 && (
        <div className="mb-2.5">
          <Legend items={legendItems} />
        </div>
      )}
      <ChartFigure title={title} summary={summary}>
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: "block" }}>
          <Gridlines plot={plot} ticks={ticks} y={y} />
          <YAxis plot={plot} ticks={ticks} y={y} format={format} />
          <XAxis plot={plot} categories={categories} centers={centers} every={every} />

          {thresholds.map((t) => (
            <ThresholdLine key={t.label} plot={plot} y={y} at={t.at} label={t.label} color={t.color} />
          ))}

          {series.map((s) => {
            const pts = s.points.map((p, i) =>
              p.value === null ? null : { x: centers[i], y: y(p.value) },
            );
            const drawn = pts.filter((p): p is { x: number; y: number } => p !== null);
            const last = drawn[drawn.length - 1];
            const lastPoint = [...s.points].reverse().find((p) => p.value !== null);

            return (
              <g key={s.key}>
                <path
                  d={linePath(pts)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray={s.dashed ? "5 4" : undefined}
                />
                {s.markers !== false &&
                  drawn.map((p, i) => (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={4}
                      fill={s.color}
                      // A 2px ring in the surface colour so a marker stays legible where
                      // it crosses another line. Never a border to separate marks.
                      stroke="#ffffff"
                      strokeWidth={2}
                    />
                  ))}
                {/* Label the END only. A value on every point is chaos and goes unread —
                    the axis and the table beneath carry the rest. */}
                {s.labelLast && last && lastPoint?.label && (
                  <text
                    x={Math.min(last.x + 8, width - 4)}
                    y={last.y + 3.5}
                    textAnchor={last.x + 8 > width - 40 ? "end" : "start"}
                    fontSize={10.5}
                    fontWeight={600}
                    fill="var(--color-ink-muted)"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {lastPoint.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </ChartFigure>
    </div>
  );
}
