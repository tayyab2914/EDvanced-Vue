import Link from "next/link";
import { fittedTicks } from "@/lib/dashboard/scale";
import { cn } from "@/lib/cn";
import { CARD_TITLE, CARD_SUBTITLE } from "@/components/dashboard/type-scale";
import { ChartEmpty } from "@/components/dashboard/charts/chrome";
import type { BudgetBarRow } from "@/components/dashboard/charts/budget-bars";
import type { PaceLabel } from "@/lib/dashboard/pace";

/**
 * "Revenues vs Budget (YTD)" and "Expenditures vs Budget (YTD)" — a transcription of Figma
 * nodes 3:11828 and 3:12063, the two chart cards of the executive redesign's middle band.
 *
 * Every measurement, colour and radius is the design's, read off the exported assets:
 * the actual series is #1A932E at 40% on the revenue card and solid #8E62EF on the
 * expenditure card (that is why one card's bar labels are dark green and the other's are
 * white); the budget-to-date chip is #066DFF at 40% with its figure in full-strength
 * #066DFF; the full-year run is the hatch — black at 20% in 2px stripes on a 4px pitch,
 * rising ~20° to the right, exactly the angle of the design's "Subtract" pattern.
 *
 * Two things are deliberately NOT the design's:
 *
 *   1. THE GEOMETRY IS COMPUTED, NOT TRACED. The mockup's bars are frozen at its sample
 *      figures; these take their widths from the district's rows. The design's own grammar
 *      is kept — actual, then the budget chip 2px after it, then the hatch out to the
 *      full-year position — and a label that cannot fit inside its segment steps outside
 *      it in the series' ink, which is how the mockup handles its own $0 rows.
 *   2. FONT AND SPELLING. The mockup sets "Aeonik Pro TRIAL" (a trial licence — see
 *      overview-kpi.tsx) and letters its legend "(YDT)". Neither typo nor trial font ships.
 *
 * Still a Server Component with no state, like the BudgetBars it replaces on this page —
 * the one-page summary sheet draws the same design at sheet scale (SheetBudgetBars in
 * sheet-widgets.tsx), reading its palette from the exports below.
 */

/**
 * The two cards' accents, row pills and full-year hatch — exported for the one-page
 * summary sheet's compact redraw of these bars (components/dashboard/sheet-widgets.tsx),
 * so the printed chart and the screen chart read off one palette.
 */
export const ACCENT = {
  green: {
    bar: "bg-[rgba(26,147,46,0.4)]",
    /** Ink for the actual figure when it sits ON the bar / outside it. */
    inkOn: "text-[#1a932e]",
    inkOff: "text-[#1a932e]",
    swatch: "bg-[rgba(26,147,46,0.6)]",
  },
  purple: {
    bar: "bg-[#8e62ef]",
    inkOn: "text-white",
    inkOff: "text-[#8e62ef]",
    swatch: "bg-[#8e62ef]",
  },
} as const;

/** The design's row pills — red for Critical, orange for the Monitor pair, green for good news. */
export const PILL: Record<PaceLabel, string> = {
  Critical: "bg-[rgba(238,32,28,0.18)] text-[#ee201c]",
  "Over Budget": "bg-[rgba(230,95,43,0.18)] text-[#e65f2b]",
  Behind: "bg-[rgba(230,95,43,0.18)] text-[#e65f2b]",
  Ahead: "bg-[rgba(26,147,46,0.18)] text-[#1a932e]",
  "On Target": "bg-[rgba(26,147,46,0.18)] text-[#1a932e]",
  "N/A": "bg-black/[0.08] text-[#060606]",
};

/** Black 20% stripes, 2px on a 4px pitch, rising ~20° — the exported hatch, as CSS. */
export const HATCH = {
  backgroundImage:
    "repeating-linear-gradient(160deg, rgba(0,0,0,0.2) 0px, rgba(0,0,0,0.2) 2px, transparent 2px, transparent 4px)",
};
export const HATCH_SWATCH = {
  backgroundImage:
    "repeating-linear-gradient(160deg, rgba(0,0,0,0.2) 0px, rgba(0,0,0,0.2) 1.5px, transparent 1.5px, transparent 3.5px)",
};

/**
 * The vuesax arrow-right of the "Go to …" pill — 12.33×9.09, verbatim from the export.
 * The design's icon instance carries a −45° rotation, so the pill's arrow points ↗.
 */
