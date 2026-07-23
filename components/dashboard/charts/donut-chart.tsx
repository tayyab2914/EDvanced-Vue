import { arcPath } from "@/lib/dashboard/scale";
import { Legend, ChartFigure, ChartEmpty, type LegendItem } from "./chrome";

/**
 * The composition donut — §4.2 revenue by category, §5.2 spending by object, §6.1 fund
 * balance components, §7.2 cash composition.
 *
 * Part-to-whole at a glance only, and capped at six segments. Past that, adjacent slices
 * blur and the reader is really using the legend anyway — so the caller folds the tail
 * into "Other" (lib/finance/breakdown.ts#foldTail) rather than this drawing a seventh
 * colour it does not have.
 *
 * The legend carries name, amount and share, which is also the text alternative: nobody
 * has to read an angle to get a number.
 */

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
  /** Pre-formatted amount. */
  display?: string;
}

export function DonutChart({
  slices,
  centerValue,
  centerLabel,
  title,
  summary,
  size = 190,
  legendLayout = "column",
}: {
  slices: DonutSlice[];
  centerValue: string;
  centerLabel: string;
  title: string;
  summary: string;
  size?: number;
  legendLayout?: "row" | "column";
}) {
  const positive = slices.filter((s) => s.value > 0);
  const total = positive.reduce((a, s) => a + s.value, 0);

  if (total <= 0) {
    return <ChartEmpty height={size}>Nothing to break down for this period yet.</ChartEmpty>;
  }

  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 4;
  const rInner = rOuter * 0.64;

  // A 2px surface gap between slices — the same rule as adjacent bars. Expressed as an
  // angle so it stays 2px at the outer edge regardless of the donut's size.
  const gapDeg = (2 / (2 * Math.PI * rOuter)) * 360;

  // A running angle is sequential state, so it gets a plain loop rather than a `map` with
  // a mutated closure variable — the same reason as in waterfall-chart.tsx.
  const drawn: (DonutSlice & { start: number; end: number; share: number })[] = [];
  let angle = 0;
  for (const s of positive) {
    const sweep = (s.value / total) * 360;
    drawn.push({ ...s, start: angle, end: angle + sweep, share: (s.value / total) * 100 });
    angle += sweep;
  }

  const legendItems: LegendItem[] = drawn.map((s) => ({
    label: s.label,
    color: s.color,
    value: s.display,
    meta: `${s.share.toFixed(1)}%`,
  }));

  return (
    <div className={legendLayout === "row" ? "" : "flex flex-wrap items-center gap-5"}>
      <ChartFigure title={title} summary={summary} className="flex-none">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
          {drawn.map((s) => {
            // A single slice covering the whole circle cannot carry a gap — it would be a
            // 358° arc with a visible notch for no reason.
            const single = drawn.length === 1;
            const end = single ? s.end : Math.max(s.start, s.end - gapDeg);
            return (
              <path
                key={s.label}
                d={arcPath(cx, cy, rOuter, rInner, s.start, end)}
                fill={s.color}
              />
            );
          })}
          <text
            x={cx}
            y={cy - 2}
            textAnchor="middle"
            fontSize={rOuter * 0.28}
            fontWeight={600}
            fill="var(--color-ink)"
          >
            {centerValue}
          </text>
          <text x={cx} y={cy + 15} textAnchor="middle" fontSize={10} fill="var(--color-muted-2)">
            {centerLabel}
          </text>
        </svg>
      </ChartFigure>

      <div className="min-w-[170px] flex-1">
        <Legend items={legendItems} layout={legendLayout} />
      </div>
    </div>
  );
}
