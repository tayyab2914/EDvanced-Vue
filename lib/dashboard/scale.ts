/**
 * Scales and axis ticks for the hand-rolled SVG charts.
 *
 * There is no charting dependency in this product and this module is most of the reason
 * that is affordable: the arithmetic a chart library is really bought for is a nice-number
 * axis and a linear map, and both are about forty lines.
 *
 * Pure and client-safe, so the same scale computes on the server (which is where the
 * charts render, because they must also survive a print to PDF) and in a client wrapper
 * that redraws on a range toggle.
 */

// ===================== nice axis ticks =====================

export interface Ticks {
  /** The rounded domain the axis actually spans — usually wider than the data. */
  min: number;
  max: number;
  step: number;
  values: number[];
}

/**
 * Rounds a domain out to human numbers.
 *
 * An axis running 0 · 4,317,882 · 8,635,764 is arithmetically correct and unreadable. The
 * steps come from {1, 2, 2.5, 5, 10} × a power of ten, which is the set people actually
 * count in, and the domain is widened (never narrowed) so no data point falls outside it.
 *
 * `zeroBased` is on by default because almost every figure on these dashboards is money
 * or a percentage of a budget, and a bar chart whose baseline is not zero overstates
 * every difference on it. Turn it off only for a series that genuinely lives away from
 * zero — a reserve percentage hovering around 4%, say, where a 0–5 axis would flatten the
 * whole story into the top inch.
 */
export function niceTicks(
  dataMin: number,
  dataMax: number,
  opts: { count?: number; zeroBased?: boolean } = {},
): Ticks {
  const count = Math.max(2, opts.count ?? 5);
  const zeroBased = opts.zeroBased ?? true;

  let lo = Math.min(dataMin, dataMax);
  let hi = Math.max(dataMin, dataMax);

  if (zeroBased) {
    lo = Math.min(0, lo);
    hi = Math.max(0, hi);
  }

  // A flat series still needs an axis. Give it one unit of room either side rather than a
  // zero-height plot that divides by zero downstream.
  if (lo === hi) {
    if (lo === 0) return { min: 0, max: 1, step: 1, values: [0, 1] };
    const pad = Math.abs(lo) * 0.5;
    lo -= pad;
    hi += pad;
  }

  const step = niceStep((hi - lo) / count);
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;

  const values: number[] = [];
  // Accumulate by multiplication, not repeated addition: adding 0.1 eleven times lands on
  // 1.0000000000000002 and prints an axis tick to sixteen decimal places.
  const n = Math.round((max - min) / step);
  for (let i = 0; i <= n; i++) values.push(round(min + i * step));

  return { min, max, step, values };
}

function niceStep(raw: number): number {
  if (raw <= 0 || !Number.isFinite(raw)) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const normalised = raw / magnitude;
  const nice = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : normalised <= 5 ? 5 : 10;
  return nice * magnitude;
}

/** Kills floating-point dust without rounding away a legitimately small step. */
function round(v: number): number {
  return Math.abs(v) < 1e-10 ? 0 : Number(v.toPrecision(12));
}

// ===================== linear scale =====================

export interface LinearScale {
  (value: number): number;
  domain: [number, number];
  range: [number, number];
}

/**
 * Maps a value onto a pixel position.
 *
 * For a y-axis, pass the range inverted — `linear([0, max], [plotBottom, plotTop])` —
 * because SVG's y grows downward and the chart's does not.
 */
export function linear(domain: [number, number], range: [number, number]): LinearScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;

  const fn = ((value: number) => {
    if (span === 0) return r0;
    const t = (value - d0) / span;
    return r0 + t * (r1 - r0);
  }) as LinearScale;

  fn.domain = domain;
  fn.range = range;
  return fn;
}

// ===================== band scale =====================

export interface Band {
  /** Left edge of the slot. */
  start: number;
  /** Slot width, gaps included. */
  width: number;
  /** Centre of the slot — where a single mark or a tick label sits. */
  center: number;
}

