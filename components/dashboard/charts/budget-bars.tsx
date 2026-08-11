import { fittedTicks } from "@/lib/dashboard/scale";
import { cn } from "@/lib/cn";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Swatch, ChartEmpty } from "./chrome";
import type { PaceStatus } from "@/lib/dashboard/pace";

/**
 * "Revenues vs Budget (YTD)" and "Expenditures vs Budget (YTD)" — §3.3a/b, redrawn to the
 * client's M4 mockup.
 *
 * WHY THIS REPLACED THE GROUPED SVG BARS
 *
 * The old HBarChart stacked three thin strips per category. Three 9px bars in a 44px row is
 * a lot of ink saying one thing, and the client's note — "make Actual vs Budget easier to
 * distinguish" — was the symptom: at that weight the green and the blue read as texture
 * rather than as two different quantities.
 *
 * The mockup's answer is better, and it is the one drawn here. Actual and Budget-to-date
 * share ONE track: the budget runs the full length in blue, the actual is painted over it
 * in green, and the gap between the two ends IS the variance. Nothing has to be measured
 * against a second bar two pixels below. The full-year budget stops being a bar at all and
 * becomes a dashed run out to a hollow marker — it is a reference, and drawing it as a
 * third series was always overstating it.
 *
 * WHY IT IS HTML AND NOT SVG
 *
 * The client asked for a status badge on every row, and a badge is a pill with a word in
 * it — in SVG that is a hand-measured `<rect>` plus a `<text>` whose width nobody can
 * know without a font metric. In CSS it is `<StatusBadge>`, the same component the rest of
 * the product uses, which is also what guarantees the badge here and the badge on the KPI
 * tile above cannot drift apart. Percentage widths need no viewBox, so the chart also
 * reflows properly in a narrow column instead of scaling its type down with the viewport.
 *
 * Still a Server Component with no state, so it prints to PDF like everything else.
 */

export interface BudgetBarRow {
  id: string;
  label: string;
  /** Actual year to date. */
  actual: number;
  /** The budget expected BY NOW — the figure the variance is measured against. */
  budgetToDate: number;
  /** The full-year budget. Drawn as a reference, never as a bar. */
  budgetFullYear: number;
  /** Pre-formatted, because every figure upstream is a Prisma.Decimal. */
  actualDisplay: string;
  budgetToDateDisplay: string;
  budgetFullYearDisplay: string;
  status: PaceStatus;
}

/**
 * The track's width, near enough. Only two things use it and both are approximations that
 * err on the safe side: the axis-label collision check, and the floor below.
 *
 * This chart only ships inside the one-page sheet now, where it gets a half-page column
 * less its label / full-year / status columns — about 190px.
 */
const TRACK_PX = 190;

/**
 * No non-zero figure is drawn as nothing.
 *
 * A $716K row against a $120M axis is 0.6% — one pixel here — so a floor is applied to the
 * actual bar, and again to the budget bar BEYOND it when budget is the longer of the two.
 * That second floor is the one that matters: the two series share a track, so without it a
 * small row's blue would sit entirely under its green and the row would state one quantity
 * where it has two. Both exact figures are printed above and below the track regardless.
 */
const MIN_SEG_PCT = (5 / TRACK_PX) * 100;

