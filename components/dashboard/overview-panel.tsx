import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { CountUp } from "@/components/count-up";
import type { StatusRung } from "@/lib/dashboard/status";
import { CARD_TITLE, CARD_SUBTITLE } from "@/components/dashboard/type-scale";

/**
 * The chrome shared by the executive redesign's lower band — the Fund Balance Trend card
 * (Figma 3:12327 + its rail 3:12428 and insight tip 3:12493), the Cash Position card
 * (3:12343 + rail 3:12462 + strip 3:12495) and the Financial Health Summary (3:12545).
 *
 * As everywhere in this redesign, the mockup composes each "card" from a translucent frame
 * PLUS absolutely-positioned siblings — the white metric rail and the cash strip are
 * page-level nodes that happen to sit inside the frame's bounds. They are reunited here.
 *
 * FONT: the frames set "Aeonik Pro TRIAL" and the rails "DM Sans" — the same trial-licence
 * situation overview-kpi.tsx documents. Nothing here names a family; everything inherits
 * the app stack. That mixed typography (16px Aeonik headers over 15/32px DM Sans rails) is
 * the design's own and survives as the size/weight steps.
 */

/* ------------------------------------------------------------------ *
 * The card shell and header — the same 62% white / 14px radius frame the
 * OverviewBudgetCard transcribed, with the same title + "Go to …" pill.
 * ------------------------------------------------------------------ */

export function OverviewPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      data-reveal
      className={cn("relative overflow-clip rounded-[14px] bg-white/[0.62] p-[18px]", className)}
    >
      {children}
    </section>
  );
}

/**
 * The vuesax arrow-right of the "Go to …" pill — 12.33×9.09, verbatim from the export,
 * same glyph OverviewBudgetCard carries. The −45° rotation makes it point ↗.
 */