/**
 * Evenly divides an axis into one slot per category.
 *
 * `inset` is the share of each slot left as air. The mark spec caps a bar at 24px and says
 * to let the leftover be air rather than filling the slot, so this defaults generously.
 */
export function bands(count: number, range: [number, number], inset = 0.3): Band[] {
  const [r0, r1] = range;
  if (count <= 0) return [];
  const slot = (r1 - r0) / count;
  const pad = (slot * inset) / 2;

  return Array.from({ length: count }, (_, i) => {
    const start = r0 + slot * i + pad;
    const width = slot - pad * 2;
    return { start, width, center: start + width / 2 };
  });
}

/** The mark spec's ceiling. A bar in a wide slot stays thin and centred. */
export const MAX_BAR = 24;

export function barWidth(slotWidth: number, seriesCount = 1): number {
  return Math.min(MAX_BAR, slotWidth / seriesCount);
}

// ===================== paths =====================

/**
 * A polyline through the points, with gaps where a period has no figure.
 *
 * The gap matters. A district that never uploaded September should see the line stop and
 * restart, not a straight segment drawn confidently from August to October across a month
 * nobody reported. Interpolating over missing data is inventing it.
 */
export function linePath(points: ({ x: number; y: number } | null)[]): string {
  let d = "";
  let pen = false;
  for (const p of points) {
    if (!p) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${p.x.toFixed(2)} ${p.y.toFixed(2)} `;
    pen = true;
  }
  return d.trim();
}

/**
 * A rectangle with rounded ends on the value side only.
 *
 * The mark spec: 4px rounded data-end, square at the baseline. A fully rounded bar looks
 * like it floats; a fully square one looks unfinished. `side` names which edge is the
 * data end.
 */
export function barPath(
  x: number,
  y: number,
  w: number,
  h: number,
  side: "top" | "bottom" | "left" | "right",
  r = 4,
): string {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  if (radius === 0 || h <= 0 || w <= 0) {
    return `M${x} ${y}h${w}v${h}h${-w}Z`;
  }

  switch (side) {
    case "top":
      return `M${x} ${y + h}V${y + radius}a${radius} ${radius} 0 0 1 ${radius} ${-radius}h${w - radius * 2}a${radius} ${radius} 0 0 1 ${radius} ${radius}V${y + h}Z`;
    case "bottom":
      return `M${x} ${y}V${y + h - radius}a${radius} ${radius} 0 0 0 ${radius} ${radius}h${w - radius * 2}a${radius} ${radius} 0 0 0 ${radius} ${-radius}V${y}Z`;
    case "right":
      return `M${x} ${y}h${w - radius}a${radius} ${radius} 0 0 1 ${radius} ${radius}v${h - radius * 2}a${radius} ${radius} 0 0 1 ${-radius} ${radius}H${x}Z`;
    case "left":
      return `M${x + w} ${y}H${x + radius}a${radius} ${radius} 0 0 0 ${-radius} ${radius}v${h - radius * 2}a${radius} ${radius} 0 0 0 ${radius} ${radius}H${x + w}Z`;
  }
}

/** An SVG arc, used by the gauge and the donut. Angles in degrees, 0 = 12 o'clock. */
export function arcPath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startDeg: number,
  endDeg: number,
): string {
  const p = (r: number, deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  const [x1, y1] = p(rOuter, startDeg);
  const [x2, y2] = p(rOuter, endDeg);
  const [x3, y3] = p(rInner, endDeg);
  const [x4, y4] = p(rInner, startDeg);

  return [
    `M${x1.toFixed(2)} ${y1.toFixed(2)}`,
    `A${rOuter} ${rOuter} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
    `L${x3.toFixed(2)} ${y3.toFixed(2)}`,
    `A${rInner} ${rInner} 0 ${large} 0 ${x4.toFixed(2)} ${y4.toFixed(2)}`,
    "Z",
  ].join(" ");
}