export function BudgetBars({
  rows,
  title,
  summary,
  /** Formats an axis tick — the page owns formatting. */
  format,
  actualLabel = "Actual (YTD)",
  budgetLabel = "Budget (YTD)",
  referenceLabel = "Budget (full year)",
  unit = "Millions",
}: {
  rows: BudgetBarRow[];
  title: string;
  summary: string;
  format: (v: number) => string;
  actualLabel?: string;
  budgetLabel?: string;
  referenceLabel?: string;
  unit?: string;
}) {
  if (rows.length === 0) {
    return <ChartEmpty height={220}>Nothing to compare for this period yet.</ChartEmpty>;
  }

  // The axis ends at the largest figure on the chart rather than at the nice number above
  // it, so the longest row runs the full width of its track — see `fittedTicks`. On this
  // half-page sheet column a rounded-up axis was expensive: a fifth of a ~190px track.
  const ticks = fittedTicks(
    Math.max(...rows.flatMap((r) => [r.actual, r.budgetToDate, r.budgetFullYear]), 0),
    { count: 4, label: format, plotPx: TRACK_PX, gapPx: 8 },
  );
  const pct = (v: number) => (ticks.max === 0 ? 0 : Math.max(0, Math.min(v / ticks.max, 1)) * 100);

  return (
    <figure role="img" aria-label={`${title}. ${summary}`}>
      <span className="sr-only">{summary}</span>

      <div aria-hidden>
        {/* ---- legend ---- */}
        {/* The `data-bars-*` hooks are how the one-page sheet re-densifies this chart
            without a second copy of it existing — see the sheet section of globals.css. */}
        <ul data-bars-legend className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <li className="flex items-center gap-2 text-[11.5px] text-muted">
            <Swatch color="var(--color-viz-actual)" />
            {actualLabel}
          </li>
          <li className="flex items-center gap-2 text-[11.5px] text-muted">
            <Swatch color="var(--color-viz-budget)" />
            {budgetLabel}
          </li>
          <li className="flex items-center gap-2 text-[11.5px] text-muted">
            <Swatch color="var(--color-viz-reference)" dashed />
            {referenceLabel}
          </li>
        </ul>

        {/* ---- axis ---- */}
        <div data-bars-axis className="mb-1 flex items-end gap-3">
          <span
            data-bars-label
            className="w-[104px] flex-none text-[9.5px] font-semibold uppercase tracking-[0.05em] text-muted-2"
          >
            {unit}
          </span>
          {/* Ticks sit at their VALUE, not spread evenly: the axis ends on the data, so the
              last gap is a remainder and `justify-between` would misplace every label. */}
          <span className="relative h-3 flex-1">
            {ticks.values.map((v, i) => (
              <span
                key={v}
                className="absolute bottom-0 whitespace-nowrap text-[10px] tabular-nums text-viz-label"
                style={
                  i === 0
                    ? { left: 0 }
                    : i === ticks.values.length - 1
                      ? { left: "100%", transform: "translateX(-100%)" }
                      : { left: `${pct(v)}%`, transform: "translateX(-50%)" }
                }
              >
                {format(v)}
              </span>
            ))}
          </span>
          <span data-bars-ref className="w-[86px] flex-none" />
          <span data-bars-badge className="w-[92px] flex-none" />
        </div>

        {/* ---- rows ---- */}
        <ul className="flex flex-col">
          {rows.map((r) => {
            const actualPct = pct(r.actual);
            const budgetPct = pct(r.budgetToDate);
            const fullPct = pct(r.budgetFullYear);

            // Floored so a small source still draws both of its series — see MIN_SEG_PCT.
            const drawnActual = r.actual > 0 ? Math.max(actualPct, MIN_SEG_PCT) : 0;
            const drawnBudget =
              r.budgetToDate > 0
                ? budgetPct > actualPct
                  ? Math.max(budgetPct, drawnActual + MIN_SEG_PCT)
                  : Math.max(budgetPct, MIN_SEG_PCT)
                : 0;
            // The dashed run starts where the drawn bar ends, whichever series is longer.
            const barEnd = Math.max(drawnActual, drawnBudget);

            return (
              <li
                key={r.id}
                data-bars-row
                // The client asked for "improve spacing between rows" on the expenditure
                // card and got it here for both: 14px of vertical air and a hairline, so a
                // row is a unit rather than five things at similar heights.
                className="flex items-center gap-3 border-b border-line-soft py-3.5 last:border-b-0"
              >
                <span
                  data-bars-label
                  className="w-[104px] flex-none text-[11.5px] font-medium leading-tight text-ink-muted"
                  title={r.label}
                >
                  {r.label}
                </span>

                <span className="relative min-w-0 flex-1">
                  {/* the value labels sit above and below the track, not at the bar end,
                      so two nearly equal figures never collide */}
                  <span data-bars-value className="mb-[3px] block h-[13px]">
                    <span
                      className="absolute text-[10.5px] font-semibold tabular-nums text-strong"
                      style={{ left: `min(${drawnActual}%, calc(100% - 3.5rem))` }}
                    >
                      {r.actualDisplay}
                    </span>
                  </span>

                  <span data-bars-track className="relative block h-[11px] rounded-full bg-line-soft">
                    {/* Budget to date, underneath. */}
                    {drawnBudget > 0 && (
                      <span
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{
                          width: `${drawnBudget}%`,
                          background: "var(--color-viz-budget)",
                        }}
                      />
                    )}
                    {/* Actual, painted over it — the overlap IS the comparison. */}
                    {drawnActual > 0 && (
                      <span
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{
                          width: `${drawnActual}%`,
                          background: "var(--color-viz-actual)",
                        }}
                      />
                    )}
                    {/* The full-year reference: a dashed run to a hollow marker. The marker
                        is held half its own width inside the track, because the axis now
                        ends ON the largest full-year figure and that row's marker would
                        otherwise be drawn hanging off the end of its own track. */}
                    {fullPct > barEnd && (
                      <>
                        <span
                          className="absolute top-1/2 h-0 -translate-y-1/2 border-t border-dashed border-viz-reference"
                          style={{ left: `${barEnd}%`, width: `${fullPct - barEnd}%` }}
                        />
                        <span
                          className="absolute top-1/2 h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-viz-reference bg-white"
                          style={{ left: `min(${fullPct}%, calc(100% - 5px))` }}
                        />
                      </>
                    )}
                  </span>

                  <span data-bars-value className="mt-[3px] block h-[13px]">
                    <span
                      className="absolute text-[10.5px] tabular-nums text-brand"
                      style={{ left: `min(${drawnBudget}%, calc(100% - 3.5rem))` }}
                    >
                      {r.budgetToDateDisplay}
                    </span>
                  </span>
                </span>

                <span
                  data-bars-ref
                  className="w-[86px] flex-none text-right text-[11.5px] font-medium tabular-nums text-muted"
                >
                  {r.budgetFullYearDisplay}
                </span>

                <span data-bars-badge className="flex w-[92px] flex-none justify-end">
                  <StatusBadge
                    status={r.status.rung}
                    label={r.status.label}
                    size="sm"
                    dot={false}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* The same numbers as text, for a reader who cannot use the bars. */}
      <div className="sr-only">
        <table>
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col">{actualLabel}</th>
            <th scope="col">{budgetLabel}</th>
            <th scope="col">{referenceLabel}</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row">{r.label}</th>
              <td>{r.actualDisplay}</td>
              <td>{r.budgetToDateDisplay}</td>
              <td>{r.budgetFullYearDisplay}</td>
              <td>{r.status.label}</td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
    </figure>
  );
}

/**
 * The same track, without the reference or the badge — §7.2's "replace the pie chart with
 * horizontal bars" and §5's Expenditures by Object.
 *
 * A donut asks the reader to compare angles; a ranked bar list asks them to compare
 * lengths, which is the comparison people are actually good at. The share is printed
 * because a bar chart of shares that does not print them makes the reader estimate the one
 * number the chart exists to give them.
 */
export function ShareBars({
  rows,
  title,
  summary,
}: {
  rows: { id: string; label: string; value: number; display: string; share: string; color: string }[];
  title: string;
  summary: string;
}) {
  if (rows.length === 0) {
    return <ChartEmpty height={180}>Nothing to break down for this period yet.</ChartEmpty>;
  }
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;

  return (
    <figure role="img" aria-label={`${title}. ${summary}`}>
      <span className="sr-only">{summary}</span>
      {/*
       * A CONTAINER query, not a viewport one, and that distinction is the whole fix.
       *
       * The row used to be four fixed columns — 122px label, 74px figure, 52px share, 36px
       * of gaps — with the bar taking whatever was left. That is 284px of track that cannot
       * shrink, and this component is dropped into cards from ~290px (Cash composition, a
       * 0.85fr column) to ~600px (Revenues by source) wide. In the narrow card the bar's
       * `flex-1` collapsed to nothing — the chart drew no bars at all — and the fixed
       * columns still pushed the row past the card's edge. No viewport breakpoint can see
       * that, because the viewport was wide; the CARD was not.
       *
       * So: under 28rem of available width the bar takes its own full-width line beneath the
       * figures, which is the only layout that keeps the mark visible at that size. Above it
       * the original single-line row is unchanged.
       */}
      <ul aria-hidden className="@container flex flex-col gap-3">
        {rows.map((r) => (
          <li
            key={r.id}
            className="grid grid-cols-[minmax(0,1fr)_auto_46px] items-center gap-x-3 gap-y-1.5 @md:grid-cols-[minmax(80px,122px)_minmax(56px,1fr)_74px_52px]"
          >
            <span
              className="min-w-0 truncate text-[11.5px] text-ink-muted @md:col-start-1 @md:row-start-1"
              title={r.label}
            >
              {r.label}
            </span>
            <span className="text-right text-[11.5px] font-semibold tabular-nums text-ink @md:col-start-3 @md:row-start-1">
              {r.display}
            </span>
            <span className="text-right text-[11px] tabular-nums text-muted-2 @md:col-start-4 @md:row-start-1">
              {r.share}
            </span>
            <span className="relative col-span-3 h-[11px] min-w-0 rounded-full bg-line-soft @md:col-span-1 @md:col-start-2 @md:row-start-1">
              <span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${Math.max((r.value / max) * 100, r.value > 0 ? 2 : 0)}%`,
                  background: r.color,
                }}
              />
            </span>
          </li>
        ))}
      </ul>
      <div className="sr-only">
        <table>
        <caption>{title}</caption>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row">{r.label}</th>
              <td>{r.display}</td>
              <td>{r.share}</td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
    </figure>
  );
}

/**
 * A hairline-separated key/value strip — used under the trend charts.
 *
 * WHY THE COLUMN COUNT IS A CONTAINER QUERY AND NOTHING TRUNCATES
 *
 * `sm:grid-cols-4` was a VIEWPORT query, and the viewport is never what is short of room
 * here — the CARD is. On a wide screen the strip therefore always laid out four columns,
 * including inside a one-third-width column where a cell is ~85px, and `truncate` then did
 * exactly what it was asked to: "REMAINING TO COLLECT" came out "REMAINING TO COLL…" and
 * the note under it lost its tail. That was the client's "the numbers are truncated".
 *
 * So the count now follows the strip's own width, and a label that still does not fit wraps
 * onto a second line instead of being cut. A strip one line taller costs nothing; a figure
 * a superintendent cannot read costs the card its purpose.
 */
export function MetricStrip({
  items,
  cols = 4,
  className,
}: {
  items: {
    label: string;
    value: string;
    note?: string;
    tone?: "positive" | "negative" | "neutral";
  }[];
  cols?: 3 | 4 | 5;
  className?: string;
}) {
  // The redesign's rail inks — the same pair OverviewMetricRail sets on its figures.
  const TONE = {
    positive: "text-[#1a932e]",
    negative: "text-[#fd4438]",
    neutral: "text-[#1f1f21]",
  };
  // Container breakpoints, not viewport ones: the strip goes wide only when the card it
  // sits in is wide enough to spell every label out.
  const GRID = {
    3: "@xs:grid-cols-3",
    4: "@sm:grid-cols-4",
    5: "@md:grid-cols-5",
  } as const;
  return (
    <div className="@container">
      <dl
        className={cn(
          // The redesign's white metric rail (Figma 3:12428) at strip scale: solid white on
          // the translucent card, the rail's #e7e7e7 border, #ebebeb hairlines between cells.
          "grid grid-cols-2 divide-x divide-[#ebebeb] rounded-[16px] border border-[#e7e7e7] bg-white",
          GRID[cols],
          className,
        )}
      >
        {items.map((i) => (
          <div key={i.label} className="min-w-0 px-3 py-2.5">
            <dt className="text-[11px] font-medium leading-tight text-[#1f1f21]">{i.label}</dt>
            <dd
              className={cn(
                "mt-1 text-[16px] font-medium leading-tight tabular-nums",
                TONE[i.tone ?? "neutral"],
              )}
            >
              {i.value}
            </dd>
            {i.note && (
              <dd className="mt-0.5 text-[10.5px] leading-snug text-[#1f1f21]/[0.74]">
                {i.note}
              </dd>
            )}
          </div>
        ))}
      </dl>
    </div>
  );
}
