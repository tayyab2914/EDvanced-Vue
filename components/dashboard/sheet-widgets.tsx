import { cn } from "@/lib/cn";
import {
  annularSector,
  donutGeometry,
  DONUT,
} from "@/components/dashboard/overview-widgets";
import {
  ACCENT,
  PILL,
  HATCH,
  HATCH_SWATCH,
} from "@/components/dashboard/overview-budget-card";
import type { BudgetBarRow } from "@/components/dashboard/charts/budget-bars";
import { fittedTicks } from "@/lib/dashboard/scale";

/**
 * The one-page summary sheet's versions of the executive dashboard's two composition
 * widgets — the Revenue Collected half-gauge and the Budget Status donut.
 *
 * Compact rather than reused: the screen widgets are laid out for a 364px column with
 * absolute positioning tuned to a 255px canvas, which is a third of the sheet's height
 * budget for the whole band. These redraw the same geometry (the arc helpers are imported
 * from overview-widgets.tsx, not copied) at sheet scale, with the same colours, so the
 * printed chart is the screen chart smaller — never a different chart.
 *
 * No `.anim-*` classes and no `data-reveal`: the sheet has no RevealManager, and a chart
 * that prints mid-entrance is a chart that prints wrong.
 */

const NUMS = "[font-variant-numeric:proportional-nums]";

/* ------------------------------------------------------------------ *
 * Revenue Collected — the half-gauge at sheet scale
 * ------------------------------------------------------------------ */

