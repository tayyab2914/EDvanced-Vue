import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { CountUp } from "@/components/count-up";
import type { Insight } from "@/lib/alerts/insights";

/**
 * The three widget cards under the Overview band — a transcription of Figma nodes 3:11691
 * (Revenue Collected), 3:11667 (Budget Status) and 3:11713 (Key Insights), plus the pieces
 * the mockup keeps OUTSIDE the frames they visually belong to: the gauge is a floating
 * page-level instance (3:12600) sitting over an empty 347×178 frame, and the Key Insights
 * title and period pill (3:11797, 3:11798) are loose siblings over the third card. They are
 * reunited here, the same way overview-kpi.tsx reunites the tiles' corner arrows.
 *
 * Every measurement, colour and radius is the design's. Two things are deliberately NOT:
 *
 *   1. THE CHART GEOMETRY IS COMPUTED, NOT TRACED. The mockup's arcs are frozen at its
 *      sample figures — a donut whose green slice stays 40° while the caption under it says
 *      14.8% would be a drawing, not a chart. The slice paths reproduce the design's STYLE
 *      (ring thickness, rounded segment corners, the gaps between slices, the gauge's track
 *      and gradient) and take their ANGLES from the district's data. Where the designer
 *      widened a thin slice for looks, ours stays true and therefore thinner.
 *   2. FONT. The mockup sets "Aeonik Pro TRIAL" (and Mulish inside the gauge instance) —
 *      the same trial licence overview-kpi.tsx documents. Nothing here names a family;
 *      weights are chosen to sit at Aeonik's visual weight in the app stack.
 */

/* ------------------------------------------------------------------ *
 * Shared chrome
 * ------------------------------------------------------------------ */

/**
 * Title row shared by the two chart cards.
 *
 * The mockup draws a white "All" / "today" capsule beside each title. It is NOT here, at
 * the client's request: the pill was never a control — the scope and period are set in the
 * filter bar — and a static capsule with a chevron reads as an unopenable menu. The `h-[34px]`
 * keeps the header the height the pill gave it, so nothing below shifts.
 */
function WidgetHeader({ title }: { title: string }) {
  return (
    <div className="flex h-[34px] w-full items-center">
      <h3 className="text-[16px] font-semibold leading-normal tracking-[0.16px] text-[#060606]">
        {title}
      </h3>
    </div>
  );
}

/**
 * Every figure in these cards reads proportionally. The app body sets `tabular-nums` —
 * right for the tables it was set for, but it gives every digit and separator a zero's
 * width, which is exactly the looseness that made these values wider than the mockup's.
 * Same call, same reason, as the Overview tiles' 28px values.
 */
const NUMS = "[font-variant-numeric:proportional-nums]";

/* ------------------------------------------------------------------ *
 * Path helpers — the geometry behind the gauge and the donut
 * ------------------------------------------------------------------ */

const RAD = Math.PI / 180;

function polar(cx: number, cy: number, r: number, deg: number): string {
  return `${(cx + r * Math.cos(deg * RAD)).toFixed(3)} ${(cy + r * Math.sin(deg * RAD)).toFixed(3)}`;
}

/** A plain annular sector (flat ends) — the gauge's track and fill. Angles clockwise, degrees. */
export function annularSector(cx: number, cy: number, R: number, r: number, a0: number, a1: number) {
  const large = a1 - a0 > 180 ? 1 : 0;
  return [
    `M ${polar(cx, cy, R, a0)}`,
    `A ${R} ${R} 0 ${large} 1 ${polar(cx, cy, R, a1)}`,
    `L ${polar(cx, cy, r, a1)}`,
    `A ${r} ${r} 0 ${large} 0 ${polar(cx, cy, r, a0)}`,
    "Z",
  ].join(" ");
}

/**
 * An annular sector with rounded corners — the donut's segment shape. The mockup's slices
 * are Figma arcs with a corner radius, which is neither a `stroke-linecap: round` (that
 * draws a full semicircle cap) nor a flat butt; each of the four corners is eased by `rc`.
 * Same construction d3's arc uses: corner circles tangent to the rim and the radial edge.
 */
