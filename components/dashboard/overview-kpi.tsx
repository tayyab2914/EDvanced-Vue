import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { BAND_TITLE } from "@/components/dashboard/type-scale";
import { CountUp } from "@/components/count-up";
import { Icon, type IconName } from "@/components/icons";
import {
  DiagonalArrow,
  RUNG_PILL,
  TONE_INK,
  TONE_TINT,
  type KpiDelta,
  type TileTone,
} from "@/components/dashboard/kpi-tile";
import type { StatusRung } from "@/lib/dashboard/status";
import { NOT_AVAILABLE } from "@/lib/dashboard/format";

/**
 * The Overview band — a transcription of Figma nodes 3:11586 (the four tiles) and 3:11802
 * (the Available Budget / Alerts pair).
 *
 * Every measurement is the design's. Note that the mockup builds a tile from a card frame
 * PLUS absolutely-positioned siblings in the parent — the corner arrow, the percentage ring
 * and the "Healthy" badge all live outside the card node they visually belong to. They are
 * reunited here, which is why this file has parts that a reader of the card node alone
 * would not expect.
 *
 * TWO DELIBERATE DEPARTURES, both where the mockup contradicts itself rather than where this
 * disagrees with it:
 *
 *   1. `min-h` rather than a hard `h-[196px]`. The design's own first card stacks to ~205px
 *      inside a 196px frame — Figma clips it, a browser would spill it over the rounded
 *      corner. A floor the grid can grow past replaces it.
 *   1b. The label sits beside the icon rather than under it, and the floor came down with it.
 *      The design's stack spends two rows on a 46px disc and a 16px label; one row costs the
 *      disc's height alone.
 *   2. One badge size. The mockup sets "Acceptable" at 10px/px-8 and "On going" at 7px/px-4
 *      on a 5px-tall text box. The 10px pair is used throughout.
 *
 * FONT: the tiles specify "Aeonik Pro TRIAL" and the split card "DM Sans". The first is a
 * trial licence and cannot ship, so nothing here names a family — both inherit the app
 * stack. Licensing either is a one-line change in globals.css.
 */

/**
 * The tone maps and the diagonal arrow now live in components/dashboard/kpi-tile.tsx —
 * the canonical copy every dashboard's tiles and the print sheet share — and are imported
 * above. Nothing here invents a colour.
 */

/** The 23px disc in each tile's top-right corner, carrying the tile's own tone. */
function CornerArrow({ tone }: { tone: TileTone }) {
  return (
    <span
      aria-hidden
      className="absolute right-[10px] top-[10px] flex size-[19px] items-center justify-center rounded-full bg-white/70 sm:right-[18px] sm:top-[16px] sm:size-[23px]"
      style={{ color: TONE_INK[tone] }}
    >
      <DiagonalArrow size={16} />
    </span>
  );
}

/**
 * The ring beside "Of annual budget collected", with its own percentage in the middle.
 *
 * Drawn as an arc rather than shipped as the design's flat image, because the image is a
 * fixed 35% — this reports the district's actual figure, and a ring stuck at a third full
 * while the text beside it says 93% is worse than no ring.
 *
 * ONE DEPARTURE: 28px, not the design's 20px (Figma 3:11651). At 20px the figure inside had
 * to be set at 6px, which is below the size at which a percentage can actually be read — the
 * ring rendered as decoration with an illegible smudge in it. 28px leaves a 22px well, enough
 * for "100%" at 9px. The stroke stays at the design's weight relative to the disc.
 */
const RING_PX = 28;