export function SheetRevenueCollected({
  collectedDisplay,
  ofDisplay,
  remainingDisplay,
  collectedPct,
}: {
  /** Pre-formatted collections to date — the gauge's centre and the left stat. */
  collectedDisplay: string;
  /** "of $208.9M" — omitted when there is no revenue budget to divide by. */
  ofDisplay?: string;
  remainingDisplay: string;
  /** Collected as a % of the full-year budget. `null` renders the gauge empty. */
  collectedPct: number | null;
}) {
  const f = collectedPct === null ? 0 : Math.max(0, Math.min(1, collectedPct / 100));
  // The screen gauge's proportions (89.936 radius, 12.662 ring) at a 128px width.
  const R = 64;
  const r = R - 9;
  return (
    <div className="flex h-full flex-col items-center justify-between gap-[6px]">
      <div className="relative h-[64px] w-[128px]">
        <svg aria-hidden width="128" height="64" viewBox="0 0 128 64" fill="none">
          <path d={annularSector(R, R, R, r, 180, 360)} fill="black" opacity="0.15" />
          {f > 0 && (
            <path
              d={annularSector(R, R, R, r, 180, 180 + f * 180)}
              fill="url(#sheet-gauge-grad)"
            />
          )}
          <defs>
            <linearGradient id="sheet-gauge-grad" x1="0" y1="0" x2="1" y2="0">
              <stop stopColor="#026E78" />
              <stop offset="1" stopColor="#038C8C" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-px whitespace-nowrap text-center">
          <p className={cn("text-[13.5px] font-bold leading-[1.15] text-black/85", NUMS)}>
            {collectedDisplay}
          </p>
          {ofDisplay && (
            <p className="text-[8px] font-semibold leading-[1.3] text-black/[0.45]">
              {ofDisplay}
            </p>
          )}
        </div>
        <p className="absolute -left-[10px] bottom-0 text-[8px] leading-none text-black/[0.45]">0</p>
        <p className="absolute -right-[18px] bottom-0 text-[8px] leading-none text-black/[0.45]">
          100%
        </p>
      </div>

      <div className="flex w-full items-end justify-between">
        <div className="flex flex-col items-start gap-px">
          <p className={cn("text-[12.5px] font-semibold leading-[1.2] text-[#31baae]", NUMS)}>
            {collectedDisplay}
          </p>
          <p className="text-[8px] leading-[1.3] text-[#797979]">Collected</p>
        </div>
        {collectedPct !== null && (
          <p className={cn("pb-[10px] text-[9px] font-semibold text-black/[0.59]", NUMS)}>
            {collectedPct.toFixed(1)}% collected
          </p>
        )}
        <div className="flex flex-col items-end gap-px">
          <p className={cn("text-[12.5px] font-semibold leading-[1.2] text-[#4b4b4b]", NUMS)}>
            {remainingDisplay}
          </p>
          <p className="text-[8px] leading-[1.3] text-[#797979]">Remaining</p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Revenues / Expenditures vs Budget — the redesigned bars at sheet scale
 * ------------------------------------------------------------------ */

/**
 * The OverviewBudgetCard's chart, redrawn for a half-sheet column. Same grammar, same
 * palette (ACCENT / PILL / HATCH are imported from the card, never copied): the actual
 * segment, the blue budget-to-date chip 2px after it, the hatch out toward the full-year
 * position, a figure that cannot fit inside its segment floating after the bars in its
 * series' ink, then the full-year column and the status pill.
 *
 * Numbers are scaled to the sheet: the card draws a 28px track in a ~560px column with
 * 14px type; this draws a 14px track in a ~270px column with 8.5px type. The fit estimates
 * below are the card's own trick at those sizes — a Server Component cannot measure text,
 * so character-count × glyph-width, deliberately UNDER the track's real width, and a label
 * judged not to fit steps outside its segment, which errs on the readable side.
 */
const BAR_TRACK_PX = 250;
const estInsidePx = (s: string) => s.length * 4.4 + 8;
const estOutsidePx = (s: string) => s.length * 4.8 + 2;
const MIN_SEG_PCT = 2.6;
const MIN_HATCH_PX = 14;
const GAP_PX = 5;

export function SheetBudgetBars({
  rows,
  accent,
  title,
  summary,
  format,
  unit = "Millions",
}: {
  rows: BudgetBarRow[];
  /** green = revenues, purple = expenditures — the two cards' only difference. */
  accent: keyof typeof ACCENT;
  title: string;
  summary: string;
  /** Formats an axis tick — the page owns formatting, as everywhere. */
  format: (v: number) => string;
  unit?: string;
}) {
  const a = ACCENT[accent];

  if (rows.length === 0) {
    return <p className="py-6 text-center text-[9.5px] text-muted-2">Nothing to compare.</p>;
  }

  const ticks = fittedTicks(
    Math.max(...rows.flatMap((r) => [r.actual, r.budgetToDate, r.budgetFullYear]), 0),
    { count: 4, label: format, plotPx: BAR_TRACK_PX, gapPx: 8 },
  );
  const pct = (v: number) => (ticks.max === 0 ? 0 : Math.max(0, Math.min(v / ticks.max, 1)) * 100);

  const COLS = "grid grid-cols-[76px_minmax(0,1fr)_46px_52px] gap-x-[6px]";

  return (
    <figure role="img" aria-label={`${title}. ${summary}`}>
      <span className="sr-only">{summary}</span>

      <div aria-hidden>
        {/* ---- legend ---- */}
        <ul className="mb-[4px] flex items-center gap-[10px]">
          <li className="flex items-center gap-[4px]">
            <span className={cn("size-[7px] rounded-[2px]", a.swatch)} />
            <span className="text-[7.5px] leading-[9px] text-[#060606]/[0.56]">Actual (YTD)</span>
          </li>
          <li className="flex items-center gap-[4px]">
            <span className="size-[7px] rounded-[2px] bg-[rgba(6,109,255,0.6)]" />
            <span className="text-[7.5px] leading-[9px] text-[#060606]/[0.56]">Budget (YTD)</span>
          </li>
          <li className="flex items-center gap-[4px]">
            <span className="size-[7px] rounded-[2px]" style={HATCH_SWATCH} />
            <span className="text-[7.5px] leading-[9px] text-[#060606]/[0.56]">
              Budget Full year
            </span>
          </li>
        </ul>

        {/* ---- axis header ---- */}
        <div className={cn(COLS, "h-[15px] items-end border-b border-black/[0.11] pb-[2px]")}>
          <span className="text-[7.5px] leading-[9px] text-[#060606]/[0.56]">{unit}</span>
          <span className="relative self-stretch">
            {ticks.values.map((v, i) => (
              <span
                key={v}
                className="absolute bottom-[2px] whitespace-nowrap text-[7.5px] leading-[9px] text-[#060606]/[0.56]"
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
          <span className="text-[7.5px] leading-[9px] text-[#060606]">Full year</span>
          <span className="text-right text-[7.5px] leading-[9px] text-[#060606]">Status</span>
        </div>

        {/* ---- rows ---- */}
        <ul className="mt-[3px] flex flex-col">
          {rows.map((r) => {
            const actualPct = pct(r.actual);
            const budgetPct = pct(r.budgetToDate);
            const fullPct = pct(r.budgetFullYear);

            // The card's grammar, at its scale — see OverviewBudgetCard for the reasoning.
            const drawnActual = r.actual > 0 ? Math.max(actualPct, MIN_SEG_PCT) : 0;
            const hasChip = budgetPct > actualPct;
            const chipEnd = hasChip ? Math.max(budgetPct, drawnActual + MIN_SEG_PCT) : drawnActual;
            const chipWidth = chipEnd - drawnActual;
            const barEnd = chipEnd;

            const actualFits =
              r.actual > 0 && (drawnActual / 100) * BAR_TRACK_PX >= estInsidePx(r.actualDisplay);
            const budgetFits =
              chipWidth > 0 &&
              (chipWidth / 100) * BAR_TRACK_PX >= estInsidePx(r.budgetToDateDisplay);

            const floated: { key: string; text: string; ink: string; left: number }[] = [];
            let run = GAP_PX;
            const float = (key: string, text: string, ink: string) => {
              floated.push({ key, text, ink, left: run });
              run += estOutsidePx(text) + GAP_PX;
            };
            if (!actualFits) float("actual", r.actualDisplay, a.inkOff);
            if (!budgetFits && r.budgetToDate > 0)
              float("budget", r.budgetToDateDisplay, "text-[#066dff]");

            const clearancePx = floated.length ? run : 3;
            const hatchOffset = `${barEnd}% + ${clearancePx}px`;

            return (
              <li key={r.id} className={cn(COLS, "min-h-[24px] items-center py-[1px]")}>
                <span
                  className="text-[8.5px] leading-[1.15] text-[#060606]"
                  title={r.label}
                >
                  {r.label}
                </span>

                {/* the track: white, 14px, 4px radius — segments painted inside it */}
                <span className="relative block h-[14px] rounded-[4px] bg-white">
                  {drawnActual > 0 && (
                    <span
                      className={cn("absolute inset-y-0 left-0 rounded-[4px]", a.bar)}
                      style={{ width: `${drawnActual}%` }}
                    />
                  )}
                  {chipWidth > 0 && (
                    <span
                      className="absolute inset-y-0 rounded-[4px] bg-[rgba(6,109,255,0.4)]"
                      style={{
                        left: `calc(${drawnActual}% + 1px)`,
                        width: `calc(${chipWidth}% - 1px)`,
                      }}
                    />
                  )}
                  {fullPct > barEnd && (
                    <span
                      className="absolute inset-y-0 rounded-[4px]"
                      style={{
                        ...HATCH,
                        left: `calc(${hatchOffset})`,
                        width: `min(max(${MIN_HATCH_PX}px, calc(${fullPct - barEnd}% - ${clearancePx}px)), calc(100% - (${hatchOffset})))`,
                      }}
                    />
                  )}

                  {actualFits && (
                    <span
                      className={cn(
                        "absolute left-[4px] top-1/2 -translate-y-1/2 whitespace-nowrap text-[7.5px] leading-[9px]",
                        a.inkOn,
                      )}
                    >
                      {r.actualDisplay}
                    </span>
                  )}
                  {budgetFits && (
                    <span
                      className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[7.5px] leading-[9px] text-[#066dff]"
                      style={{ left: `calc(${drawnActual}% + 5px)` }}
                    >
                      {r.budgetToDateDisplay}
                    </span>
                  )}
                  {floated.map((f) => (
                    <span
                      key={f.key}
                      className={cn(
                        "absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[8px] leading-[9px] font-semibold",
                        f.ink,
                      )}
                      style={{ left: `calc(${barEnd}% + ${f.left}px)` }}
                    >
                      {f.text}
                    </span>
                  ))}
                </span>

                <span className="text-[8.5px] leading-[10px] text-[#060606]">
                  {r.budgetFullYearDisplay}
                </span>

                <span className="flex justify-end">
                  <span
                    className={cn(
                      "whitespace-nowrap rounded-[20px] px-[5px] py-[2px] text-[7.5px] leading-[normal] tracking-[0.08px]",
                      PILL[r.status.label],
                    )}
                  >
                    {r.status.label}
                  </span>
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
              <th scope="col">Actual (YTD)</th>
              <th scope="col">Budget (YTD)</th>
              <th scope="col">Budget (full year)</th>
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

/* ------------------------------------------------------------------ *
 * Budget Status — the donut at sheet scale, legend beside it
 * ------------------------------------------------------------------ */

export function SheetBudgetStatus({
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
  const SIZE = 104;
  const paths = donutGeometry(expended, encumbered, remaining, {
    size: SIZE,
    thickness: 25,
    rc: 4,
  });

  const legend = [
    { label: "Expended", value: expendedDisplay, color: DONUT.expended },
    { label: "Encumbered", value: encumberedDisplay, color: DONUT.encumbered },
    { label: "Remaining", value: remainingDisplay, color: DONUT.remaining },
  ];

  return (
    <div className="flex h-full items-center justify-center gap-[16px]">
      <div className="relative flex-none" style={{ width: SIZE, height: SIZE }}>
        <svg
          aria-hidden
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          fill="none"
          className="absolute inset-0"
        >
          {paths.map((p) => p.d && <path key={p.key} d={p.d} fill={p.color} />)}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <p className={cn("text-[10.5px] font-semibold text-[#060606]", NUMS)}>
            {totalDisplay}
          </p>
        </div>
      </div>

      <dl className="flex min-w-0 flex-col gap-[7px]">
        <div className="flex flex-col gap-px">
          <dt className="text-[8px] leading-[1.3] text-[#797979]">Total budget</dt>
          <dd className={cn("text-[12.5px] font-semibold leading-[1.2] text-[#060606]", NUMS)}>
            {totalDisplay}
          </dd>
        </div>
        {legend.map((l) => (
          <div key={l.label} className="flex flex-col gap-px">
            <dt className="flex items-center gap-[4px] text-[8px] leading-[1.3] text-[#797979]">
              <span
                aria-hidden
                className="size-[6px] flex-none rounded-full"
                style={{ background: l.color }}
              />
              {l.label}
            </dt>
            <dd
              className={cn("text-[11px] font-semibold leading-[1.2]", NUMS)}
              style={{ color: l.color }}
            >
              {l.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
