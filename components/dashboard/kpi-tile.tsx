import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/components/icons";
import { StatusBadge } from "@/components/dashboard/status-badge";
import type { StatusRung } from "@/lib/dashboard/status";
import { NOT_AVAILABLE, type DeltaTone } from "@/lib/dashboard/format";

/**
 * The KPI tile — the top row of every dashboard, and the client's first named requirement:
 * "carry forward the KPI hierarchy".
 *
 * M4 restated it: "I'd like them to have slightly more emphasis since they're the first
 * thing users see — slightly larger values, stronger status colours, small trend indicators
 * when applicable, keep the coloured icons."
 *
 * The layout is built for the WORST case, which is the six-up row on a 1440–1600px laptop:
 * roughly 170px of tile, and every element in the header competing for it. Two rules follow
 * from that width and neither is cosmetic:
 *
 *   1. The header holds the icon and the label and NOTHING else. A "Detail →" affordance
 *      parked at the top-right took ~55px of a 140px content box, which forced a two-word
 *      label onto three lines and then collided with it. The whole card is already a link;
 *      the wording lives in the footer, where it can wrap without pushing anything.
 *   2. The label carries the tone colour rather than the icon carrying it alone. At this
 *      width the label is the only element with room to identify the tile at a glance, and
 *      a tinted chip beside coloured text reads as one object where a solid disc beside
 *      grey text read as two.
 *
 * The contract is otherwise unchanged: icon chip · uppercase label · large value · one
 * sub-line of context · optionally a status badge or a trend. Nothing else. A tile that
 * grew a second sub-line would stop being scannable, which is the only thing it is for.
 *
 * `value` is a STRING, always. Every figure here is a Prisma.Decimal upstream, and a tile
 * that accepted a number would silently round a district's nine-figure total at the
 * component boundary — the dashboard and the CSV export of the same figure would then
 * disagree, which is precisely the trust this product cannot spend.
 */

export type TileTone = "green" | "blue" | "purple" | "amber" | "teal" | "red" | "slate";

/**
 * The icon chip: a tone tint carrying the tone's INK step, not a solid disc carrying white.
 *
 * A 30px solid disc was the loudest thing in a 170px tile and read as the subject rather
 * than as the label's marker. The tint recedes to roughly the weight of the coloured label
 * it sits beside, which is what lets the two read as one header line.
 *
 * The glyph takes the ink step (badge text) and not the chart mark step: a mark on its own
 * 10% tint is ~2.9:1, which is a decorative glyph rather than a legible one.
 */
const CHIP: Record<TileTone, string> = {
  green: "bg-strong-bg text-strong",
  blue: "bg-[#e7eefd] text-brand-dark",
  purple: "bg-[#ece7f8] text-[#513a9c]",
  amber: "bg-monitor-bg text-monitor",
  teal: "bg-[#e0f3f1] text-[#0a6f66]",
  red: "bg-action-bg text-action",
  slate: "bg-na-bg text-na",
};

/**
 * The label ink, matched to the chip. Every step here is a text step (≥4.5:1 on white) —
 * the label is set at 10px and is the first thing read on the tile, so it cannot borrow a
 * chart mark colour the way a filled shape can.
 */
const LABEL: Record<TileTone, string> = {
  green: "text-strong",
  blue: "text-brand-dark",
  purple: "text-[#513a9c]",
  amber: "text-monitor",
  teal: "text-[#0a6f66]",
  red: "text-action",
  slate: "text-na",
};

/**
 * The trend pill. A tinted chip rather than bare coloured text, because at 11px a green
 * "−2.31%" beside a grey "vs prior year" is not obviously a different kind of thing.
 */
const DELTA: Record<DeltaTone, string> = {
  positive: "bg-strong-bg text-strong",
  negative: "bg-action-bg text-action",
  neutral: "bg-na-bg text-na",
};

