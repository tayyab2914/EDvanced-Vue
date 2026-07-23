import { arcPath } from "@/lib/dashboard/scale";
import { ChartFigure, ChartEmpty } from "./chrome";
import { RUNG_MARK } from "@/components/dashboard/status-badge";
import type { StatusBand, StatusRung } from "@/lib/dashboard/status";

/**
 * The days-cash gauge — §3.2c on the Executive dashboard.
 *
 * A semicircle whose coloured bands come from the DISTRICT'S OWN thresholds, not from the
 * constants the reference screenshot happens to show. The reference prints "0 · 15 · 30 ·
 * 45 · 60+" because that district's policy is 45/30; a district on 90/60 must see its own
 * scale, or the needle sits in a green band its own alert calls critical.
 *
 * Reads a `StatusBand[]` from lib/dashboard/status.ts, which is derived from the same
 * thresholds the badge and the alert read — so all three agree by construction.
 */

export function Gauge({
  value,
  bands,
  rung,
  title,
  summary,
  unit = "",
  size = 190,
  /** The open end of the scale — the gauge cannot draw "and above". */
  max,
}: {
  value: number | null;
  /** Worst-first, as `bands()` returns them. */
  bands: StatusBand[];
  rung: StatusRung;
  title: string;
  summary: string;
  unit?: string;
  size?: number;
  max?: number;
}) {
  if (value === null || bands.length === 0) {
    return <ChartEmpty height={size * 0.72}>Not enough data to work this out yet.</ChartEmpty>;
  }

  // The scale's top: the last band's lower bound plus a third again, so "Strong" has room
  // to be a band rather than a hairline at the end of the arc.
  const lastFrom = bands[bands.length - 1].from ?? 0;
  const scaleMax = max ?? Math.max(lastFrom * 1.35, value * 1.1, 1);

  const cx = size / 2;
  const cy = size * 0.62;
  const rOuter = size / 2 - 6;
  const rInner = rOuter * 0.68;

  // A semicircle: -90° (9 o'clock) through +90° (3 o'clock), with 0 at 12.
  const toAngle = (v: number) => -90 + (Math.max(0, Math.min(v, scaleMax)) / scaleMax) * 180;

  const ticks = bands
    .map((b) => b.from)
    .filter((v): v is number => v !== null)
    .concat(0, scaleMax);
  const unique = [...new Set(ticks)].sort((a, b) => a - b);

  const needle = toAngle(value);
  const needleRad = ((needle - 90) * Math.PI) / 180;
  const needleLen = rOuter - 6;

  return (
    <ChartFigure title={title} summary={summary}>
      <svg
        width="100%"
        viewBox={`0 0 ${size} ${size * 0.78}`}
        style={{ display: "block", maxWidth: size * 1.4 }}
      >
        {bands.map((b, i) => {
          const from = b.from ?? 0;
          const to = b.to ?? scaleMax;
          if (to <= from) return null;
          const start = toAngle(from);
          // 2px of surface between segments, as everywhere else.
          const end = toAngle(to) - (i < bands.length - 1 ? 1.4 : 0);
          return (
            <path
              key={b.rung}
              d={arcPath(cx, cy, rOuter, rInner, start, Math.max(start, end))}
              fill={RUNG_MARK[b.rung]}
            />
          );
        })}

        {unique.map((v) => {
          const a = ((toAngle(v) - 90) * Math.PI) / 180;
          const r = rOuter + 9;
          return (
            <text
              key={v}
              x={cx + r * Math.cos(a)}
              y={cy + r * Math.sin(a) + 3}
              textAnchor="middle"
              fontSize={9}
              fill="var(--color-viz-label)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {Math.round(v)}
            </text>
          );
        })}

        <line
          x1={cx}
          y1={cy}
          x2={cx + needleLen * Math.cos(needleRad)}
          y2={cy + needleLen * Math.sin(needleRad)}
          stroke="var(--color-ink)"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r={5} fill="var(--color-ink)" />

        <text
          x={cx}
          y={cy - rInner * 0.42}
          textAnchor="middle"
          fontSize={size * 0.17}
          fontWeight={600}
          fill="var(--color-ink)"
        >
          {Math.round(value)}
        </text>
        <text x={cx} y={cy - rInner * 0.42 + 15} textAnchor="middle" fontSize={9.5} fill="var(--color-muted-2)">
          {unit}
        </text>
      </svg>
    </ChartFigure>
  );
}
