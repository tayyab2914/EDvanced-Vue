import { linear, niceTicks, barPath } from "@/lib/dashboard/scale";
import { Legend, ChartFigure, ChartEmpty, type LegendItem } from "./chrome";

/**
 * Horizontal grouped bars — §3.3a "Revenues vs Budget" and §3.3b "Expenditures vs Budget".
 *
 * Horizontal rather than vertical because the categories are real account names — "Student
 * and Instructional Support Services" is 41 characters — and vertical columns would either
 * rotate the labels or truncate them. A horizontal gutter gives the name a line of its own.
 *
 * Kept separate from ColumnChart deliberately. The two share `scale.ts` and nothing else:
 * the category gutter, the label-at-bar-end placement and the row-band geometry have no
 * counterpart in a vertical zero-baseline chart, and one component with an `orientation`
 * flag would be a branch per element.
 */

export interface HBarRow {
  label: string;
  /** One value per series, in the same order as `series`. */
  values: number[];
  /** Pre-formatted display values, same order. Only the first is drawn, at the bar end. */
  displays?: string[];
}

export interface HBarSeries {
  label: string;
  color: string;
  /** Draws as an outline rather than a fill — for a reference like the full-year budget. */
  outline?: boolean;
}

/** Names are truncated rather than overflowed: SVG text neither wraps nor ellipsises. */
function truncate(s: string, max = 22): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

export function HBarChart({
  rows,
  series,
  title,
  summary,
  height,
  width = 640,
  gutter = 150,
}: {
  rows: HBarRow[];
  series: HBarSeries[];
  title: string;
  summary: string;
  height?: number;
  width?: number;
  gutter?: number;
}) {
  if (rows.length === 0) {
    return <ChartEmpty height={height ?? 200}>Nothing to compare for this period yet.</ChartEmpty>;
  }

  const rowHeight = 44;
  const padTop = 8;
  const padBottom = 8;
  const h = height ?? padTop + rows.length * rowHeight + padBottom;
  const left = gutter;
  const right = width - 64;

  const all = rows.flatMap((r) => r.values);
  const ticks = niceTicks(0, Math.max(...all, 0), { count: 4 });
  const x = linear([0, ticks.max], [left, right]);

  const legendItems: LegendItem[] = series.map((s) => ({ label: s.label, color: s.color }));
  // Bars within a row are stacked vertically as thin strips; the row's height is shared.
  const barH = Math.min(9, (rowHeight - 14) / series.length);

  return (
    <div>
      <div className="mb-2.5">
        <Legend items={legendItems} />
      </div>
      <ChartFigure title={title} summary={summary}>
        <svg viewBox={`0 0 ${width} ${h}`} width="100%" style={{ display: "block" }}>
          {rows.map((row, ri) => {
            const top = padTop + ri * rowHeight;
            // 2px of surface between adjacent bars — white does the separating, never a
            // stroke drawn around the mark.
            const groupH = series.length * barH + (series.length - 1) * 2;
            const groupTop = top + (rowHeight - groupH) / 2;

            return (
              <g key={`${row.label}-${ri}`}>
                <text
                  x={left - 10}
                  y={top + rowHeight / 2 + 3.5}
                  textAnchor="end"
                  fontSize={11}
                  fill="var(--color-ink-muted)"
                >
                  <title>{row.label}</title>
                  {truncate(row.label)}
                </text>

                {series.map((s, si) => {
                  const v = row.values[si] ?? 0;
                  const w = Math.max(x(v) - left, v > 0 ? 2 : 0);
                  const y = groupTop + si * (barH + 2);

                  if (s.outline) {
                    // A reference, drawn as an open bracket rather than a fill so it frames
                    // the actual rather than competing with it.
                    return (
                      <path
                        key={s.label}
                        d={barPath(left, y, w, barH, "right")}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={1.25}
                        strokeDasharray="3 2"
                      />
                    );
                  }

                  return (
                    <path key={s.label} d={barPath(left, y, w, barH, "right")} fill={s.color} />
                  );
                })}

                {/* Only the leading series is labelled. A number at the end of every bar in
                    a three-series group is the "value on every point" anti-pattern wearing
                    a different hat. */}
                {row.displays?.[0] && (
                  <text
                    x={Math.min(x(row.values[0] ?? 0) + 7, width - 4)}
                    y={groupTop + barH / 2 + 3.5}
                    fontSize={10}
                    fontWeight={600}
                    fill="var(--color-ink-muted)"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {row.displays[0]}
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
