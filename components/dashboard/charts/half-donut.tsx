import { arcPath } from "@/lib/dashboard/scale";
import { Legend, ChartFigure, ChartEmpty, type LegendItem } from "./chrome";

/**
 * The progress semicircle — "$9.8M of $12.4M · 79%".
 *
 * A donut cut in half, and the difference is not decoration. The full donut (donut-chart.tsx)
 * answers "what is this made of", and every slice on it is a peer. This one answers "how far
 * through are we", which has a direction: the arc fills from the left and the reader's
 * question is how much of it is coloured. The open bottom is where the three figures that
 * answer it go — the amount, what it is out of, and the percentage — so nobody has to read an
 * angle to get a number.
 *
 * Not the `Gauge`, either, which looks similar and means something else entirely: that one
 * plots a value against the district's POLICY BANDS and puts a needle on it, so its colours
 * are judgements. There is no policy here. A revenue budget 79% collected in month nine is
 * neither good nor bad on its own, and colouring it green or amber would invent a threshold
 * the district never set.
 */

export interface ArcSegment {
  label: string;
  value: number;
  color: string;
  /** Pre-formatted amount. */
  display?: string;
}

export function HalfDonut({
  segments,
  centerValue,
  centerNote,
  centerPercent,
  title,
  summary,
  size = 230,
  shareOf,
  legendLayout = "column",
}: {
  segments: ArcSegment[];
  /** The headline figure inside the arc — "$9.8M". */
  centerValue: string;
  /** What it is out of, under the headline — "of $12.4M". */
  centerNote?: string;
  /** The share, under that — "79%". */
  centerPercent?: string;
  title: string;
  summary: string;
  /** The DIAMETER of the arc. The drawn box is roughly half this tall, plus the figures. */
  size?: number;
  /**
   * The denominator for the legend's percentages, when it is not the sum of the segments.
   * Same reasoning as the donut's: a district that has collected MORE than it budgeted has
   * no remaining segment, and the legend must still be able to say 104%.
   */
  shareOf?: number;
  legendLayout?: "row" | "column";
}) {
  const positive = segments.filter((s) => s.value > 0);
  const total = positive.reduce((a, s) => a + s.value, 0);

  if (total <= 0) {
    return <ChartEmpty height={size * 0.62}>Nothing to measure against yet.</ChartEmpty>;
  }

  const denominator = shareOf && shareOf > 0 ? shareOf : total;

  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 4;
  const rInner = rOuter * 0.66;

  // The same 2px surface gap between segments as everywhere else, expressed as an angle so
  // it stays 2px at the outer edge whatever the widget's size.
  const gapDeg = (2 / (2 * Math.PI * rOuter)) * 360;

  // A running angle is sequential state, so it gets a plain loop rather than a `map` with a
  // mutated closure variable — the same reason as in donut-chart.tsx.
  const drawn: (ArcSegment & { start: number; end: number; share: number })[] = [];
  // -90° is 9 o'clock, and `arcPath` puts 0 at 12, so the arc runs left → right over 180°.
  let angle = -90;
  for (const s of positive) {
    const sweep = (s.value / total) * 180;
    drawn.push({ ...s, start: angle, end: angle + sweep, share: (s.value / denominator) * 100 });
    angle += sweep;
  }

  const legendItems: LegendItem[] = drawn.map((s) => ({
    label: s.label,
    color: s.color,
    value: s.display,
    meta: `${s.share.toFixed(1)}%`,
  }));

  /**
   * The box. Half the circle, plus room under the centre line for the figures.
   *
   * `cy` is the circle's centre, which on a semicircle is its BASELINE — so the arc occupies
   * `0 … cy` and everything below it is the caption block. 46px holds three lines at the
   * sizes set below; the percentage is the last of them and sits clear of the arc's ends.
   */
  const boxHeight = cy + 46;

  return (
    <div className={legendLayout === "row" ? "" : "flex flex-wrap items-center gap-5"}>
      <ChartFigure title={title} summary={summary} className="flex-none">
        <svg
          width={size}
          height={boxHeight}
          viewBox={`0 0 ${size} ${boxHeight}`}
          style={{ display: "block" }}
        >
          {drawn.map((s, i) => {
            /**
             * The gap goes BEFORE the next segment, so the last one never gets one.
             *
             * Unlike the donut, where the final slice's neighbour is the first slice and the
             * gap between them is real, this arc simply ends. Trimming its tail would stop
             * the fill a degree short of 3 o'clock — so a district that had collected every
             * dollar of its revenue budget would see an arc that visibly did not close.
             */
            const last = i === drawn.length - 1;
            const end = last ? s.end : Math.max(s.start, s.end - gapDeg);
            return (
              <path key={s.label} d={arcPath(cx, cy, rOuter, rInner, s.start, end)} fill={s.color} />
            );
          })}

          <text
            x={cx}
            y={cy - 8}
            textAnchor="middle"
            fontSize={rOuter * 0.3}
            fontWeight={600}
            fill="var(--color-ink)"
          >
            {centerValue}
          </text>
          {centerNote && (
            <text x={cx} y={cy + 12} textAnchor="middle" fontSize={11} fill="var(--color-muted-2)">
              {centerNote}
            </text>
          )}
          {centerPercent && (
            <text
              x={cx}
              y={cy + 34}
              textAnchor="middle"
              fontSize={15}
              fontWeight={600}
              fill="var(--color-ink)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {centerPercent}
            </text>
          )}
        </svg>
      </ChartFigure>

      <div className="min-w-[170px] flex-1">
        <Legend items={legendItems} layout={legendLayout} />
      </div>
    </div>
  );
}
