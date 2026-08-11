import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/components/icons";
import type { StatusRung } from "@/lib/dashboard/status";
import { NOT_AVAILABLE, type DeltaTone } from "@/lib/dashboard/format";

/**
 * The KPI tile — the top row of every dashboard, and the client's first named requirement:
 * "carry forward the KPI hierarchy".
 *
 * REDRAWN TO THE EXECUTIVE REDESIGN (Figma 3:11586's Overview tiles): a borderless 62%-white
 * card on the canvas, the 18%-tinted icon disc, sentence-case grey label over a bold
 * near-black figure, tinted judgement pills and bold delta lines with the diagonal arrow.
 * The Executive dashboard's own tiles (components/dashboard/overview-kpi.tsx) transcribed
 * the design first; this tile speaks the same vocabulary so the other five dashboards read
 * as the same product. The tone maps below are the canonical copy — overview-kpi.tsx and
 * the print sheet import them from here.
 *
 * The contract is unchanged: icon disc · label · large value · one sub-line of context ·
 * optionally a status pill or a trend. Nothing else. A tile that grew a second sub-line
 * would stop being scannable, which is the only thing it is for.
 *
 * `value` is a STRING, always. Every figure here is a Prisma.Decimal upstream, and a tile
 * that accepted a number would silently round a district's nine-figure total at the
 * component boundary — the dashboard and the CSV export of the same figure would then
 * disagree, which is precisely the trust this product cannot spend.
 */

export type TileTone = "green" | "blue" | "purple" | "amber" | "teal" | "red" | "slate";

/** Solid tone colours, taken from the four discs and the corner arrows in the design. */
export const TONE_INK: Record<TileTone, string> = {
  green: "#1a932e",
  teal: "#1a7b93",
  // The design's second card. It has no separate blue, so the two share a slot.
  blue: "#1a7b93",
  purple: "#301a93",
  amber: "#ef8a1f",
  red: "#e65f2b",
  slate: "#5c6a80",
};

/** The 18% wash behind each disc, same hues. */
export const TONE_TINT: Record<TileTone, string> = {
  green: "rgba(26,147,46,0.18)",
  teal: "rgba(26,123,147,0.18)",
  blue: "rgba(26,123,147,0.18)",
  purple: "rgba(48,26,147,0.18)",
  amber: "rgba(239,138,31,0.18)",
  red: "rgba(230,95,43,0.18)",
  slate: "rgba(92,106,128,0.18)",
};

/**
 * The status pill. The design shows three — "Acceptable" and "Healthy" in green, "On going"
 * in orange — and the rest extend from that pair: Strong joins green, Action Required takes
 * the file's deepest red, N/A the neutral slate.
 */
export const RUNG_PILL: Record<StatusRung, { bg: string; fg: string }> = {
  Strong: { bg: "rgba(26,147,46,0.18)", fg: "#1a932e" },
  Acceptable: { bg: "rgba(26,147,46,0.18)", fg: "#1a932e" },
  Monitor: { bg: "rgba(239,138,31,0.18)", fg: "#b76a12" },
  "Action Required": { bg: "rgba(230,95,43,0.18)", fg: "#e65f2b" },
  "N/A": { bg: "rgba(92,106,128,0.18)", fg: "#5c6a80" },
};

/**
 * The design's `vuesax/linear/arrow-right` turned 45°, which is the only form of arrow in
 * this band — it appears in the card corner, before every footnote, and in the alerts pill.
 * Drawn rather than fetched: the exported asset is a flat right-arrow whose meaning is
 * entirely in the rotation applied to it, and a rotation is not worth four PNGs.
 */
export function DiagonalArrow({
  size = 14,
  direction = "up",
}: {
  size?: number;
  direction?: "up" | "down" | "flat";
}) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(
        "flex-none",
        direction === "up" && "-rotate-45",
        direction === "down" && "rotate-45",
      )}
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