function ArrowGlyph({ color, className }: { color: string; className?: string }) {
  return (
    <svg
      aria-hidden
      width="12.333"
      height="9.093"
      viewBox="0 0 12.3333 9.09334"
      fill="none"
      className={className}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.43311 0.146453C7.62838 -0.0488088 7.94496 -0.0488088 8.14022 0.146453L12.1869 4.19312C12.2807 4.28689 12.3333 4.41407 12.3333 4.54667C12.3333 4.67928 12.2807 4.80646 12.1869 4.90023L8.14022 8.94689C7.94496 9.14216 7.62838 9.14216 7.43311 8.94689C7.23785 8.75163 7.23785 8.43505 7.43311 8.23979L11.1262 4.54667L7.43311 0.85356C7.23785 0.658298 7.23785 0.341715 7.43311 0.146453Z"
        fill={color}
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M0 4.54667C0 4.27053 0.223858 4.04667 0.5 4.04667H11.72C11.9961 4.04667 12.22 4.27053 12.22 4.54667C12.22 4.82282 11.9961 5.04667 11.72 5.04667H0.5C0.223858 5.04667 0 4.82282 0 4.54667Z"
        fill={color}
      />
    </svg>
  );
}

/** The four columns, shared by the axis header and every row so nothing can drift. */
const COLS = "grid grid-cols-[150px_minmax(0,1fr)_114px_92px]";

/**
 * The fit check for a bar's own figure. A Server Component cannot measure text, so these
 * estimate the label's width from its character count — the inside labels at the design's
 * 10px, the outside ones at its 12px — against the track's likely width. The same order of
 * approximation the design itself froze into its samples; a label judged not to fit steps
 * OUTSIDE its segment, which errs on the readable side.
 */
// Deliberately UNDER the track's real width — this is the NARROWEST the band is laid out
// at, roughly what a 1280 laptop gives the card, against ~560px on a wide monitor. Both
// readers of this figure fail the same way if it flatters the layout: a label judged to fit
// inside a bar that is really narrower gets clipped by it ($16.01M came out "$16.0"), and
// an axis tick judged clear of the end label really overprints it ("$100M$120M"). Both were
// live at 1280 while this said 420. Under-estimating only floats a figure that would just
// have squeezed in, or drops a tick that would just have fitted.
const TRACK_PX = 260;
const estInsidePx = (s: string) => s.length * 5.6 + 10;
const estOutsidePx = (s: string) => s.length * 6.4 + 2;

/**
 * A drawn segment is never allowed to vanish.
 *
 * These cards put a $716K row and a $120M row on one axis, which is the point — the whole
 * comparison is between sources — but it means the bottom of the list is drawn at a
 * fraction of a percent. Two things keep it visible, and they work together:
 *
 *   1. THE AXIS ENDS AT THE DATA (see `fittedTicks`). A $120M largest figure used to round
 *      out to a $150M axis, spending a fifth of every track on space nothing occupies.
 *   2. A NON-ZERO SEGMENT IS FLOORED. Below about 7px a bar reads as nothing at all, and a
 *      chart that hides a real figure is worse than one that slightly widens it — the same
 *      call the Budget Status donut makes for its thinnest slice. The floor is applied to
 *      the actual bar and AGAIN to the budget chip beyond it, so a row where both figures
 *      are small still shows two segments in the right order rather than one sliver; the
 *      exact figures are printed beside them either way.
 *
 * The floor is a share of the track rather than a pixel count, because the track is fluid:
 * 2.6% is ~7px on the narrowest layout and ~15px on a wide monitor, which is the right
 * direction — a wider card can afford a more generous minimum mark.
 *
 * The hatch keeps the design's own 21px token. So every row states all three quantities it
 * has: what was collected, what was expected by now, and that a full-year budget exists
 * beyond both.
 */
const MIN_SEG_PCT = 2.6;
const MIN_HATCH_PX = 21;
/** The design's own gaps: ~4px from the bars to the hatch, ~7px around a floated figure. */
const GAP_PX = 7;

