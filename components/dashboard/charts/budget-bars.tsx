import { niceTicks } from "@/lib/dashboard/scale";
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

  const ticks = niceTicks(
    0,
    Math.max(...rows.flatMap((r) => [r.actual, r.budgetToDate, r.budgetFullYear]), 0),
    { count: 4 },
  );
  const pct = (v: number) => (ticks.max === 0 ? 0 : Math.max(0, Math.min(v / ticks.max, 1)) * 100);

  return (
    <figure role="img" aria-label={`${title}. ${summary}`}>
      <span className="sr-only">{summary}</span>

      <div aria-hidden>
        {/* ---- legend ---- */}
        <ul className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
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
        <div className="mb-1 flex items-end gap-3">
          <span className="w-[104px] flex-none text-[9.5px] font-semibold uppercase tracking-[0.05em] text-muted-2">
            {unit}
          </span>
          <span className="relative flex-1">
            <span className="flex justify-between text-[10px] tabular-nums text-viz-label">
              {ticks.values.map((v) => (
                <span key={v}>{format(v)}</span>
              ))}
            </span>
          </span>
          <span className="w-[86px] flex-none" />
          <span className="w-[92px] flex-none" />
        </div>

        {/* ---- rows ---- */}
        <ul className="flex flex-col">
          {rows.map((r) => {
            const actualPct = pct(r.actual);
            const budgetPct = pct(r.budgetToDate);
            const fullPct = pct(r.budgetFullYear);
            // The dashed run starts where the drawn bar ends, whichever series is longer.
            const barEnd = Math.max(actualPct, budgetPct);

            return (
              <li
                key={r.id}
                // The client asked for "improve spacing between rows" on the expenditure
                // card and got it here for both: 14px of vertical air and a hairline, so a
                // row is a unit rather than five things at similar heights.
                className="flex items-center gap-3 border-b border-line-soft py-3.5 last:border-b-0"
              >
                <span
                  className="w-[104px] flex-none text-[11.5px] font-medium leading-tight text-ink-muted"
                  title={r.label}
                >
                  {r.label}
                </span>

                <span className="relative min-w-0 flex-1">
                  {/* the value labels sit above and below the track, not at the bar end,
                      so two nearly equal figures never collide */}
                  <span className="mb-[3px] block h-[13px]">
                    <span
                      className="absolute text-[10.5px] font-semibold tabular-nums text-strong"
                      style={{ left: `min(${actualPct}%, calc(100% - 3.5rem))` }}
                    >
                      {r.actualDisplay}
                    </span>
                  </span>

                  <span className="relative block h-[11px] rounded-full bg-line-soft">
                    {/* Budget to date, underneath. */}
                    <span
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: `${budgetPct}%`,
                        background: "var(--color-viz-budget)",
                      }}
                    />
                    {/* Actual, painted over it — the overlap IS the comparison. */}
                    <span
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: `${actualPct}%`,
                        background: "var(--color-viz-actual)",
                      }}
                    />
                    {/* The full-year reference: a dashed run to a hollow marker. */}
                    {fullPct > barEnd && (
                      <>
                        <span
                          className="absolute top-1/2 h-0 -translate-y-1/2 border-t border-dashed border-viz-reference"
                          style={{ left: `${barEnd}%`, width: `${fullPct - barEnd}%` }}
                        />
                        <span
                          className="absolute top-1/2 h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-viz-reference bg-white"
                          style={{ left: `${fullPct}%` }}
                        />
                      </>
                    )}
                  </span>

                  <span className="mt-[3px] block h-[13px]">
                    <span
                      className="absolute text-[10.5px] tabular-nums text-brand"
                      style={{ left: `min(${budgetPct}%, calc(100% - 3.5rem))` }}
                    >
                      {r.budgetToDateDisplay}
                    </span>
                  </span>
                </span>

                <span className="w-[86px] flex-none text-right text-[11.5px] font-medium tabular-nums text-muted">
                  {r.budgetFullYearDisplay}
                </span>

                <span className="flex w-[92px] flex-none justify-end">
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
      <table className="sr-only">
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
      <ul aria-hidden className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3">
            <span
              className="w-[122px] flex-none truncate text-[11.5px] text-ink-muted"
              title={r.label}
            >
              {r.label}
            </span>
            <span className="relative h-[11px] min-w-0 flex-1 rounded-full bg-line-soft">
              <span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${Math.max((r.value / max) * 100, r.value > 0 ? 2 : 0)}%`,
                  background: r.color,
                }}
              />
            </span>
            <span className="w-[74px] flex-none text-right text-[11.5px] font-semibold tabular-nums text-ink">
              {r.display}
            </span>
            <span className="w-[52px] flex-none text-right text-[11px] tabular-nums text-muted-2">
              {r.share}
            </span>
          </li>
        ))}
      </ul>
      <table className="sr-only">
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
    </figure>
  );
}

/** A hairline-separated key/value strip — used under the trend charts. */
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
  const TONE = {
    positive: "text-strong",
    negative: "text-action",
    neutral: "text-ink",
  };
  const GRID = {
    3: "sm:grid-cols-3",
    4: "sm:grid-cols-4",
    5: "sm:grid-cols-5",
  } as const;
  return (
    <dl
      className={cn(
        "grid grid-cols-2 divide-x divide-line-soft rounded-lg border border-line-soft",
        GRID[cols],
        className,
      )}
    >
      {items.map((i) => (
        <div key={i.label} className="min-w-0 px-3 py-2.5">
          <dt className="truncate text-[9.5px] font-semibold uppercase tracking-[0.05em] text-muted-2">
            {i.label}
          </dt>
          <dd
            className={cn(
              "mt-1 truncate text-[15px] font-semibold tabular-nums",
              TONE[i.tone ?? "neutral"],
            )}
          >
            {i.value}
          </dd>
          {i.note && <dd className="mt-0.5 truncate text-[10.5px] text-muted-2">{i.note}</dd>}
        </div>
      ))}
    </dl>
  );
}