function MiniRing({ pct, tone }: { pct: number; tone: TileTone }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const mid = RING_PX / 2;
  const r = 12;
  const c = 2 * Math.PI * r;
  return (
    <span
      className="relative flex flex-none items-center justify-center"
      style={{ width: RING_PX, height: RING_PX }}
    >
      <svg
        width={RING_PX}
        height={RING_PX}
        viewBox={`0 0 ${RING_PX} ${RING_PX}`}
        aria-hidden
        className="-rotate-90"
      >
        <circle cx={mid} cy={mid} r={r} fill="none" stroke="rgba(0,6,6,0.12)" strokeWidth="3" />
        {/* Full-circumference dash with the gap offset out — same arc as before, but in a
            form the entrance CSS can wind to zero and release (see .anim-ring). */}
        <circle
          cx={mid}
          cy={mid}
          r={r}
          fill="none"
          stroke={TONE_INK[tone]}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={(c * (100 - clamped)) / 100}
          className="anim-ring"
          style={{ ["--c" as string]: `${c}` }}
        />
      </svg>
      <span className="absolute text-[10px] font-bold leading-none tracking-[-0.3px] text-[#060606]">
        <CountUp value={`${Math.round(clamped)}%`} />
      </span>
    </span>
  );
}

export function OverviewKpiTile({
  label,
  caption,
  value,
  sub,
  subPct,
  icon,
  tone = "blue",
  status,
  statusNote,
  statusInline = false,
  delta,
  chip,
  chipRow,
  valueInk,
  arrow = true,
  href,
  unavailableReason,
}: {
  label: string;
  /**
   * The lighter second line under the label — the Revenue redesign's "Year to date" /
   * "vs period 1", set at the same 14px in the design's 55% grey.
   */
  caption?: string;
  /** Pre-formatted. Pass NOT_AVAILABLE ("—") when the figure cannot be computed. */
  value: string;
  sub?: ReactNode;
  /** Fills the ring beside `sub`. Omit and the sub-line renders without one. */
  subPct?: number | null;
  icon?: IconName;
  tone?: TileTone;
  status?: StatusRung;
  /** The rule the status was judged against — "Target ≥ 5.00%". */
  statusNote?: string;
  /**
   * Lays the status pill and its note on ONE line — the Expenditure redesign's utilization
   * tile (Figma 55:3178) sets "Strong" beside "Warning at 80.00% · critical at 95.00%",
   * where the Executive band stacks the pair. Only meaningful when both are passed.
   */
  statusInline?: boolean;
  delta?: KpiDelta;
  /**
   * The Revenue design's outlined white capsule — "88.18% outstanding" — a statement
   * pill where `delta` is a judgement line. Both can coexist; the chip draws first.
   */
  chip?: string;
  /**
   * A row of caller-drawn capsules where `chip` would go — the Forecast band's Board
   * policy tile (Figma 55:4554/55:4556) sets its warning AND critical rules side by side,
   * which one string cannot carry.
   */
  chipRow?: ReactNode;
  /**
   * Colours the 28px figure — the Forecast band letters its 3-year change in the loss red
   * and the Board policy target in green (Figma 55:4519 / 55:4552). Ignored while the
   * value is unavailable, which keeps the grey that means "no figure".
   */
  valueInk?: string;
  /**
   * The corner disc. The Executive band's tiles all carry it; the Revenue redesign's four
   * (Figma 46:3438) carry none, so that page passes false.
   */
  arrow?: boolean;
  href?: string;
  /** Shown on hover when the value is unavailable. */
  unavailableReason?: string;
}) {
  const unavailable = value === NOT_AVAILABLE;
  const hasRing = subPct !== null && subPct !== undefined;

  const body = (
    <>
      {/* The corner arrow IS the tile's affordance in this design — there is no "Go to
          Dashboard" line under the figures the way the old tile had one. */}
      {arrow && <CornerArrow tone={tone} />}

      <div className="flex flex-col items-start gap-[12px]">
        {/**
         * Icon and label share a row rather than stacking. The design stacks them — disc,
         * 20px gap, label, 10px gap, figure — which spends ~66px of the tile's height on two
         * short things sitting one above the other. Side by side the pair costs only the
         * disc's own 46px and the tile reads as one compact block.
         *
         * `pr` when the corner arrow is present: the arrow is absolutely positioned and takes
         * no width from the flow, so without it a long label runs underneath the disc.
         */}
        <div
          className={cn(
            "flex w-full items-center gap-[8px] sm:gap-[12px]",
            // Two tiles to a phone row leaves ~127px of content; the disc keeps its own
            // width whatever happens, so it shrinks with the type rather than squeezing
            // the label into a two-character column.
            arrow && "pr-[20px] sm:pr-[26px]",
          )}
        >
          {icon && (
            <span
              className="flex size-[34px] flex-none items-center justify-center rounded-full sm:size-[46px]"
              style={{ background: TONE_TINT[tone], color: TONE_INK[tone] }}
            >
              <Icon name={icon} size={24} className="size-[18px] sm:size-[24px]" />
            </span>
          )}
          <span className="min-w-0 text-[12px] font-semibold leading-[14px] text-[#060606] sm:text-[14px] sm:leading-[16px]">
            {label}
            {caption && (
              <span className="block font-normal text-[#060606]">{caption}</span>
            )}
          </span>
        </div>
        <span
          className={cn(
            // Proportional figures, not tabular: at 28px, tabular-nums gives every digit
            // the width of a zero and "121" reads loose. `tabular-nums` belongs in columns.
            "text-[20px] font-bold leading-[24px] tracking-[0.2px] [font-variant-numeric:proportional-nums] sm:text-[26px] sm:leading-[32px] sm:tracking-[0.28px]",
            unavailable ? "text-[#060606]" : "text-[#060606]",
          )}
          style={!unavailable && valueInk ? { color: valueInk } : undefined}
          title={
            unavailable
              ? (unavailableReason ?? "Not enough data to work this out yet.")
              : undefined
          }
        >
          <CountUp value={value} />
        </span>
      </div>

      {/* Footer block: pinned to the card's floor with `mt-auto`, so whatever slack the row's
          shared height leaves is absorbed between the figure and this block rather than
          below it — the badges of four tiles stay on one line as they do in the design. */}
      <div className="mt-auto flex w-full flex-col items-start gap-[5px] pt-[4px]">
      {sub && (
        /**
         * `-mr` reclaims the card's 43px right padding for this line only.
         *
         * In the design the sub-line is not a child of the card at all — it is an absolutely
         * positioned sibling that runs past where the card's padding would have stopped it,
         * set `whitespace-nowrap`. Constrained to the padded box it wraps to two lines and
         * the tile grows; given the room back, it sits on one line as drawn.
         */
        <span
          className={cn(
            "flex gap-[4px] text-[11px] font-semibold leading-[14px] tracking-[0.075px] text-[#060606] sm:text-[12px] sm:leading-[16px]",
            /**
             * A TERNARY, not `items-start` plus a conditional `items-center`.
             *
             * Both are `align-items` utilities, and when two land on one element the winner
             * is stylesheet order, not the order they appear in the class attribute — the
             * same trap the note on `KpiTile`'s value size describes. Written as a pair of
             * alternatives it is the condition that decides, which is what put the sentence
             * back on the ring's centre line instead of its baseline.
             *
             * Only the ring cards get the design's single-line treatment. A tile without a
             * ring carries a full sentence ("As a % of actual General Fund revenue
             * collected") that has to wrap — clipping it to one line would hide the basis
             * the figure above it is measured on.
             */
            /**
             * The ring line only gets the design's overhang-and-nowrap treatment from `sm`.
             * Two tiles to a 375px row leave the sub-line ~127px, where "of annual budget
             * collected" set on one line runs a clear 60px past the tile it belongs to —
             * and the tiles are `rounded`, not clipped, so it would print over its
             * neighbour. Below `sm` it wraps inside its own column instead.
             */
            hasRing
              ? "items-center sm:-mr-[30px] sm:whitespace-nowrap"
              : "items-start",
          )}
        >
          {hasRing && <MiniRing pct={subPct} tone={tone} />}
          <span className="min-w-0">{sub}</span>
        </span>
      )}

      <div className="flex flex-col items-start gap-[5px]">
        {chip && (
          <span className="inline-flex items-center rounded-[20px] border-[0.8px] border-[#9e9e9e] bg-white px-[8px] py-px text-[10px] leading-[12px] tracking-[0.1px] text-[#060606]">
            {chip}
          </span>
        )}
        {chipRow && <span className="flex flex-wrap items-center gap-[5px]">{chipRow}</span>}
        {status &&
          (statusInline && statusNote ? (
            /* The pill and its rule on one line — see `statusInline` above. */
            <span className="flex flex-wrap items-center gap-[7px]">
              <span
                className="inline-flex items-center rounded-[20px] px-[8px] py-[1px] text-[10px] font-bold leading-[12px] tracking-[0.1px]"
                style={{ background: RUNG_PILL[status].bg, color: RUNG_PILL[status].fg }}
                title={unavailableReason}
              >
                {status}
              </span>
              <span className="text-[10px] leading-[12px] tracking-[0.2px] text-[#060606]">
                {statusNote}
              </span>
            </span>
          ) : (
            <span
              className="inline-flex items-center rounded-[20px] px-[8px] py-[1px] text-[10px] font-bold leading-[12px] tracking-[0.1px]"
              style={{ background: RUNG_PILL[status].bg, color: RUNG_PILL[status].fg }}
              title={unavailableReason}
            >
              {status}
            </span>
          ))}

        {delta && (
          <span className="flex items-start gap-[4px] text-[11px] font-bold leading-[14px] tracking-[0.24px] text-[#060606] sm:items-center sm:text-[12px] sm:leading-[12px]">
            {delta.direction && (
              <span
                style={{
                  color:
                    delta.tone === "positive"
                      ? "#1a932e"
                      : delta.tone === "negative"
                        ? "#e65f2b"
                        : "#797979",
                }}
                className="mt-px flex-none sm:mt-0"
              >
                <DiagonalArrow size={14} direction={delta.direction} />
              </span>
            )}
            <span className="min-w-0">
              {delta.text}
              {delta.note && <span className="text-[#060606]"> {delta.note}</span>}
            </span>
          </span>
        )}

        {statusNote && !(statusInline && status) && (
          <span className="flex items-start gap-[4px] text-[11px] font-bold leading-[14px] tracking-[0.24px] text-[#060606] sm:items-center sm:text-[12px] sm:leading-[12px]">
            <span className="mt-px flex-none sm:mt-0" style={{ color: TONE_INK[tone] }}>
              <DiagonalArrow size={14} />
            </span>
            {statusNote}
          </span>
        )}
      </div>
      </div>
    </>
  );

  /**
   * A 14px radius on #FFFFFF9E — the design's card fill, and the reason the row reads as one
   * band rather than four boxes. It carries no border, which works only because these sit
   * directly on the canvas; on a white surface they would vanish.
   *
   * Written as the design's eight-digit hex rather than `bg-white/[0.62]`. The two are the
   * same colour (0x9E = 158/255 = 62%), but the hex is the value the mockup states, so a
   * reader comparing the two does not have to convert one to check.
   *
   * `min-h-[176px]`, not the design's 196: with the label moved up beside the icon the tile's
   * content no longer reaches 196, and a floor a stack cannot touch is just empty space at the
   * bottom of every card. The floor tracks the content. `h-full` still lets the grid equalise
   * the row when one card's sub-text wraps to an extra line.
   */
  const className =
    "group relative flex h-full min-h-[148px] w-full flex-col rounded-[14px] bg-[#FFFFFF9E] px-[12px] pb-[10px] pt-[12px] sm:min-h-[176px] sm:px-[18px] sm:pt-[18px]";

  if (href) {
    return (
      <Link data-reveal href={href} className={cn(className, "hover:bg-white/80")}>
        {body}
      </Link>
    );
  }
  return (
    <div data-reveal className={className}>
      {body}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The split card — Figma 3:11802
 * ------------------------------------------------------------------ */

/**
 * A pane of the split card. Unlike the tiles above, this node comes from a different library
 * in the Figma file — hence the 15/32px type, the `#1f1f21` ink and the 16px radius, none of
 * which match the four tiles beside it. That inconsistency is the design's, and copying it is
 * the point: the two are meant to read as different kinds of object.
 */
function SplitPane({
  label,
  value,
  layout = "stack",
  children,
}: {
  label: string;
  value: string;
  /**
   * `stack` puts the children under the figure (the Available Budget pane's badge + note);
   * `side` stands them beside it, vertically centred and pushed to the pane's right edge —
   * the Alerts pane's critical row and CTA, which otherwise left the pane's right half
   * empty once the design's sparkline was removed (see the note below).
   */
  layout?: "stack" | "side";
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex w-full min-w-0 rounded-[16px] px-[16px] py-[12px] sm:flex-1",
        layout === "side"
          ? "flex-row flex-wrap items-center justify-between gap-x-[12px] gap-y-[8px]"
          : "flex-col gap-[10px]",
      )}
    >
      {/**
       * NO SPARKLINE. The design puts a 64px chart beside each figure, and both were removed:
       * Available Budget's had only two committed periods to plot, so it drew as a single
       * diagonal stroke that read as a giant arrow rather than a trend, and Alerts never had
       * a series at all — nothing in the data model records how many alerts fired in earlier
       * periods, and a drawn trend is a claim about history. Restore them together, once
       * there is enough of both to plot.
       */}
      <div className="flex flex-col items-start gap-[4px] whitespace-nowrap">
        <span className="text-[14px] font-semibold leading-[20px] text-[#060606]">
          {label}
        </span>
        <span className="text-[26px] font-bold leading-[30px] text-[#060606] [font-variant-numeric:proportional-nums] sm:text-[32px] sm:leading-[36px]">
          <CountUp value={value} />
        </span>
      </div>
      <div
        className={cn(
          "flex flex-col gap-[6px]",
          layout === "side" ? "min-w-0 items-end" : "w-full",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** The 40px hairline between the panes — the design's "Driver". */
function SplitDivider() {
  return (
    <div
      aria-hidden
      className={cn(
        // Stacked on a phone, the rule turns with the layout: a full-width hairline between
        // the two panes rather than a 40px vertical mark floating beside nothing.
        "h-px w-full flex-none self-stretch bg-[#e7e7e7]",
        // `self-center` from `sm` so it keeps its own 40px against panes that stretch.
        "sm:h-[40px] sm:w-px sm:self-center",
      )}
    />
  );
}

/**
 * Available Budget and Alerts, sharing one bordered card.
 *
 * In the design these are the fifth and sixth figures of the Overview — the same two the
 * old six-up row carried as tiles five and six. They keep the pane anatomy (DM Sans ramp,
 * 32px figures) but wear the tiles' own 62% white rather than the mockup's bordered solid
 * card — the user's call, so the band's two rows read as one surface.
 */
export function OverviewSplitCard({
  budget,
  alerts,
}: {
  budget: {
    label: string;
    value: string;
    /**
     * Free text rather than a `StatusRung`, because the design's word here is "Healthy" and
     * that is not a rung on this product's ladder. Inventing one to satisfy the mockup would
     * put a sixth grade into a vocabulary the badges, the gauge and the threshold lines all
     * share (see the status ladder in globals.css); a local label costs nothing and keeps
     * that vocabulary closed.
     */
    badge?: { text: string; tone: "positive" | "negative" | "neutral" };
    note?: string;
    href?: string;
  };
  alerts: {
    label: string;
    value: string;
    criticalCount: number;
    href?: string;
    hrefLabel: string;
  };
}) {
  return (
    <div
      data-reveal
      className="mx-auto flex w-[676px] max-w-full flex-col gap-[8px] rounded-[24px] bg-[#FFFFFF9E] py-[4px]"
    >
      {/* `items-stretch`, not `items-center` — centring two panes of different content
          heights drops the shorter one's label below its neighbour's, and two labels at
          different heights across one card reads as a mistake.

          Stacked below `sm`. Side by side, the two panes need ~624px before either can
          shrink, which is wider than any phone. */}
      <div className="flex w-full flex-col items-stretch gap-[8px] px-[8px] sm:flex-row sm:gap-[16px]">
        <SplitPane label={budget.label} value={budget.value}>
          {budget.badge && (
            <span
              className="inline-flex w-fit items-center rounded-[20px] px-[9px] py-[2px] text-[10px] font-bold leading-normal tracking-[0.1px]"
              style={{
                background:
                  budget.badge.tone === "negative"
                    ? "rgba(230,95,43,0.18)"
                    : budget.badge.tone === "neutral"
                      ? "rgba(92,106,128,0.18)"
                      : "rgba(26,147,46,0.18)",
                color:
                  budget.badge.tone === "negative"
                    ? "#e65f2b"
                    : budget.badge.tone === "neutral"
                      ? "#5c6a80"
                      : "#1a932e",
              }}
            >
              {budget.badge.text}
            </span>
          )}
          {budget.note && (
            <span className="flex items-center gap-[5px] text-[12px] font-bold leading-[14px] tracking-[0.24px] text-[#060606]">
              <span className="text-[#1a932e]">
                <DiagonalArrow size={14} />
              </span>
              {budget.note}
            </span>
          )}
        </SplitPane>

        <SplitDivider />

        <SplitPane label={alerts.label} value={alerts.value} layout="side">
          {/* The critical tally and the way out stand beside the count rather than under
              it — with the design's sparkline gone, stacking them left the pane's right
              half and its floor empty. */}
          <span className="flex items-center gap-[4px]">
            <span className="text-[#fd4438]">
              <Icon name="warning" size={20} />
            </span>
            <span className="text-[14px] font-bold leading-[24px] text-[#fd4438]">
              {alerts.criticalCount}
            </span>
            <span className="text-[14px] font-semibold leading-[24px] text-[#060606]">
              CRITICAL
            </span>
          </span>
          {alerts.href && (
            <Link
              href={alerts.href}
              className="inline-flex h-[20px] items-center gap-[3px] rounded-[22px] bg-[#ffeded] px-[7px] text-[10px] font-bold leading-[12px] tracking-[0.2px] text-[#060606] transition-opacity hover:opacity-80"
            >
              <span className="text-[#fd4438]">
                <DiagonalArrow size={14} />
              </span>
              {alerts.hrefLabel}
            </Link>
          )}
        </SplitPane>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Band chrome
 * ------------------------------------------------------------------ */

/**
 * The Overview band: title, period pill, and a wrapping row at the design's 20px header gap
 * and 16px card gap.
 */
export function OverviewSection({
  title = "Overview",
  action,
  children,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col items-start gap-[20px]">
      {/* Wraps below the title on a narrow phone: "Overview" and the period capsule need
          ~326px side by side, which is more than a 320px viewport has to give. */}
      <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className={BAND_TITLE}>
          {title}
        </h2>
        {action}
      </div>
      <div className="flex w-full flex-col items-start gap-[16px]">{children}</div>
    </section>
  );
}

/**
 * The four tiles, as a grid rather than a wrapping row.
 *
 * TWO BUGS THIS FIXES, both from the fixed-width flex row it replaces:
 *
 *   1. Unequal heights. Flex items only stretch when nothing forces otherwise; a tile whose
 *      sub-text wrapped to two lines grew and its neighbours did not. Grid rows stretch by
 *      default, so all four now share the tallest one's height.
 *   2. The fourth tile wrapping at 1440px. Four 268px cards plus three 16px gaps need
 *      1120px; a 1440px viewport less the 256px rail and the column's 28px gutters left
 *      1116px, four short. Grid columns divide what is actually there instead of wrapping
 *      when they do not fit.
 *
 * Four-up at `xl`, not `lg` — `lg` is exactly where the rail claims its 256px back, so a
 * four-column grid declared there is really four columns in ~940px.
 */
export function OverviewTileRow({ children }: { children: ReactNode }) {
  return (
    <div className="grid w-full grid-cols-2 items-stretch gap-[10px] sm:gap-[16px] xl:grid-cols-4">
      {children}
    </div>
  );
}

/**
 * The period pill beside the Overview title now lives in
 * components/dashboard/overview-period-select.tsx, where it also became the reporting-period
 * selector the design's chevron always implied. `OverviewPeriodPill` — the static capsule —
 * is still exported from there for the one-period case.
 */