export function OverviewBudgetCard({
  title,
  subtitle,
  ctaLabel,
  ctaHref,
  accent,
  rows,
  format,
  chartTitle,
  summary,
  unit = "Millions",
}: {
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  /** green = revenues, purple = expenditures — the two cards' only difference. */
  accent: keyof typeof ACCENT;
  rows: BudgetBarRow[];
  /** Formats an axis tick — the page owns formatting. */
  format: (v: number) => string;
  /** For the figure/table exposed to assistive tech. */
  chartTitle: string;
  summary: string;
  unit?: string;
}) {
  const a = ACCENT[accent];

  // The axis ends at the largest figure on the card — usually a full-year budget — so the
  // longest row runs the full width of its track and every smaller one is read against it.
  const ticks = fittedTicks(
    Math.max(...rows.flatMap((r) => [r.actual, r.budgetToDate, r.budgetFullYear]), 0),
    { count: 5, label: format, plotPx: TRACK_PX },
  );
  const pct = (v: number) => (ticks.max === 0 ? 0 : Math.max(0, Math.min(v / ticks.max, 1)) * 100);

  return (
    <section data-reveal className="relative overflow-clip rounded-[14px] bg-white/[0.62] p-[18px]">
      {/* ---- header: title + "Go to …" pill on the left, the legend on the right ---- */}
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-[14px]">
            <h2 className={cn("whitespace-nowrap", CARD_TITLE)}>
              {title}
            </h2>
            <Link
              href={ctaHref}
              className="flex h-[20px] flex-none items-center gap-[2px] rounded-[22px] bg-white pl-[3px] pr-[9px] transition-opacity hover:opacity-75"
            >
              <span className="flex size-[16px] items-center justify-center">
                <ArrowGlyph color="#1A932E" className="-rotate-45" />
              </span>
              <span className="whitespace-nowrap text-[10px] leading-[12px] tracking-[0.2px] text-[#060606]">
                {ctaLabel}
              </span>
            </Link>
          </div>
          <p className={CARD_SUBTITLE}>
            {subtitle}
          </p>
        </div>

        <ul aria-hidden className="flex flex-none flex-col gap-[4px]">
          <li className="flex items-center gap-[5px]">
            <span className={cn("size-[9px] rounded-[2px]", a.swatch)} />
            <span className="text-[10px] leading-[12px] tracking-[0.08px] text-[#060606]">
              Actual (YTD)
            </span>
          </li>
          <li className="flex items-center gap-[5px]">
            <span className="size-[9px] rounded-[2px] bg-[rgba(6,109,255,0.6)]" />
            <span className="text-[10px] leading-[12px] tracking-[0.08px] text-[#060606]">
              Budget (YTD)
            </span>
          </li>
          <li className="flex items-center gap-[5px]">
            <span className="size-[9px] rounded-[2px]" style={HATCH_SWATCH} />
            <span className="text-[10px] leading-[12px] tracking-[0.08px] text-[#060606]">
              Budget Full year
            </span>
          </li>
        </ul>
      </header>

      {rows.length === 0 ? (
        <div className="mt-[24px]">
          <ChartEmpty height={220}>Nothing to compare for this period yet.</ChartEmpty>
        </div>
      ) : (
        <figure role="img" aria-label={`${chartTitle}. ${summary}`} className="mt-[24px]">
          <span className="sr-only">{summary}</span>

          <div aria-hidden>
            {/* ---- axis header ---- */}
            <div className={cn(COLS, "h-[26px] border-b border-black/[0.11]")}>
              <span className="self-center text-[14px] leading-none tracking-[0.14px] text-[#060606]">
                {unit}
              </span>
              {/* Ticks sit at their VALUE, not at their index: the axis ends on the data,
                  so the last gap is a remainder and evenly spacing them would put every
                  label a little to the right of the position it names. */}
              <span className="relative mr-[66px] self-stretch">
                {ticks.values.map((v, i) => (
                  <span
                    key={v}
                    className="absolute bottom-[3px] whitespace-nowrap text-[10px] leading-[12px] tracking-[0.1px] text-[#060606]"
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
              <span className="self-start text-[14px] leading-[16px] tracking-[0.14px] text-[#060606]">
                Budget Full year
              </span>
              <span className="self-start text-right text-[14px] leading-[16px] tracking-[0.14px] text-[#060606]">
                Status
              </span>
            </div>

            {/* ---- rows ---- */}
            <ul className="mt-[10px] flex flex-col">
              {rows.map((r) => {
                const actualPct = pct(r.actual);
                const budgetPct = pct(r.budgetToDate);
                const fullPct = pct(r.budgetFullYear);

                /**
                 * The design's grammar: actual, then the budget chip carrying on from
                 * where actual stopped, then the hatch out toward the full-year figure.
                 *
                 * The chip is only the budget STILL AHEAD of actual. A row spending faster
                 * than its budget has none, and forcing a token blue segment there would
                 * draw the opposite of what happened — so it gets no chip, and its blue
                 * figure floats with the others.
                 */
                const drawnActual = r.actual > 0 ? Math.max(actualPct, MIN_SEG_PCT) : 0;
                const hasChip = budgetPct > actualPct;
                const chipEnd = hasChip
                  ? Math.max(budgetPct, drawnActual + MIN_SEG_PCT)
                  : drawnActual;
                const chipWidth = chipEnd - drawnActual;
                const barEnd = chipEnd;

                const actualFits =
                  r.actual > 0 && (drawnActual / 100) * TRACK_PX >= estInsidePx(r.actualDisplay);
                const budgetFits =
                  chipWidth > 0 && (chipWidth / 100) * TRACK_PX >= estInsidePx(r.budgetToDateDisplay);

                /**
                 * Whatever could not fit inside its own segment floats in a run after the
                 * bars — ACTUAL FIRST, so the figures always read in the same order the
                 * segments do. (The design's own $0 rows are this case with the actual
                 * bar at zero width: chip, then the floated $0, then the hatch.)
                 */
                const floated: { key: string; text: string; ink: string; left: number }[] = [];
                let run = GAP_PX;
                const float = (key: string, text: string, ink: string) => {
                  floated.push({ key, text, ink, left: run });
                  run += estOutsidePx(text) + GAP_PX;
                };
                if (!actualFits) float("actual", r.actualDisplay, a.inkOff);
                if (!budgetFits && r.budgetToDate > 0) float("budget", r.budgetToDateDisplay, "text-[#066dff]");

                // The hatch begins past the floated figures — never stripes under text.
                const clearancePx = floated.length ? run : 4;
                const hatchOffset = `${barEnd}% + ${clearancePx}px`;

                return (
                  <li key={r.id} className={cn(COLS, "h-[44px] items-center")}>
                    <span
                      className="pr-[10px] text-[14px] leading-[normal] text-[#060606]"
                      title={r.label}
                    >
                      {r.label}
                    </span>

                    {/* the track: white, 28px, 7px radius — segments painted inside it */}
                    <span className="relative mr-[66px] block h-[28px] rounded-[7px] bg-white">
                      {drawnActual > 0 && (
                        <span
                          className={cn("anim-bar absolute inset-y-0 left-0 rounded-[7px]", a.bar)}
                          style={{ width: `${drawnActual}%` }}
                        />
                      )}
                      {chipWidth > 0 && (
                        <span
                          className="anim-bar absolute inset-y-0 rounded-[7px] bg-[rgba(6,109,255,0.4)]"
                          style={{
                            left: `calc(${drawnActual}% + 2px)`,
                            width: `calc(${chipWidth}% - 2px)`,
                          }}
                        />
                      )}
                      {fullPct > barEnd && (
                        <span
                          className="anim-fade-late absolute inset-y-0 rounded-[7px]"
                          style={{
                            ...HATCH,
                            left: `calc(${hatchOffset})`,
                            // To scale where the row has the room, and the design's own
                            // 21px token where the floated figures have eaten it — a
                            // full-year budget that exists must always show that it does.
                            width: `min(max(${MIN_HATCH_PX}px, calc(${fullPct - barEnd}% - ${clearancePx}px)), calc(100% - (${hatchOffset})))`,
                          }}
                        />
                      )}

                      {/* the figures that fit inside their own segment */}
                      {actualFits && (
                        <span
                          className={cn(
                            "anim-fade-late absolute left-[5px] top-1/2 -translate-y-1/2 whitespace-nowrap text-[10px] leading-[12px]",
                            a.inkOn,
                          )}
                        >
                          {r.actualDisplay}
                        </span>
                      )}
                      {budgetFits && (
                        <span
                          className="anim-fade-late absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[10px] leading-[12px] text-[#066dff]"
                          style={{ left: `calc(${drawnActual}% + 7px)` }}
                        >
                          {r.budgetToDateDisplay}
                        </span>
                      )}

                      {/* …and the ones that had to float, in segment order */}
                      {floated.map((f) => (
                        <span
                          key={f.key}
                          className={cn(
                            "anim-fade-late absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[12px] leading-[13px]",
                            f.ink,
                          )}
                          style={{ left: `calc(${barEnd}% + ${f.left}px)` }}
                        >
                          {f.text}
                        </span>
                      ))}
                    </span>

                    <span className="text-[14px] leading-[16px] text-[#060606]">
                      {r.budgetFullYearDisplay}
                    </span>

                    <span className="flex justify-end">
                      <span
                        className={cn(
                          "whitespace-nowrap rounded-[20px] px-[8px] py-[5px] text-[12px] leading-[normal] tracking-[0.12px]",
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
              <caption>{chartTitle}</caption>
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
      )}
    </section>
  );
}