function roundedSector(
  cx: number,
  cy: number,
  R: number,
  r: number,
  a0: number,
  a1: number,
  rc: number,
) {
  const span = a1 - a0;
  const s = Math.sin((span / 2) * RAD);
  // The radius cannot exceed half the ring's thickness, nor what the slice's own angular
  // span can accommodate at either rim — a 7° slice gets pill ends, not broken arcs.
  const rcO = Math.max(0, Math.min(rc, (R - r) / 2, (R * s) / (1 + s)));
  const rcI = Math.max(0, Math.min(rc, (R - r) / 2, s < 1 ? (r * s) / (1 - s) : rc));

  const phiO = Math.asin(rcO / (R - rcO)) / RAD;
  const phiI = Math.asin(rcI / (r + rcI)) / RAD;
  const tO = Math.sqrt((R - rcO) ** 2 - rcO ** 2);
  const tI = Math.sqrt((r + rcI) ** 2 - rcI ** 2);
  const large = a1 - phiO - (a0 + phiO) > 180 ? 1 : 0;

  return [
    `M ${polar(cx, cy, tO, a0)}`,
    `A ${rcO} ${rcO} 0 0 1 ${polar(cx, cy, R, a0 + phiO)}`,
    `A ${R} ${R} 0 ${large} 1 ${polar(cx, cy, R, a1 - phiO)}`,
    `A ${rcO} ${rcO} 0 0 1 ${polar(cx, cy, tO, a1)}`,
    `L ${polar(cx, cy, tI, a1)}`,
    `A ${rcI} ${rcI} 0 0 1 ${polar(cx, cy, r, a1 - phiI)}`,
    `A ${r} ${r} 0 ${large} 0 ${polar(cx, cy, r, a0 + phiI)}`,
    `A ${rcI} ${rcI} 0 0 1 ${polar(cx, cy, tI, a0)}`,
    "Z",
  ].join(" ");
}

