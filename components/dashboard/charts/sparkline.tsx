import { linePath, linear } from "@/lib/dashboard/scale";

/**
 * A twelve-point trend inside a table cell — §3.2a's Financial Health Summary.
 *
 * No axes, no legend, no frame. A sparkline's job is direction, not value; the row it sits
 * in already carries the number. The last point is marked so the eye lands on "now".
 *
 * NOT zero-based, deliberately, and this is the one place that is right: a reserve
 * percentage hovering between 4.1% and 4.4% drawn on a 0–5 axis is a flat line, and the
 * whole point of the cell is to show whether it is drifting.
 */
export function Sparkline({
  values,
  width = 76,
  height = 24,
  color = "var(--color-viz-budget)",
  /** Colours the end dot by outcome where the trend has a direction that matters. */
  endColor,
  label,
}: {
  values: (number | null)[];
  width?: number;
  height?: number;
  color?: string;
  endColor?: string;
  label?: string;
}) {
  const real = values.filter((v): v is number => v !== null);
  if (real.length < 2) {
    return (
      <span className="inline-block text-[11px] text-muted-2" style={{ width }} aria-hidden>
        —
      </span>
    );
  }

  const min = Math.min(...real);
  const max = Math.max(...real);
  const pad = 3;
  // A flat series would divide by zero; give it a centred line instead of a crash.
  const span = max - min || Math.abs(max) || 1;
  const y = linear([min - span * 0.1, max + span * 0.1], [height - pad, pad]);
  const step = (width - pad * 2) / (values.length - 1);

  const pts = values.map((v, i) => (v === null ? null : { x: pad + i * step, y: y(v) }));
  const drawn = pts.filter((p): p is { x: number; y: number } => p !== null);
  const last = drawn[drawn.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label ?? "Trend over the last periods"}
      style={{ display: "inline-block", verticalAlign: "middle" }}
    >
      <path
        d={linePath(pts)}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {last && <circle cx={last.x} cy={last.y} r={2.5} fill={endColor ?? color} />}
    </svg>
  );
}
