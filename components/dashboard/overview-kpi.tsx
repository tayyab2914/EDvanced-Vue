import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
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
 *      corner. The design's height becomes the floor.
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
      className="absolute right-[18px] top-[16px] flex size-[23px] items-center justify-center rounded-full bg-white/70"
      style={{ color: TONE_INK[tone] }}
    >
      <DiagonalArrow size={16} />
    </span>
  );
}

/**
 * The ring beside "Of annual budget collected", with its own percentage in the middle.
 *
 * SIZED WELL ABOVE THE MOCKUP. The design draws this at 20px with the figure set at 6px,
 * which is a decorative dot — the number inside is unreadable at a normal viewing distance
 * and the arc is too short to show a fill level. At 38px the arc reads as a proportion and
 * the figure inside is legible, which is the only reason the element is on the card.
 *
 * Drawn as an arc rather than shipped as the design's flat image, because the image is a
 * fixed 35% — this reports the district's actual figure, and a ring stuck at a third full
 * while the text beside it says 93% is worse than no ring.
 */
function MiniRing({ pct, tone }: { pct: number; tone: TileTone }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const r = 15.5;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative flex size-[38px] flex-none items-center justify-center">
      <svg width="38" height="38" viewBox="0 0 38 38" aria-hidden className="-rotate-90">
        <circle cx="19" cy="19" r={r} fill="none" stroke="rgba(0,6,6,0.12)" strokeWidth="5" />
        {/* Full-circumference dash with the gap offset out — same arc as before, but in a
            form the entrance CSS can wind to zero and release (see .anim-ring). */}
        <circle
          cx="19"
          cy="19"
          r={r}
          fill="none"
          stroke={TONE_INK[tone]}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={(c * (100 - clamped)) / 100}
          className="anim-ring"
          style={{ ["--c" as string]: `${c}` }}
        />
      </svg>
      <span className="absolute text-[10px] font-bold leading-none tracking-[-0.2px] text-[#060606]">
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
  delta,
  chip,
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
  delta?: KpiDelta;
  /**
   * The Revenue design's outlined white capsule — "88.18% outstanding" — a statement
   * pill where `delta` is a judgement line. Both can coexist; the chip draws first.
   */
  chip?: string;
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
        {icon && (
          <span
            className="flex size-[46px] flex-none items-center justify-center rounded-full"
            style={{ background: TONE_TINT[tone], color: TONE_INK[tone] }}
          >
            <Icon name={icon} size={24} />
          </span>
        )}
        <div className="flex flex-col items-start gap-[4px]">
          <span className="text-[14px] font-semibold leading-normal text-[#797979]">
            {label}
            {caption && (
              <span className="block font-normal text-[rgba(121,121,121,0.55)]">{caption}</span>
            )}
          </span>
          <span
            className={cn(
              // Proportional figures, not tabular: at 28px, tabular-nums gives every digit
              // the width of a zero and "121" reads loose. `tabular-nums` belongs in columns.
              "text-[28px] font-bold leading-normal tracking-[0.28px] [font-variant-numeric:proportional-nums]",
              unavailable ? "text-[#797979]" : "text-[#060606]",
            )}
            title={
              unavailable
                ? (unavailableReason ?? "Not enough data to work this out yet.")
                : undefined
            }
          >
            <CountUp value={value} />
          </span>
        </div>
      </div>

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
            "flex gap-[8px] text-[13px] font-semibold leading-[1.25] tracking-[0.075px] text-[rgba(0,6,6,0.62)]",
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
            hasRing ? "-mr-[30px] items-center whitespace-nowrap" : "items-start",
          )}
        >
          {hasRing && <MiniRing pct={subPct} tone={tone} />}
          <span className="min-w-0">{sub}</span>
        </span>
      )}

      {/**
       * NOT pinned to the card's floor any more.
       *
       * This used to carry `mt-auto`, which pushed the badge and footnote down so they lined
       * up across the row. With the tiles equalised by the grid, that turned every card
       * shorter than the tallest into a block of dead space with two lines stranded at the
       * bottom. Flowing straight on from the sub-line keeps each card as tall as its own
       * content and the row as tight as its fullest member.
       */}
      <div className="flex flex-col items-start gap-[6px]">
        {chip && (
          <span className="inline-flex items-center rounded-[20px] border-[0.8px] border-[#9e9e9e] bg-white px-[8px] py-px text-[10px] leading-normal tracking-[0.1px] text-black">
            {chip}
          </span>
        )}
        {status && (
          <span
            className="inline-flex items-center rounded-[20px] px-[9px] py-[2px] text-[10px] font-bold leading-normal tracking-[0.1px]"
            style={{ background: RUNG_PILL[status].bg, color: RUNG_PILL[status].fg }}
            title={unavailableReason}
          >
            {status}
          </span>
        )}

        {delta && (
          <span className="flex items-center gap-[5px] text-[12px] font-bold leading-[14px] tracking-[0.24px] text-[#060606]">
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
              >
                <DiagonalArrow size={14} direction={delta.direction} />
              </span>
            )}
            <span className="min-w-0">
              {delta.text}
              {delta.note && <span className="text-[#797979]"> {delta.note}</span>}
            </span>
          </span>
        )}

        {statusNote && (
          <span className="flex items-center gap-[5px] text-[12px] font-bold leading-[14px] tracking-[0.24px] text-[#060606]">
            <span style={{ color: TONE_INK[tone] }}>
              <DiagonalArrow size={14} />
            </span>
            {statusNote}
          </span>
        )}
      </div>
    </>
  );

  /**
   * A 14px radius on 62% white — the design's card, and the reason the row reads as one band
   * rather than four boxes. It carries no border, which works only because these sit directly
   * on the canvas; on a white surface they would vanish.
   *
   * `h-full w-full`, NOT the design's fixed 268×196. The tile is a grid cell now (see
   * `OverviewTileRow`), which is what makes all four the same height however many lines each
   * one's sub-text wraps to, and what stops the fourth dropping to a second row at 1440px.
   * 268 is still the target width — at 1440 the grid resolves within a few pixels of it — but
   * it is no longer a floor that can force a wrap.
   */
  const className =
    "group relative flex h-full w-full flex-col gap-[8px] rounded-[14px] bg-white/[0.62] px-[18px] pb-[16px] pt-[16px]";

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
  widthClass,
  children,
}: {
  label: string;
  value: string;
  /**
   * The design's pane width, applied from `sm` up only. Below that the pane is full width
   * and free to shrink — a `flex-none` 301px pane cannot, which is what pushed this card off
   * the side of a phone no matter what `max-w` the card carried.
   */
  widthClass: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-col gap-[10px] rounded-[16px] px-[16px] py-[12px] sm:flex-none",
        widthClass,
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
        <span className="text-[15px] font-semibold leading-[20px] text-[#797979]">
          {label}
        </span>
        <span className="text-[32px] font-bold leading-[36px] text-[#1f1f21] [font-variant-numeric:proportional-nums]">
          <CountUp value={value} />
        </span>
      </div>
      <div className="flex w-full flex-col gap-[6px]">{children}</div>
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
 * old six-up row carried as tiles five and six. They are not tiles here: white on a border
 * rather than translucent, DM Sans rather than Aeonik, 32px rather than 28px.
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
      className="mx-auto flex w-[676px] max-w-full flex-col gap-[8px] rounded-[24px] border border-[#e7e7e7] bg-white py-[8px]"
    >
      {/* `items-stretch`, not `items-center` — centring two panes of different content
          heights drops the shorter one's label below its neighbour's, and two labels at
          different heights across one card reads as a mistake.

          Stacked below `sm`. Side by side, the two panes need ~624px before either can
          shrink, which is wider than any phone. */}
      <div className="flex w-full flex-col items-stretch gap-[8px] px-[8px] sm:flex-row sm:gap-[16px]">
        <SplitPane label={budget.label} value={budget.value} widthClass="sm:w-[301px]">
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

        <SplitPane
          label={alerts.label}
          value={alerts.value}
          widthClass="sm:w-[290px]"
        >
          <div className="flex flex-wrap items-center gap-x-[10px] gap-y-[6px]">
            <span className="flex items-center gap-[4px]">
              <span className="text-[#fd4438]">
                <Icon name="warning" size={20} />
              </span>
              <span className="text-[15px] font-bold leading-[24px] text-[#fd4438]">
                {alerts.criticalCount}
              </span>
              <span className="text-[15px] font-semibold leading-[24px] text-[rgba(31,31,33,0.74)]">
                CRITICAL
              </span>
            </span>
            {alerts.href && (
              <Link
                href={alerts.href}
                className="inline-flex h-[20px] items-center gap-[3px] rounded-[22px] bg-[#ffeded] px-[7px] text-[10px] font-bold leading-[12px] tracking-[0.2px] text-black transition-opacity hover:opacity-80"
              >
                <span className="text-[#fd4438]">
                  <DiagonalArrow size={14} />
                </span>
                {alerts.hrefLabel}
              </Link>
            )}
          </div>
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
      <div className="flex w-full items-center justify-between gap-3">
        <h2 className="text-[22px] font-bold leading-normal tracking-[0.22px] text-[#060606]">
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
    <div className="grid w-full grid-cols-1 items-stretch gap-[16px] sm:grid-cols-2 xl:grid-cols-4">
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