/** Catmull-Rom through the points, emitted as cubic beziers — the sparkline's easing. */
function smoothPath(pts: { x: number; y: number }[]) {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

/* ------------------------------------------------------------------ *
 * Revenue Collected — Figma 3:11691 + the floating gauge 3:12600
 * ------------------------------------------------------------------ */

/**
 * The half-gauge. The design's arc asset is a 179.87×87 half-ring: a black track at 15%
 * opacity, 12.66px thick with flat ends, and a progress wedge sweeping from the left end
 * under a #026E78 → #038C8C gradient. Redrawn at those numbers with the sweep at the
 * district's own collected fraction.
 *
 * The `scale` group is not decoration: the asset's arc is subtly ELLIPTICAL — 89.94 wide,
 * 87 tall — squashed to fit its own box. A true circle at the 89.94 radius stands 3px
 * taller than the viewBox and renders with its crown sliced flat.
 */
function CollectedGauge({ fraction }: { fraction: number }) {
  const f = Math.max(0, Math.min(1, fraction));
  const R = 89.936;
  const r = R - 12.662;
  const cx = 89.936;
  const cy = 87;
  return (
    <svg
      aria-hidden
      width="179.872"
      height="87"
      viewBox="0 0 179.872 87"
      fill="none"
      className="absolute left-[2.94px] top-0"
    >
      <g transform={`translate(0 ${cy}) scale(1 ${(87 / R).toFixed(5)}) translate(0 -${cy})`}>
        <path d={annularSector(cx, cy, R, r, 180, 360)} fill="black" opacity="0.15" />
        {/* On first view the wedge sweeps up from the scale's zero — wound back by its
            own span and released by the card's reveal (see .anim-sweep in globals.css). */}
        {f > 0 && (
          <path
            d={annularSector(cx, cy, R, r, 180, 180 + f * 180)}
            fill="url(#ovw-gauge-grad)"
            className="anim-sweep"
            style={{
              transformOrigin: `${cx}px ${cy}px`,
              transformBox: "view-box",
              ["--sweep" as string]: `${-(f * 180)}deg`,
            }}
          />
        )}
      </g>
      <defs>
        <linearGradient id="ovw-gauge-grad" x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#026E78" />
          <stop offset="1" stopColor="#038C8C" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/**
 * The trend under the gauge — a 137×64 line at the design's #4AB1D9, 2px stroke, over a
 * 60%-opacity vertical fade of the same blue. The mockup ships this as a frozen picture;
 * this one plots the district's monthly collections, on the design's internal margins
 * (line band y 16.5–48.4, fill dropping to y 54.5).
 */
function RevenueSparkline({ values }: { values: (number | null)[] }) {
  const pts = values
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v !== null);
  if (pts.length < 2) return null;

  const w = 137;
  const yTop = 16.5;
  const yBottom = 48.4;
  const yFill = 54.5;
  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const denom = values.length - 1 || 1;
  const xy = pts.map((p) => ({
    x: (p.i / denom) * w,
    y: max === min ? (yTop + yBottom) / 2 : yBottom - ((p.v - min) / (max - min)) * (yBottom - yTop),
  }));

  const line = smoothPath(xy);
  const fill = `${line} L ${xy[xy.length - 1].x.toFixed(2)} ${yFill} L ${xy[0].x.toFixed(2)} ${yFill} Z`;

  return (
    <svg aria-hidden width="137" height="64" viewBox="0 0 137 64" fill="none" className="absolute left-0 top-0">
      <path d={fill} fill="url(#ovw-spark-grad)" fillOpacity="0.6" className="anim-fade" />
      <path
        d={line}
        stroke="#4AB1D9"
        strokeWidth="2"
        pathLength={1}
        strokeDashoffset={0}
        className="anim-draw"
      />
      <defs>
        <linearGradient
          id="ovw-spark-grad"
          x1="0"
          y1={yTop}
          x2="0"
          y2={yFill}
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#4AB1D9" />
          <stop offset="1" stopColor="white" stopOpacity="0.04" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function RevenueCollectedWidget({
  collectedDisplay,
  ofDisplay,
  remainingDisplay,
  collectedPct,
  spark,
}: {
  /** Pre-formatted collections to date — the gauge's centre and the left stat. */
  collectedDisplay: string;
  /** "of $208.9M" — omitted when there is no revenue budget to divide by. */
  ofDisplay?: string;
  remainingDisplay: string;
  /** Collected as a % of the full-year budget. `null` renders the gauge empty, unlabelled. */
  collectedPct: number | null;
  /** Monthly collections for the trend line. */
  spark: (number | null)[];
}) {
  const pctLeft = collectedPct === null ? null : `${collectedPct.toFixed(1)}%`;
  const pctRight = collectedPct === null ? null : `${(100 - collectedPct).toFixed(1)}%`;

  return (
    <div data-reveal className="relative overflow-clip rounded-[14px] bg-white/[0.62] p-[18px]">
      <div className="mx-auto flex w-[364px] max-w-full flex-col gap-[24px]">
        <WidgetHeader title="Revenue Collected" />

        <div className="relative h-[255px]">
          {/* The gauge instance — 190×115, horizontally centred over the empty frame. */}
          <div className="absolute left-1/2 top-[20px] h-[115px] w-[190px] -translate-x-1/2">
            <CollectedGauge fraction={collectedPct === null ? 0 : collectedPct / 100} />
            <div className="absolute left-1/2 top-[62px] flex -translate-x-1/2 flex-col items-center gap-[6px] whitespace-nowrap text-center">
              <p className={cn("text-[24px] font-bold leading-[1.2] text-black/85", NUMS)}>
                <CountUp value={collectedDisplay} />
              </p>
              {ofDisplay && (
                <p className="text-[12px] font-semibold leading-[1.5] text-black/[0.45]">
                  {ofDisplay}
                </p>
              )}
            </div>
            <p className="absolute left-0 top-[97px] text-[12px] leading-[1.5] text-black/[0.45]">
              0
            </p>
            <p className="absolute right-0 top-[94px] text-[12px] leading-[1.5] text-black/[0.45]">
              100%
            </p>
          </div>

          {pctLeft && (
            <p className="absolute left-0 top-[198px] text-[11px] leading-normal tracking-[0.11px] text-black/[0.59]">
              {pctLeft}
            </p>
          )}
          {pctRight && (
            <p className="absolute right-0 top-[195px] text-[11px] leading-normal tracking-[0.11px] text-black/[0.59]">
              {pctRight}
            </p>
          )}

          <div className="absolute left-[108px] top-[189px] h-[64px] w-[137px]">
            <RevenueSparkline values={spark} />
          </div>

          <div className="absolute left-0 top-[208px] flex w-full items-start justify-between">
            <div className="flex flex-col items-start gap-[6px]">
              <p className={cn("text-[22px] font-medium leading-normal tracking-[0.22px] text-[#31baae]", NUMS)}>
                <CountUp value={collectedDisplay} />
              </p>
              <p className="text-[14px] leading-normal text-[#797979]">Collected</p>
            </div>
            <div className="flex flex-col items-end gap-[6px]">
              <p className={cn("text-[22px] font-medium leading-normal tracking-[0.22px] text-[#4b4b4b]", NUMS)}>
                <CountUp value={remainingDisplay} />
              </p>
              <p className="text-[14px] leading-normal text-[#797979]">Remaining</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Budget Status — Figma 3:11667
 * ------------------------------------------------------------------ */

/** The design's slice colours — the same hues its stat figures underneath are set in. */
export const DONUT = {
  expended: "#1a932e",
  encumbered: "#6f4ec8",
  remaining: "#00b4d8",
};

/**
 * The Budget Status slices, as paths — shared by the on-screen donut below and the compact
 * one the one-page summary sheet prints (components/dashboard/sheet-widgets.tsx), so the
 * printed ring cannot tell a different story from the screen one.
 *
 * A non-zero slice is never allowed to vanish. $1.21M encumbered against a $208M budget
 * is 2.1° — thinner than the gap between slices, which would draw it as nothing at all,
 * and a chart that hides a real figure is worse than one that slightly widens it. Slices
 * under 12° are raised to 12° and the excess is taken back from the largest, which is the
 * one place a few degrees cannot mislead.
 */
export function donutGeometry(
  expended: number,
  encumbered: number,
  remaining: number,
  { size, thickness, rc }: { size: number; thickness: number; rc: number },
): { key: string; color: string; d: string | null }[] {
  const total = expended + encumbered + remaining;
  const slices = [
    { key: "expended", value: expended, color: DONUT.expended },
    { key: "encumbered", value: encumbered, color: DONUT.encumbered },
    { key: "remaining", value: remaining, color: DONUT.remaining },
  ].filter((s) => s.value > 0);

  const GAP = 6;
  const START = -62;
  const MIN_SPAN = 12;

  let spans = slices.map((s) => (total > 0 ? (s.value / total) * 360 : 0));
  const deficit = spans.reduce((d, sp) => d + (sp < MIN_SPAN ? MIN_SPAN - sp : 0), 0);
  if (deficit > 0 && spans.length > 1) {
    spans = spans.map((sp) => (sp < MIN_SPAN ? MIN_SPAN : sp));
    spans[spans.indexOf(Math.max(...spans))] -= deficit;
  }

  const R = size / 2;
  let angle = START;
  return total > 0
    ? slices.map((s, i) => {
        const a0 = angle + GAP / 2;
        const a1 = angle + spans[i] - GAP / 2;
        angle += spans[i];
        return {
          key: s.key,
          color: s.color,
          d: a1 > a0 ? roundedSector(R, R, R, R - thickness, a0, a1, rc) : null,
        };
      })
    : [];
}

/**
 * The donut — a 208px ring, 50px thick, slices with ~8px corner easing and a 6° gap
 * between neighbours, opening clockwise from the design's upper-right start. Slices at
 * zero are dropped rather than drawn as bare gaps.
 */
function BudgetDonut({
  expended,
  encumbered,
  remaining,
  centerDisplay,
}: {
  expended: number;
  encumbered: number;
  remaining: number;
  centerDisplay: string;
}) {
  const paths = donutGeometry(expended, encumbered, remaining, {
    size: 208,
    thickness: 50,
    rc: 8,
  });

  return (
    <div className="relative size-[208px]">
      <svg aria-hidden width="208" height="208" viewBox="0 0 208 208" fill="none" className="absolute inset-0">
        {/* The ring sweeps in as one piece — wound back a fixed 80° and released, which
            reads as the slices rotating home without lying about any slice's own span. */}
        <g
          className="anim-sweep"
          style={{
            transformOrigin: "104px 104px",
            transformBox: "view-box",
            ["--sweep" as string]: "-80deg",
          }}
        >
          {paths.map(
            (p) => p.d && <path key={p.key} d={p.d} fill={p.color} />,
          )}
        </g>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <p className={cn("text-[20px] font-medium leading-normal tracking-[0.2px] text-[#060606]", NUMS)}>
          <CountUp value={centerDisplay} />
        </p>
      </div>
    </div>
  );
}

export function BudgetStatusWidget({
  totalDisplay,
  expendedDisplay,
  encumberedDisplay,
  remainingDisplay,
  expended,
  encumbered,
  remaining,
}: {
  totalDisplay: string;
  expendedDisplay: string;
  encumberedDisplay: string;
  remainingDisplay: string;
  /** The raw figures, for the slice angles. Remaining pre-floored at zero by the caller. */
  expended: number;
  encumbered: number;
  remaining: number;
}) {
  return (
    <div data-reveal className="relative overflow-clip rounded-[14px] bg-white/[0.62] p-[18px]">
      <div className="mx-auto w-[364px] max-w-full">
        <WidgetHeader title="Budget Status" />

        <div className="relative mt-[24px] h-[262px]">
          <div className="absolute -top-[25px] left-[64px]">
            <BudgetDonut
              expended={expended}
              encumbered={encumbered}
              remaining={remaining}
              centerDisplay={totalDisplay}
            />
          </div>

          <div className="absolute left-0 top-[208px] flex w-full items-start justify-between whitespace-nowrap">
            <div className="flex flex-col items-start gap-[6px]">
              <p className={cn("text-[28px] font-medium leading-normal tracking-[0.28px] text-[#060606]", NUMS)}>
                <CountUp value={totalDisplay} />
              </p>
              <p className="text-[14px] leading-normal text-[#797979]">Total</p>
            </div>
            <div className="flex flex-col items-start gap-[6px]">
              <p className={cn("text-[18px] font-medium leading-normal tracking-[0.18px] text-[#1a932e]", NUMS)}>
                <CountUp value={expendedDisplay} />
              </p>
              <p className="text-[10px] leading-normal text-[#797979]">Expended</p>
            </div>
            <div className="flex flex-col items-start gap-[6px]">
              <p className={cn("text-[18px] font-medium leading-normal tracking-[0.18px] text-[#6f4ec8]", NUMS)}>
                <CountUp value={encumberedDisplay} />
              </p>
              <p className="text-[10px] leading-normal text-[#797979]">Encumbered</p>
            </div>
            <div className="flex flex-col items-start gap-[6px]">
              <p className={cn("text-[18px] font-medium leading-normal tracking-[0.18px] text-[#00b4d8]", NUMS)}>
                <CountUp value={remainingDisplay} />
              </p>
              <p className="text-[10px] leading-normal text-[#797979]">Remaining</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Key Insights — Figma 3:11713 + the floating header 3:11797/3:11798
 * ------------------------------------------------------------------ */

/**
 * The design's two trend glyphs, inlined from their exported assets so the third state can
 * exist: the mockup only ever shows a red squiggle and a green one, but insights carry
 * three directions, and "flag" takes the red glyph's shape in the Overview band's amber.
 *
 * The green glyph's fill gradient starts from the SPARKLINE'S BLUE (#4AB1D9), not from its
 * own stroke green — verbatim from the export. The designer's slip, but a shipped copy that
 * quietly corrected it would no longer match the file it claims to transcribe.
 */
function InsightGlyph({ direction }: { direction: "up" | "down" | "flag" }) {
  if (direction === "up") {
    return (
      <svg aria-hidden width="22" height="22" viewBox="0 0 22.4985 23.0767" fill="none" className="flex-none">
        <path
          d="M2.64858 16.45C1.85884 15.4875 0.627216 15.3615 0.110122 15.4188V23.0767H22.2511V8.19996C21.264 8.19996 20.5588 5.10621 19.2896 3.55934C18.0204 2.01246 17.0332 4.51423 15.764 8.19996C15.4911 8.99238 14.3537 13.3562 13.6486 14.3875C12.9435 15.4187 12.3794 13.8718 11.2511 13.3562C10.1229 12.8406 9.69987 16.45 8.71269 18.1687C7.72551 19.8874 6.5973 12.1531 5.61012 11.6375C4.62294 11.1219 3.63576 17.6532 2.64858 16.45Z"
          fill="url(#ovw-insight-up)"
          fillOpacity="0.24"
        />
        <path
          d="M0.110122 15.4188C0.627216 15.3615 1.85884 15.4875 2.64858 16.45C3.63576 17.6532 4.62294 11.1219 5.61012 11.6375C6.5973 12.1531 7.72551 19.8874 8.71269 18.1687C9.69987 16.45 10.1229 12.8406 11.2511 13.3562C12.3794 13.8718 12.9435 15.4187 13.6486 14.3875C14.3537 13.3562 15.4911 8.99238 15.764 8.19997C17.0332 4.51424 18.0204 2.01247 19.2896 3.55934C20.5588 5.10622 21.264 8.19997 22.2511 8.19997"
          stroke="#4AD97C"
          strokeWidth="2"
        />
        <defs>
          <linearGradient
            id="ovw-insight-up"
            x1="11.1806"
            y1="3.09375"
            x2="11.1806"
            y2="23.0767"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#4AB1D9" />
            <stop offset="1" stopColor="white" stopOpacity="0.04" />
          </linearGradient>
        </defs>
      </svg>
    );
  }

  const stroke = direction === "down" ? "#FD4438" : "#EF8A1F";
  const gradId = direction === "down" ? "ovw-insight-down" : "ovw-insight-flag";
  return (
    <svg aria-hidden width="21" height="21" viewBox="0 0 21.995 21" fill="none" className="flex-none">
      <path
        d="M19.4079 10.4562C20.1617 9.53747 21.3374 9.41715 21.831 9.47184V17.2305H0.995037V10.4562C1.1591 8.81566 4.11222 3.77735 5.91691 3.94141C7.36066 4.07266 8.51246 7.02676 8.9079 8.4874C9.58097 9.47178 10.1194 7.99521 11.1964 7.50303C12.2733 7.01084 12.6771 10.4562 13.6194 12.0968C14.5617 13.7373 15.6387 8.97959 16.581 8.4874C17.5233 7.99522 18.4656 11.6047 19.4079 10.4562Z"
        fill={`url(#${gradId})`}
        fillOpacity="0.24"
      />
      <path
        d="M21.831 9.47184C21.3374 9.41715 20.1617 9.53747 19.4079 10.4562C18.4656 11.6047 17.5233 7.99522 16.581 8.4874C15.6387 8.97959 14.5617 13.7373 13.6194 12.0968C12.6771 10.4562 12.2733 7.01084 11.1964 7.50303C10.1194 7.99521 9.58097 9.47178 8.9079 8.4874C8.51246 7.02676 7.36066 4.07266 5.91691 3.94141C4.11222 3.77735 1.1591 8.81566 0.995037 10.4562"
        stroke={stroke}
        strokeWidth="2"
      />
      <defs>
        <linearGradient
          id={gradId}
          x1="11.413"
          y1="3.9375"
          x2="11.413"
          y2="17.2305"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor={stroke} />
          <stop offset="1" stopColor="white" stopOpacity="0.04" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function KeyInsightsWidget({
  insights,
  emptyText = "Nothing stands out this period. Insights appear once there is enough committed data to compare against your policies.",
}: {
  insights: Insight[];
  emptyText?: string;
}) {
  return (
    <div data-reveal className="relative min-h-[349px] overflow-clip rounded-[14px] bg-white/[0.62]">
      {/* The floating header — the design pins the title at (40, 23). Its "today" pill is
          gone with the other cards' capsules. */}
      <h3 className="absolute left-[40px] top-[23px] text-[16px] font-semibold leading-normal tracking-[0.16px] text-[#060606]">
        Key Insights
      </h3>

      {insights.length > 0 ? (
        /**
         * The list is ABSOLUTE, so however many insights there are, the card cannot grow —
         * its height is the design's 349px floor, or whatever the two chart cards stretch
         * the row to, and nothing else. What does not fit scrolls inside the card instead
         * of pushing the whole band taller: a fourth-row cutoff would hide insights, and a
         * growing card would let the quietest widget on the band dictate its height.
         */
        <div className="absolute inset-x-0 bottom-0 top-[52px] overflow-y-auto">
          <ul className="flex flex-col pb-[12px]">
            {insights.map((i, idx) => (
              <li key={i.id} className="relative min-h-[68px] pl-[43px] pr-[14px]">
                {/* The 0.5px hairline at 11% black, inset 9px left and 4px right. */}
                {idx > 0 && (
                  <span
                    aria-hidden
                    className="absolute left-[9px] right-[4px] top-0 h-[0.5px] bg-black/[0.11]"
                  />
                )}
                <span className="absolute left-[12px] top-[22px]">
                  <InsightGlyph direction={i.direction} />
                </span>
                <p className="pt-[17px] text-[12px] font-medium leading-normal tracking-[0.12px] text-black">
                  {i.text}
                </p>
                {i.detail && (
                  <p className="mt-[6px] pb-[10px] text-[8px] leading-normal tracking-[0.08px] text-black/[0.42]">
                    {i.detail}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="px-[18px] pb-[24px] pt-[68px] text-center text-[12px] leading-relaxed text-black/[0.42]">
          {emptyText}
        </p>
      )}
    </div>
  );
}

/**
 * The row itself — three cards at the design's 400 : 400 : 273 widths and 10px gaps.
 * Fractional columns rather than fixed widths, so the row divides whatever the page
 * actually has the way the mockup divides its canvas.
 */
export function OverviewWidgetRow({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 items-stretch gap-[10px]",
        "lg:grid-cols-2 xl:grid-cols-[1.4652fr_1.4652fr_1fr]",
      )}
    >
      {children}
    </div>
  );
}