/** The 23px disc in each tile's top-right corner, carrying the tile's own tone. */
export function CornerArrow({ tone }: { tone: TileTone }) {
  return (
    <span
      aria-hidden
      className="absolute right-[16px] top-[14px] flex size-[23px] items-center justify-center rounded-full bg-white/70"
      style={{ color: TONE_INK[tone] }}
    >
      <DiagonalArrow size={16} />
    </span>
  );
}

export interface KpiDelta {
  text: string;
  tone: DeltaTone;
  /**
   * Direction of MOVEMENT, never of judgement — a district's cash falling is "down" and
   * red; its spending falling is "down" and green. Omit for a figure that is not a change.
   */
  direction?: "up" | "down" | "flat";
  /** What the change is measured against — "vs Apr 2026". */
  note?: string;
}

/** The delta arrow's ink, by judgement — the design's green/red pair with a neutral grey. */
const DELTA_INK: Record<DeltaTone, string> = {
  positive: "#1a932e",
  negative: "#e65f2b",
  neutral: "#797979",
};

export function KpiTile({
  label,
  caption,
  value,
  valueStatus,
  sub,
  icon,
  tone = "blue",
  status,
  statusNote,
  delta,
  info,
  href,
  hrefLabel,
  unavailableReason,
}: {
  label: string;
  /** The qualifier under the label — "(Year to date)", "(General Fund only)". */
  caption?: string;
  /** Pre-formatted. Pass NOT_AVAILABLE ("—") when the figure cannot be computed. */
  value: string;
  /** Colours the value itself, for a tile whose value IS a status word. */
  valueStatus?: StatusRung;
  sub?: ReactNode;
  icon?: IconName;
  tone?: TileTone;
  status?: StatusRung;
  /** The rule the status was judged against — "Target ≥ 5.00%". */
  statusNote?: string;
  delta?: KpiDelta;
  /** One sentence explaining the figure, on a ⓘ beside the label. */
  info?: string;
  href?: string;
  /** Kept for compatibility; the corner arrow is the affordance in this design. */
  hrefLabel?: string;
  /** Shown on hover when the value is unavailable. */
  unavailableReason?: string;
}) {
  void hrefLabel;
  const unavailable = value === NOT_AVAILABLE;

  const body = (
    <>
      {/* The corner arrow IS the tile's affordance in this design — there is no "View →"
          line under the figures the way the old tile had one. */}
      {href && <CornerArrow tone={tone} />}

      <div className="flex flex-col items-start gap-[10px]">
        {icon && (
          <span
            className="flex size-[40px] flex-none items-center justify-center rounded-full"
            style={{ background: TONE_TINT[tone], color: TONE_INK[tone] }}
          >
            <Icon name={icon} size={20} />
          </span>
        )}
        <div className="flex flex-col items-start gap-[2px]">
          <span className="flex items-start gap-1 text-[13px] font-semibold leading-[1.3] text-[#797979]">
            <span className="min-w-0">{label}</span>
            {info && (
              <span
                title={info}
                aria-label={info}
                className="mt-[1px] flex size-[13px] flex-none cursor-help items-center justify-center rounded-full bg-black/[0.07] text-[8.5px] font-bold text-[#797979]"
              >
                i
              </span>
            )}
          </span>
          {caption && (
            <span className="block truncate text-[10px] font-medium leading-[1.3] text-[#797979]/80">
              {caption}
            </span>
          )}
          <span
            className={cn(
              // Proportional figures, not tabular: at this size, tabular-nums gives every
              // digit the width of a zero and "121" reads loose. `tabular-nums` belongs in
              // columns.
              "font-bold leading-[1.15] [font-variant-numeric:proportional-nums]",
              // A status WORD set at 26px overflows a six-up grid, so a tile whose value is
              // a rung gets its own step down. One class or the other, never both — two
              // arbitrary font-size utilities on one element resolve by stylesheet order.
              valueStatus ? "text-[20px] tracking-[0.2px]" : "text-[26px] tracking-[0.26px]",
              unavailable ? "text-[#797979]" : !valueStatus && "text-[#060606]",
            )}
            style={
              !unavailable && valueStatus ? { color: RUNG_PILL[valueStatus].fg } : undefined
            }
            title={
              unavailable
                ? (unavailableReason ?? "Not enough data to work this out yet.")
                : undefined
            }
          >
            {value}
          </span>
        </div>
      </div>

      {sub && (
        <span className="text-[12px] font-semibold leading-[1.3] text-[rgba(0,6,6,0.62)]">
          {sub}
        </span>
      )}

      <div className="flex flex-col items-start gap-[6px]">
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
              <span style={{ color: DELTA_INK[delta.tone] }}>
                <DiagonalArrow size={14} direction={delta.direction} />
              </span>
            )}
            <span className="min-w-0 [font-variant-numeric:tabular-nums]">
              {delta.text}
              {delta.note && <span className="font-semibold text-[#797979]"> {delta.note}</span>}
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
   * The design's card: 14px radius on 62% white, no border, no shadow — the canvas colour
   * behind it is what makes it read as a card (see --color-canvas in globals.css).
   */
  const className =
    "group relative flex h-full min-w-0 flex-col gap-[8px] rounded-[14px] bg-white/[0.62] px-[16px] py-[14px]";

  if (href) {
    return (
      <Link href={href} className={cn(className, "transition-colors hover:bg-white/80")}>
        {body}
      </Link>
    );
  }
  return <div className={className}>{body}</div>;
}