export function ArrowGlyph({ color, className }: { color: string; className?: string }) {
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

/**
 * Header: 16px title with the white "Go to …" capsule beside it, and the 10px bold
 * sub-line underneath at 56% black — the design's exact type ramp on all three cards.
 */
export function OverviewPanelHeader({
  title,
  subtitle,
  ctaLabel,
  ctaHref,
  badge,
}: {
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaHref?: string;
  /** An honesty marker (FundLevelOnly etc.) the design has no slot for; sits after the pill. */
  badge?: ReactNode;
}) {
  return (
    <header className="min-w-0">
      <div className="flex flex-wrap items-center gap-[14px]">
        <h2 className={cn("whitespace-nowrap", CARD_TITLE)}>
          {title}
        </h2>
        {ctaLabel && ctaHref && (
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
        )}
        {badge}
      </div>
      {subtitle && (
        <p className={CARD_SUBTITLE}>
          {subtitle}
        </p>
      )}
    </header>
  );
}

/* ------------------------------------------------------------------ *
 * The design's status pills — rounded-20, 18% tint, full-strength ink.
 * ------------------------------------------------------------------ */

/**
 * This band's own pill palette, read off the health table and the gauge badge: Acceptable
 * turns BLUE here (#2b51c5) where the Overview tiles set it green — the design's call, and
 * copying it is the point. Monitor keeps the tiles' orange pair; nothing in this band shows
 * one.
 */
export const PANEL_RUNG: Record<StatusRung, { bg: string; fg: string }> = {
  Strong: { bg: "rgba(26,147,46,0.18)", fg: "#1a932e" },
  Acceptable: { bg: "rgba(43,81,197,0.18)", fg: "#2b51c5" },
  Monitor: { bg: "rgba(239,138,31,0.18)", fg: "#b76a12" },
  "Action Required": { bg: "rgba(238,32,28,0.18)", fg: "#ee201c" },
  "N/A": { bg: "rgba(172,172,171,0.18)", fg: "#3a3a3a" },
};

export function PanelRungPill({
  rung,
  /**
   * Overrides the word — the health table letters Action Required as "At risk" and N/A as
   * "Not available", which are this design's local vocabulary, same licence as the split
   * card's "Healthy". The rung still comes from the one ladder everything shares.
   */
  label,
  size = "md",
  title,
}: {
  rung: StatusRung;
  label?: string;
  size?: "sm" | "md";
  title?: string;
}) {
  const c = PANEL_RUNG[rung];
  return (
    <span
      title={title}
      className={cn(
        "inline-flex w-fit items-center whitespace-nowrap rounded-[20px] px-[8px] py-[5px] leading-[normal]",
        // The gauge badge is drawn at the mockup's 8px, which is unreadable; 10px is the
        // same normalisation overview-kpi.tsx applied to this band's other tiny pill.
        size === "sm" ? "text-[10px] tracking-[0.1px]" : "text-[12px] tracking-[0.12px]",
      )}
      style={{ background: c.bg, color: c.fg }}
    >
      {label ?? (rung === "N/A" ? "Not available" : rung)}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * The white metric rail — Figma 3:12428 / 3:12462
 * ------------------------------------------------------------------ */

export interface RailItem {
  label: string;
  /** Pre-formatted; the page owns formatting, as everywhere. */
  value: string;
  /** Colours the 32px figure: the rail's red for bad news, the strip's green for good. */
  tone?: "default" | "negative" | "positive";
  /** "-17.88% vs Prior period" / "Start of FY 2026-27" — the 15px secondary line. */
  note?: string;
  /** Prefixes the note with the design's 17px diagonal arrow, ↘ red or ↗ green. */
  noteArrow?: "up" | "down";
  /** Renders a rung pill instead of a 32px figure — the General Fund rail's Status row. */
  badge?: StatusRung;
}

const RAIL_TONE = {
  default: "text-[#060606]",
  negative: "text-[#fd4438]",
  positive: "text-[#1a932e]",
} as const;

/** The design's note arrow — the ↗ glyph turned to ↗ (up) or its 180° ↙ (down). */
function NoteArrow({ direction }: { direction: "up" | "down" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-[17px] flex-none items-center justify-center",
        direction === "down" && "rotate-180",
      )}
      style={{ color: direction === "down" ? "#fd4438" : "#1a932e" }}
    >
      <ArrowGlyph color="currentColor" className="-rotate-45" />
    </span>
  );
}

/**
 * The bordered white card standing at the right of both big cards — four figures separated
 * by 189px hairlines. 243px wide beside the chart from `xl`; full width beneath it before
 * that, where the fixed column would crush the chart.
 *
 * `compact` is the 64:5751 revision's half-width band, where the two big cards share one
 * row and the rail narrows to the design's slim column (64:6584): 9px labels wrapping over
 * 14px figures. The full-width geometry survives below `xl`, where the rail drops under
 * the chart either way.
 */
export function OverviewMetricRail({ items, compact }: { items: RailItem[]; compact?: boolean }) {
  return (
    <div
      className={cn(
        "flex w-full flex-col rounded-[24px] border border-[#e7e7e7] bg-white py-[7px] xl:flex-none",
        compact ? "xl:w-[118px]" : "xl:w-[243px]",
      )}
    >
      {items.map((item, i) => (
        <div key={item.label}>
          {i > 0 && (
            <div
              aria-hidden
              className={cn("mx-auto h-px bg-[#ebebeb]", compact ? "w-[90px]" : "w-[189px]")}
            />
          )}
          <div
            className={cn(
              "flex flex-col",
              compact ? "gap-[4px] px-[14px] py-[11px]" : "gap-[8px] px-[23px] py-[16px]",
            )}
          >
            <span
              className={cn(
                "font-semibold text-[#060606]",
                compact ? "text-[11px] leading-[14px]" : "text-[14px] leading-[20px]",
              )}
            >
              {item.label}
            </span>
            {item.badge ? (
              <PanelRungPill rung={item.badge} size={compact ? "sm" : "md"} />
            ) : (
              <span
                className={cn(
                  "font-semibold [font-variant-numeric:proportional-nums]",
                  compact ? "text-[16px] leading-[20px]" : "text-[32px] leading-[36px]",
                  RAIL_TONE[item.tone ?? "default"],
                )}
              >
                <CountUp value={item.value} />
              </span>
            )}
            {item.note && (
              <span
                className={cn(
                  "flex items-center gap-[3px] font-normal text-[#060606]",
                  compact ? "text-[11px] leading-[14px]" : "text-[14px] leading-[24px]",
                )}
              >
                {item.noteArrow && <NoteArrow direction={item.noteArrow} />}
                <span className="min-w-0">{item.note}</span>
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The cash flow strip — Figma 3:12495
 * ------------------------------------------------------------------ */

export interface StripItem {
  label: string;
  value: string;
  tone?: "default" | "negative" | "positive";
}

/**
 * Five figures on one 56% white band with 40px hairline drivers between them — the cash
 * card's Beginning → Receipts → Disbursements → Net → Ending walk. Wraps to fewer columns
 * where five 180px cells cannot fit; the reading order survives the wrap.
 *
 * `compact` is the 64:5751 half-width cash card's strip (64:6687): five ~89px cells whose
 * 9px labels wrap over 13px figures, so the walk still fits beside its neighbour card.
 */
export function OverviewInfoStrip({ items, compact }: { items: StripItem[]; compact?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-[24px] border border-[#e7e7e7] bg-white/[0.56]",
        compact ? "px-[10px] py-[6px]" : "px-[24px] py-[12px]",
      )}
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((item, i) => (
          <div
            key={item.label}
            className={cn(
              "relative flex flex-col",
              compact ? "gap-[4px] px-[12px] py-[10px]" : "gap-[8px] px-[23px] py-[16px]",
              // The 40px driver, drawn as a left border on every cell but the row's first.
              i > 0 &&
                "before:absolute before:left-0 before:top-1/2 before:hidden before:w-px before:-translate-y-1/2 before:bg-[#e7e7e7] lg:before:block",
              i > 0 && (compact ? "before:h-[27px]" : "before:h-[40px]"),
            )}
          >
            <span
              className={cn(
                "font-semibold text-[#060606]",
                compact
                  ? "text-[11px] leading-[14px]"
                  : "whitespace-nowrap text-[14px] leading-[20px]",
              )}
            >
              {item.label}
            </span>
            <span
              className={cn(
                "whitespace-nowrap font-semibold [font-variant-numeric:proportional-nums]",
                compact ? "text-[16px] leading-[20px]" : "text-[32px] leading-[36px]",
                RAIL_TONE[item.tone ?? "default"],
              )}
            >
              <CountUp value={item.value} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
