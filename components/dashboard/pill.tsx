import { cn } from "@/lib/cn";

/**
 * The capsule vocabulary the redesigned header speaks — one face for Views / Filters /
 * Export and the Overview period pill, one set of tints for the "Showing" chips.
 *
 * ---------------------------------------------------------------------------
 * WHY THESE ARE CONSTANTS AND NOT FIVE COPIES OF A CLASS ATTRIBUTE
 *
 * The three header buttons live in three files — the filter panel owns its trigger, saved
 * views owns its own, export owns a third — because each is a control with its own state,
 * not because they are meant to look different. They ARE meant to look identical, and while
 * the face was written out in each one it drifted: three heights, two radii, and a "▼"
 * character standing in for the design's chevron in two of them. A shared string is the only
 * way three files can be one control.
 *
 * The colours are the Overview band's (see components/dashboard/overview-kpi.tsx) — the same
 * six hues at a lighter wash. Nothing here invents a colour.
 * ---------------------------------------------------------------------------
 */

/**
 * The white capsule: fully rounded, 14px semibold, the band's near-black ink.
 *
 * NO SIZE. `cn` is a plain join, not tailwind-merge, so a caller that wanted a different
 * padding would emit both classes and let stylesheet order pick the winner — the same trap
 * the note on `OverviewKpiTile`'s `items-*` describes. Every dimension a caller might want
 * to change is in `PILL_SIZE` instead, which is added rather than overridden.
 */
export const PILL_FACE =
  "flex flex-none items-center rounded-full bg-white text-[14px] font-semibold leading-normal tracking-[0.14px] text-[#060606]";

/** The header controls' box — the design's 34px capsule (Figma 3:11570). */
export const PILL_SIZE = "h-[34px] gap-[12px] px-[14px]";

/**
 * What a capsule does when it is a button. The focus ring is drawn OUTSIDE the pill rather
 * than inset, because a fully rounded control has no corner to hold an inset ring against.
 */
export const PILL_INTERACTIVE =
  "transition-shadow hover:shadow-[0_2px_10px_rgba(0,6,6,0.10)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#301a93] disabled:cursor-not-allowed disabled:opacity-70";

/** The whole header button, in one string. */
export const PILL_BUTTON = cn(PILL_FACE, PILL_SIZE, PILL_INTERACTIVE);

/** The menus these buttons open — the pill continued, not the old bordered dropdown. */
export const PILL_MENU =
  "rounded-[16px] bg-white shadow-[0_12px_30px_rgba(0,6,6,0.14)] print:hidden";

/**
 * The design's chevron — a drawn glyph, not the "▼" character the three buttons used to
 * carry. The character renders at whatever weight and baseline the reader's emoji font
 * decides, which is why the old buttons each sat it at a different size.
 */
export function PillChevron({ open, className }: { open?: boolean; className?: string }) {
  return (
    <svg
      aria-hidden
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(
        "flex-none text-[#797979] transition-transform",
        open && "rotate-180",
        className,
      )}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * The "Showing" chips
 * ------------------------------------------------------------------ */

export type ChipTone = "green" | "teal" | "purple" | "amber" | "red" | "slate";

/** The Overview band's hues, washed back far enough to carry text at 12px. */
export const CHIP_TONE: Record<ChipTone, { bg: string; fg: string }> = {
  green: { bg: "rgba(26,147,46,0.16)", fg: "#158026" },
  teal: { bg: "rgba(26,123,147,0.16)", fg: "#166a7f" },
  purple: { bg: "rgba(48,26,147,0.14)", fg: "#301a93" },
  // Amber's own ink fails against its wash at this size — the band already reaches for the
  // darker #b76a12 wherever amber has to carry words rather than fill a disc.
  amber: { bg: "rgba(239,138,31,0.20)", fg: "#a35f10" },
  red: { bg: "rgba(230,95,43,0.16)", fg: "#d1471a" },
  slate: { bg: "rgba(92,106,128,0.16)", fg: "#4d5a6e" },
};

/**
 * The tone each filter dimension wears, by position in the chip row.
 *
 * Green is NOT in the rotation: it is the reporting period's, on every page, and a fund
 * filter that borrowed it would read as the month. Red is — "All funds" wears red when
 * nothing is filtered, and the two can never be on screen together, since one of them is
 * precisely the statement that the other is absent.
 */
export const CHIP_ROTATION: ChipTone[] = ["teal", "purple", "amber", "red", "slate"];

/**
 * The chip itself — fully rounded, 12px, tone-tinted. Padding AND weight are the caller's,
 * for the same reason `PILL_FACE` carries no size: a chip with a × needs a tighter right edge
 * than one without, "All funds" is set bolder than the rest, and two `px-*` — or two `font-*`
 * — classes on one element is a coin toss decided by stylesheet order.
 */
export const CHIP_FACE =
  "inline-flex items-center rounded-full text-[12px] leading-[16px] tracking-[0.12px]";
