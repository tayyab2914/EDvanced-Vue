import type { StatusRung } from "@/lib/dashboard/status";
import { CountUp } from "@/components/count-up";
import { OverviewPanel, PanelRungPill } from "@/components/dashboard/overview-panel";
import { CARD_TITLE, CARD_SUBTITLE, COLUMN_HEADER } from "@/components/dashboard/type-scale";

/**
 * "Financial health summary" — a transcription of Figma 3:12545.
 *
 * The design draws the table with hand-placed absolutes; the column template below is its
 * own geometry read back as fractions of the 1055px content row (Indicator 0%, Current
 * 36.85%, Target 59.17%, Status 75.08%, Trend 91.44%). One hairline under the header at
 * 10% black, no row rules, 60px row cadence, everything 14px in the frame's #060606.
 *
 * The status pills keep the design's local vocabulary — "At risk" where the app ladder
 * says Action Required, "Not available" for N/A — the same licence as the split card's
 * "Healthy". The rung itself still comes from the one ladder every badge and alert reads.
 *
 * The Trend cell is the design's 22px squiggle glyph (stroke #4AD97C over a #4AB1D9 fade —
 * the gradient's blue is the designer's own slip, kept verbatim; see InsightGlyph), except
 * that THE PATH PLOTS THE DISTRICT'S REAL SERIES rather than shipping the mockup's frozen
 * picture. Too few points to draw a direction renders the design's "-----" instead —
 * a missing figure is silence, never reassurance.
 */

export interface HealthRow {
  id: string;
  indicator: string;
  current: string;
  target: string;
  rung: StatusRung;
  trend: (number | null)[];
}

/** The design's wording for this table, over the app's closed rung vocabulary. */
const WORD: Partial<Record<StatusRung, string>> = {
  "Action Required": "At risk",
  "N/A": "Not available",
};

/** Catmull-Rom through the points, emitted as cubic beziers — the glyph's easing. */
function smoothPath(pts: { x: number; y: number }[]) {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    d += ` C ${(p1.x + (p2.x - p0.x) / 6).toFixed(2)} ${(p1.y + (p2.y - p0.y) / 6).toFixed(2)} ${(p2.x - (p3.x - p1.x) / 6).toFixed(2)} ${(p2.y - (p3.y - p1.y) / 6).toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

function TrendGlyph({ values, id, label }: { values: (number | null)[]; id: string; label: string }) {
  const real = values.filter((v): v is number => v !== null);
  if (real.length < 2) {
    return (
      <span aria-hidden className="text-[14px] leading-[normal] text-[#060606]">
        -----
      </span>
    );
  }

  const W = 22.5;
  const Y_TOP = 3;
  const Y_BOTTOM = 19.5;
  const Y_FILL = 23;
  const min = Math.min(...real);
  const max = Math.max(...real);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v !== null)
    .map((p) => ({
      x: (p.i / (values.length - 1 || 1)) * W,
      y: Y_BOTTOM - ((p.v - min) / span) * (Y_BOTTOM - Y_TOP),
    }));

  const line = smoothPath(pts);
  const fill = `${line} L ${pts[pts.length - 1].x.toFixed(2)} ${Y_FILL} L ${pts[0].x.toFixed(2)} ${Y_FILL} Z`;
  const gradId = `health-trend-${id}`;

  return (
    <svg
      width="22.5"
      height="23"
      viewBox="0 0 22.5 23.1"
      fill="none"
      role="img"
      aria-label={label}
      style={{ display: "block", overflow: "visible" }}
    >
      <path d={fill} fill={`url(#${gradId})`} fillOpacity="0.24" className="anim-fade" />
      <path
        d={line}
        stroke="#4AD97C"
        strokeWidth="2"
        fill="none"
        pathLength={1}
        strokeDashoffset={0}
        className="anim-draw"
      />
      <defs>
        <linearGradient id={gradId} x1="11.25" y1={Y_TOP} x2="11.25" y2={Y_FILL} gradientUnits="userSpaceOnUse">
          <stop stopColor="#4AB1D9" />
          <stop offset="1" stopColor="white" stopOpacity="0.04" />
        </linearGradient>
      </defs>
    </svg>
  );
}

const COLS = "grid grid-cols-[36.85%_22.32%_15.91%_16.36%_minmax(0,1fr)] items-center";

export function OverviewHealthCard({ rows }: { rows: HealthRow[] }) {
  return (
    <OverviewPanel>
      <header>
        <h2 className={CARD_TITLE}>
          Financial health summary
        </h2>
        <p className={CARD_SUBTITLE}>
          Key indicators compared to policy targets
        </p>
      </header>

      <div className="mt-[24px] overflow-x-auto">
        <div className="min-w-[720px]">
          <div className={COLS} aria-hidden>
            {["Indicator", "Current", "Target", "Status", "Trend"].map((h) => (
              <span key={h} className={COLUMN_HEADER}>
                {h}
              </span>
            ))}
          </div>
          <div aria-hidden className="mt-[10px] h-px w-full bg-black/10" />

          <ul aria-hidden>
            {rows.map((r) => (
              <li key={r.id} className={`${COLS} h-[60px]`}>
                <span className="pr-[12px] text-[14px] leading-[normal] tracking-[0.14px] text-[#060606]">
                  {r.indicator}
                </span>
                <span className="text-[14px] leading-[normal] tracking-[0.14px] text-[#060606] [font-variant-numeric:proportional-nums]">
                  <CountUp value={r.current} />
                </span>
                <span className="text-[14px] leading-[normal] tracking-[0.14px] text-[#060606] [font-variant-numeric:proportional-nums]">
                  {r.target}
                </span>
                <span>
                  <PanelRungPill rung={r.rung} label={WORD[r.rung]} />
                </span>
                <span>
                  <TrendGlyph values={r.trend} id={r.id} label={`${r.indicator} trend`} />
                </span>
              </li>
            ))}
          </ul>

          {/* The same content as a real table, for a reader who cannot use the grid. */}
          <table className="sr-only">
            <caption>Financial health summary — key indicators compared to policy targets</caption>
            <thead>
              <tr>
                <th scope="col">Indicator</th>
                <th scope="col">Current</th>
                <th scope="col">Target</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row">{r.indicator}</th>
                  <td>{r.current}</td>
                  <td>{r.target}</td>
                  <td>{WORD[r.rung] ?? r.rung}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </OverviewPanel>
  );
}
