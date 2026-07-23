/**
 * The categorical series slots, as CSS variables SVG can consume.
 *
 * SVG's `fill` and `stroke` cannot take a Tailwind utility the way the rest of the app
 * takes a token, so chart colours would otherwise be hardcoded hex — and drift from
 * app/globals.css the first time the palette moves. Naming them once here, as `var(...)`
 * references, keeps a single source.
 *
 * ASSIGNED IN ORDER, NEVER CYCLED. The order is the colour-blindness mechanism, not a
 * preference: of the 120 orderings of these six hues, eight clear every gate (adjacent
 * ΔE ≥ 8 under simulated protanopia and deuteranopia, ≥ 15 unsimulated, ≥ 3:1 against the
 * white card) and this is one of them.
 *
 * A SEVENTH CATEGORY DOES NOT GET A GENERATED COLOUR. It folds into "Other" —
 * `foldTail()` in lib/finance/breakdown.ts does the folding, and keeps the total intact so
 * a donut still sums to the figure in its centre.
 */
export const SERIES_SLOTS = [
  "var(--color-viz-1)",
  "var(--color-viz-2)",
  "var(--color-viz-3)",
  "var(--color-viz-4)",
  "var(--color-viz-5)",
  "var(--color-viz-6)",
] as const;

/** Named roles for the charts that repeat across every dashboard. */
export const VIZ = {
  actual: "var(--color-viz-actual)",
  budget: "var(--color-viz-budget)",
  forecast: "var(--color-viz-forecast)",
  reference: "var(--color-viz-reference)",
  positive: "var(--color-viz-positive)",
  negative: "var(--color-viz-negative)",
} as const;

/**
 * The fund-balance components, in the order the workbook lists them.
 *
 * Fixed per component rather than taken from the categorical slots in sequence, because a
 * district reads "Restricted" in the same colour on the composition donut, the by-fund
 * table and the forecast — and a filter that changed the slice count would otherwise
 * repaint the survivors.
 */
export const COMPONENT_COLORS: Record<string, string> = {
  Nonspendable: "var(--color-viz-4)",
  Restricted: "var(--color-viz-2)",
  Committed: "var(--color-viz-3)",
  Assigned: "var(--color-viz-6)",
  Unassigned: "var(--color-viz-5)",
};

/** Cash composition, likewise fixed by meaning rather than by position. */
export const CASH_COLORS: Record<string, string> = {
  Operating: "var(--color-viz-1)",
  Investment: "var(--color-viz-3)",
  Restricted: "var(--color-viz-2)",
  Other: "var(--color-viz-reference)",
};
