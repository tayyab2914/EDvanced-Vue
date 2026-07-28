import { renderToStaticMarkup } from "react-dom/server";
import { createElement as h } from "react";
import { DonutChart } from "@/components/dashboard/charts/donut-chart";
import { HalfDonut } from "@/components/dashboard/charts/half-donut";

/**
 * The two composition widgets on the Executive dashboard, checked as arithmetic.
 *
 * These are hand-rolled SVG — there is no charting dependency in this product — so the
 * thing that can silently go wrong is not a crash, it is a wrong angle. A donut whose
 * slices sum to 340° still renders; it just quietly misreports a district's budget. So
 * every assertion below is about the two properties a reader actually trusts:
 *
 *   1. THE GEOMETRY CLOSES. Three slices fill a circle, two segments fill a semicircle,
 *      and nothing is drawn outside the box the layout reserved for it.
 *   2. THE LEGEND AGREES WITH THE CENTRE. The percentages are read against the BUDGET,
 *      not against the sum of what happens to be drawn — which is the whole reason
 *      `shareOf` exists, and the only case where the two differ is the case that matters
 *      most: a district that has committed more than it has.
 *
 * Run: npm run verify:widgets
 */

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

/** Every `d` attribute on the rendered SVG paths, in draw order. */
function paths(markup: string): string[] {
  return [...markup.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
}

/**
 * The angle of an arc endpoint, back from the coordinates the path was drawn at.
 *
 * Reading the geometry back out rather than re-deriving it is the point: a test that
 * recomputes `value / total * 360` and compares it to the same expression in the component
 * proves only that multiplication works.
 */
function angleAt(cx: number, cy: number, x: number, y: number): number {
  const deg = (Math.atan2(y - cy, x - cx) * 180) / Math.PI + 90;
  return deg > 180 ? deg - 360 : deg;
}

function firstPoint(d: string): [number, number] {
  const m = d.match(/^M([-\d.]+) ([-\d.]+)/)!;
  return [Number(m[1]), Number(m[2])];
}

function arcEnd(d: string): [number, number] {
  const m = d.match(/A[\d.]+ [\d.]+ 0 [01] 1 ([-\d.]+) ([-\d.]+)/)!;
  return [Number(m[1]), Number(m[2])];
}

// ===================== [1] the budget donut =====================
console.log("\n[1] Budget status — expended, encumbered, remaining fill the circle");
{
  const SIZE = 210;
  const cx = SIZE / 2;
  const markup = renderToStaticMarkup(
    h(DonutChart, {
      title: "Budget status",
      summary: "test",
      size: SIZE,
      centerValue: "$48.6M",
      centerLabel: "Total budget",
      shareOf: 48_600_000,
      slices: [
        { label: "Expended", value: 18_700_000, color: "#111", display: "$18.7M" },
        { label: "Encumbered", value: 16_200_000, color: "#222", display: "$16.2M" },
        { label: "Remaining", value: 13_700_000, color: "#333", display: "$13.7M" },
      ],
    }),
  );

  const d = paths(markup);
  assert(d.length === 3, `three slices drawn (got ${d.length})`);

  // The first slice starts at 12 o'clock and the last ends back there — the circle closes.
  const [sx, sy] = firstPoint(d[0]);
  assert(Math.abs(angleAt(cx, cx, sx, sy)) < 0.01, "the first slice starts at 12 o'clock");

  // The last slice stops one 2px gap short of 12 o'clock, and that gap is real: its
  // neighbour is the FIRST slice, which starts there. gapDeg at r=101 is 1.13°.
  const [ex, ey] = arcEnd(d[2]);
  const endDeg = angleAt(cx, cx, ex, ey);
  assert(
    Math.abs(endDeg + 1.13) < 0.1,
    `the circle closes at 12 o'clock, less the slice gap (ended at ${endDeg.toFixed(2)}°)`,
  );

  // The legend, which is the text alternative and the thing most readers actually read.
  assert(markup.includes("38.5%"), "Expended reads 38.5% of budget");
  assert(markup.includes("33.3%"), "Encumbered reads 33.3% of budget");
  assert(markup.includes("28.2%"), "Remaining reads 28.2% of budget");
  assert(markup.includes("$18.7M") && markup.includes("Total budget"), "legend and centre carry their figures");
}

// ===================== [2] overcommitted =====================
console.log("\n[2] Overcommitted — no remaining slice, and the shares say so");
{
  const markup = renderToStaticMarkup(
    h(DonutChart, {
      title: "Budget status",
      summary: "test",
      size: 210,
      centerValue: "$10.0M",
      centerLabel: "Total budget",
      // $12M committed against a $10M budget: the page floors the remaining slice at zero
      // for drawing and says the real figure in words underneath.
      shareOf: 10_000_000,
      slices: [
        { label: "Expended", value: 8_000_000, color: "#111", display: "$8.0M" },
        { label: "Encumbered", value: 4_000_000, color: "#222", display: "$4.0M" },
        { label: "Remaining", value: 0, color: "#333", display: "($2.0M)" },
      ],
    }),
  );

  assert(paths(markup).length === 2, "the zero remaining slice is not drawn");
  // Against the SLICE SUM these would be 66.7% and 33.3% — a tidy circle that hides an
  // overspend. Against the budget they are 80% and 40%, which sum past 100 and cannot be
  // misread as healthy.
  assert(markup.includes("80.0%") && markup.includes("40.0%"), "shares are read against the budget, not the overspend");
  assert(!markup.includes("66.7%"), "the shares are NOT renormalised to what was drawn");
}

// ===================== [3] the revenue semicircle =====================
console.log("\n[3] Revenues collected — two segments fill exactly half a circle");
{
  const SIZE = 225;
  const cx = SIZE / 2;
  const markup = renderToStaticMarkup(
    h(HalfDonut, {
      title: "Revenues collected",
      summary: "test",
      size: SIZE,
      centerValue: "$9.8M",
      centerNote: "of $12.4M",
      centerPercent: "79%",
      shareOf: 12_400_000,
      segments: [
        { label: "Collected", value: 9_800_000, color: "#111", display: "$9.8M" },
        { label: "Remaining", value: 2_600_000, color: "#222", display: "$2.6M" },
      ],
    }),
  );

  const d = paths(markup);
  assert(d.length === 2, `two segments drawn (got ${d.length})`);

  const [sx, sy] = firstPoint(d[0]);
  assert(Math.abs(angleAt(cx, cx, sx, sy) + 90) < 0.01, "the arc starts at 9 o'clock");

  const [ex, ey] = arcEnd(d[1]);
  assert(Math.abs(angleAt(cx, cx, ex, ey) - 90) < 0.01, "the arc ends at 3 o'clock");

  // Collected is 79.03% of budget, so its sweep is 79.03% of 180° = 142.3°, less the 2px
  // gap. Measured off the drawn path rather than recomputed.
  const [mx, my] = arcEnd(d[0]);
  const mid = angleAt(cx, cx, mx, my) + 90;
  assert(Math.abs(mid - 142.3) < 1.5, `the collected sweep is 142.3° of 180° (got ${mid.toFixed(1)}°)`);

  assert(markup.includes("79.0%") && markup.includes("21.0%"), "the legend splits 79.0% / 21.0%");
  assert(markup.includes("of $12.4M") && markup.includes("79%"), "the centre carries the amount, the total and the share");

  // Nothing may be drawn below the box: the caption block sits under the arc's baseline and
  // the viewBox has to have reserved room for it, or the percentage is clipped on paper.
  const box = markup.match(/viewBox="0 0 [\d.]+ ([\d.]+)"/);
  assert(box !== null && Number(box[1]) > SIZE / 2 + 34, "the box reserves room under the arc for the three figures");
}

// ===================== [4] nothing to draw =====================
console.log("\n[4] No budget adopted — silence, not a circle of zeros");
{
  const markup = renderToStaticMarkup(
    h(HalfDonut, {
      title: "Revenues collected",
      summary: "test",
      centerValue: "—",
      segments: [
        { label: "Collected", value: 0, color: "#111" },
        { label: "Remaining", value: 0, color: "#222" },
      ],
    }),
  );
  assert(!markup.includes("<svg"), "no arc is drawn");
  assert(markup.includes("Nothing to measure against yet"), "the empty state says why");
}

console.log(`\n${failed === 0 ? "PASS" : "FAIL"} — ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