const ARROW: Record<"up" | "down" | "flat", string> = {
  up: "↑",
  down: "↓",
  flat: "→",
};

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
  hrefLabel?: string;
  /** Shown on hover when the value is unavailable. */
  unavailableReason?: string;
}) {
  const unavailable = value === NOT_AVAILABLE;

  const VALUE_STATUS: Record<StatusRung, string> = {
    Strong: "text-strong",
    Acceptable: "text-acceptable",
    Monitor: "text-monitor",
    "Action Required": "text-action",
    "N/A": "text-na",
  };

  const footer = delta || status || statusNote || href;

  const body = (
    <>
      <div className="mb-2 flex items-center gap-2">
        {icon && (
          <span
            className={cn(
              "flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[8px]",
              CHIP[tone],
            )}
          >
            <Icon name={icon} size={14} />
          </span>
        )}

        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "flex items-start gap-1 text-[10px] font-bold uppercase leading-[1.3] tracking-[0.045em]",
              LABEL[tone],
            )}
          >
            <span className="min-w-0">{label}</span>
            {info && (
              <span
                title={info}
                aria-label={info}
                className="mt-[1px] flex h-[12px] w-[12px] flex-none cursor-help items-center justify-center rounded-full border border-line bg-panel text-[8px] font-bold normal-case text-muted-2"
              >
                i
              </span>
            )}
          </span>
          {caption && (
            <span className="mt-[2px] block truncate text-[9.5px] font-medium uppercase tracking-[0.05em] text-faint">
              {caption}
            </span>
          )}
        </span>
      </div>

      <div
        className={cn(
          // Proportional figures, not tabular: at 28px, tabular-nums gives every digit the
          // width of a zero and "121" reads loose. `tabular-nums` belongs in columns.
          "font-semibold leading-none [font-variant-numeric:proportional-nums]",
          // A status WORD set at 28px overflows a six-up grid, so a tile whose value is a
          // rung gets its own step down. One class or the other, never both — two arbitrary
          // font-size utilities on one element resolve by stylesheet order, not by the order
          // they were written in.
          valueStatus ? "text-[21px] tracking-[-0.3px]" : "text-[28px] tracking-[-0.6px]",
          unavailable ? "text-muted-2" : valueStatus ? VALUE_STATUS[valueStatus] : "text-ink",
        )}
        title={unavailable ? (unavailableReason ?? "Not enough data to work this out yet.") : undefined}
      >
        {value}
      </div>

      {sub && <div className="mt-1.5 text-[11.5px] leading-snug text-muted-2">{sub}</div>}

      {footer && (
        // The spacer, not a margin: it pushes the footer to the card's floor so the trend
        // pills line up across a row of tiles whose sub-lines wrap to different heights,
        // while still guaranteeing a gap when the card has no slack to give.
        <div aria-hidden className="min-h-[11px] flex-1" />
      )}
      {footer && (
        // No hairline above this row. The spacer already separates it, and a rule drawn
        // across a 170px tile turned six tiles into six boxed-in sub-cards.
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-2">
          {delta && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-1.5 py-[3px] text-[11px] font-semibold tabular-nums",
                DELTA[delta.tone],
              )}
            >
              {delta.direction && <span aria-hidden>{ARROW[delta.direction]}</span>}
              {delta.text}
            </span>
          )}
          {delta?.note && <span className="text-[11px] leading-snug text-muted-2">{delta.note}</span>}
          {status && <StatusBadge status={status} size="sm" reason={unavailableReason} />}
          {statusNote && <span className="text-[11px] leading-snug text-muted-2">{statusNote}</span>}
          {href && (
            // Last, and never wrapped internally: on a tile too narrow to hold it beside
            // the trend it drops to its own line rather than squeezing the figure's context.
            <span className="whitespace-nowrap text-[11px] font-medium text-brand group-hover:underline">
              {hrefLabel ?? "View"} →
            </span>
          )}
        </div>
      )}
    </>
  );

  const className =
    "group flex min-w-0 flex-col rounded-xl border border-line bg-white p-4 shadow-[0_1px_2px_rgba(15,32,56,0.04)]";

  if (href) {
    return (
      <Link href={href} className={cn(className, "transition-colors hover:border-[#c8d3e4]")}>
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
 */
export function KpiRow({ children, count = 6 }: { children: ReactNode; count?: number }) {
  return (
    <div
      className={cn(
        "grid gap-3 sm:grid-cols-2 lg:grid-cols-3",
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
 * A cut-down tile: no status ladder, no link, no trend judgement. Five of these sit in a
 * row inside a card, so the type scale steps down from the page-level tiles rather than
 * competing with them.
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
    positive: "text-strong",
    negative: "text-action",
    neutral: "text-ink",
  };
  return (
    <div className="flex min-w-0 flex-col rounded-lg border border-line-soft bg-panel px-3 py-3">
      {icon && (
        <span
          className={cn(
            "mb-2 flex h-[24px] w-[24px] flex-none items-center justify-center rounded-full",
            CHIP[tone],
          )}
        >
          <Icon name={icon} size={13} />
        </span>
      )}
      <span className="text-[9.5px] font-semibold uppercase leading-tight tracking-[0.05em] text-muted-2">
        {label}
      </span>
      <span
        className={cn(
          "mt-1 text-[17px] font-semibold leading-none tracking-[-0.3px] [font-variant-numeric:proportional-nums]",
          valueTone ? TEXT[valueTone] : "text-ink",
        )}
      >
        {value}
      </span>
      {note && <span className="mt-1 text-[10.5px] leading-snug text-muted-2">{note}</span>}
    </div>
  );
}