/**
 * The KPI row.
 *
 * Six tiles do not fit legibly in the 1200px content column at this type scale, and the
 * breakpoint that looks right for a six-up grid — `lg:` — is exactly where the sidebar
 * takes 250px back. So it steps 2 → 3 → 6 and only reaches six on a genuinely wide screen.
 * `items-stretch` so every tile in a row takes the tallest one's height, as the Overview
 * band's grid does.
 */
export function KpiRow({ children, count = 6 }: { children: ReactNode; count?: number }) {
  return (
    <div
      className={cn(
        "grid items-stretch gap-2.5 sm:grid-cols-2 lg:grid-cols-3",
        count >= 6
          ? "2xl:grid-cols-6"
          : count === 5
            ? "2xl:grid-cols-5"
            : "xl:grid-cols-4",
      )}
    >
      {children}
    </div>
  );
}

/**
 * The small figure card — §7.2's Monthly Cash Summary, converted from a table to "visual
 * KPI cards" at the client's request.
 *
 * Restyled to the redesign's white metric rail cell (Figma 3:12428's items): solid white on
 * the translucent card, the rail's #e7e7e7 border, sentence-case label over a medium-weight
 * figure. Five of these sit in a row inside a card, so the type scale steps down from the
 * rail's 15/32px to fit.
 */
export function MiniStat({
  label,
  value,
  note,
  icon,
  tone = "slate",
  valueTone,
}: {
  label: string;
  value: string;
  note?: ReactNode;
  icon?: IconName;
  tone?: TileTone;
  valueTone?: DeltaTone;
}) {
  const TEXT: Record<DeltaTone, string> = {
    positive: "text-[#1a932e]",
    negative: "text-[#fd4438]",
    neutral: "text-[#1f1f21]",
  };
  return (
    <div className="flex min-w-0 flex-col gap-[6px] rounded-[16px] border border-[#e7e7e7] bg-white px-[14px] py-[12px]">
      {icon && (
        <span
          className="flex size-[26px] flex-none items-center justify-center rounded-full"
          style={{ background: TONE_TINT[tone], color: TONE_INK[tone] }}
        >
          <Icon name={icon} size={14} />
        </span>
      )}
      <span className="text-[11.5px] font-medium leading-[1.3] text-[#1f1f21]">{label}</span>
      <span
        className={cn(
          "text-[20px] font-medium leading-[1.15] [font-variant-numeric:proportional-nums]",
          valueTone ? TEXT[valueTone] : "text-[#1f1f21]",
        )}
      >
        {value}
      </span>
      {note && (
        <span className="text-[10.5px] leading-snug text-[#1f1f21]/[0.74]">{note}</span>
      )}
    </div>
  );
}
