import Link from "next/link";
import { cn } from "@/lib/cn";
import { CountUp } from "@/components/count-up";
import { ArrowGlyph } from "@/components/dashboard/overview-panel";
import type { StatusRung } from "@/lib/dashboard/status";

/**
 * The Revenue redesign's shared vocabulary — the pills, chips and capsule strip that recur
 * across the page's cards (Figma 46:2918). Small enough to live together; every colour and
 * measurement is the design's.
 *
 * The pace pill palette here is the REVENUE band's, not kpi-tile's RUNG_PILL: the mockup
 * letters its Critical rows #fd4438 on an 18% wash of #ee201c-red, where the Overview tiles
 * use the softer #e65f2b pair. Copying the difference is the point — same licence as
 * overview-panel.tsx's PANEL_RUNG documents.
 */

/** The row pills on the source table and the movers — "Critical", "Ahead", "Behind"… */
export const PACE_PILL: Record<StatusRung, { bg: string; fg: string }> = {
  Strong: { bg: "rgba(26,147,46,0.18)", fg: "#1a932e" },
  Acceptable: { bg: "rgba(26,147,46,0.18)", fg: "#1a932e" },
  Monitor: { bg: "rgba(239,138,31,0.18)", fg: "#b76a12" },
  "Action Required": { bg: "rgba(253,68,56,0.18)", fg: "#fd4438" },
  "N/A": { bg: "rgba(172,172,171,0.18)", fg: "#3a3a3a" },
};

export function PacePill({
  status,
  size = "sm",
  className,
}: {
  /**
   * Structurally a `PaceStatus`, loosened to any word on a rung: the Expenditure band's
   * function table letters rows "Overspent" and "Approaching" — local vocabulary the same
   * way the strip's "Healthy" is — while the rung still comes from the shared ladder.
   */
  status: { label: string; rung: StatusRung };
  /** sm — the table's 10px (the mockup's 8px, normalised); md — the movers' 12px. */
  size?: "sm" | "md";
  className?: string;
}) {
  const c = PACE_PILL[status.rung];
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center whitespace-nowrap rounded-[20px] px-[8px] py-[5px] leading-normal",
        size === "sm" ? "text-[10px] tracking-[0.1px]" : "text-[12px] tracking-[0.12px]",
        className,
      )}
      style={{ background: c.bg, color: c.fg }}
    >
      {status.label}
    </span>
  );
}

/** The outlined white capsule naming a fund — "1000 — General Fund". */
export function FundChip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit max-w-full items-center truncate rounded-[20px] border-[0.8px] border-[#9e9e9e] bg-white px-[8px] py-px text-[10px] leading-normal tracking-[0.08px] text-[#060606]",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * The white capsule link with the coloured ↗ — "Go to Revenue Details", "View Revenue
 * details", "View All 8 Alerts". The Key insight card recolours the whole capsule instead.
 */
export function PillLink({
  href,
  children,
  arrow = "#1A932E",
  className,
}: {
  href: string;
  children: React.ReactNode;
  /** The arrow's ink — the design's green on most cards, red on the alerts card. */
  arrow?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex h-[20px] w-fit flex-none items-center gap-[2px] rounded-[22px] bg-white pl-[3px] pr-[9px] transition-opacity hover:opacity-75",
        className,
      )}
    >
      <span className="flex size-[16px] flex-none items-center justify-center">
        <ArrowGlyph color={arrow} className="-rotate-45" />
      </span>
      <span className="whitespace-nowrap text-[10px] leading-[12px] tracking-[0.2px] text-[#060606]">
        {children}
      </span>
    </Link>
  );
}

export interface CapsuleStat {
  label: string;
  value: string;
  /** Colours the figure — the strip's red for a negative variance. */
  tone?: "default" | "negative" | "positive";
  /** "-29.07%" / "current budget less actual" — the small grey line under the figure. */
  note?: string;
}

const CAPSULE_TONE = {
  default: "text-[#060606]",
  negative: "text-[#fd4438]",
  positive: "text-[#1a932e]",
} as const;

/**
 * The rounded capsule strip under the charts — Figma 46:2987 / 46:3188: 56% white on the
 * #e7e7e7 border, 24px radius, 27px hairline drivers between the cells. The mockup's 8px
 * labels are set at 10px, the same normalisation every tiny label in this redesign gets.
 */
export function CapsuleStatStrip({ items, className }: { items: CapsuleStat[]; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-stretch overflow-clip rounded-[24px] border border-[#e7e7e7] bg-white/[0.56] px-[5px] py-[12px]",
        className,
      )}
    >
      {items.map((item, i) => (
        <div key={item.label} className="contents">
          {i > 0 && <div aria-hidden className="w-px flex-none self-center bg-[#e7e7e7]" style={{ height: 27 }} />}
          <div className="flex min-w-0 flex-1 flex-col items-start gap-[2px] px-[9px]">
            <span className="text-[10px] font-medium leading-[14px] text-[#060606]">
              {item.label}
            </span>
            <span
              className={cn(
                "whitespace-nowrap text-[14px] font-medium leading-[14px] [font-variant-numeric:proportional-nums]",
                CAPSULE_TONE[item.tone ?? "default"],
              )}
            >
              <CountUp value={item.value} />
            </span>
            {item.note && (
              <span className="text-[10px] leading-[12px] tracking-[0.16px] text-[#060606]">
                {item.note}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
