import { cn } from "@/lib/cn";
import type { StatusRung } from "@/lib/dashboard/status";
import { PANEL_RUNG } from "@/components/dashboard/overview-panel";

/**
 * The status badge — Strong · Acceptable · Monitor · Action Required · N/A.
 *
 * Restyled to the executive redesign's pill: 20px radius, an 18% tint of the rung's hue
 * with the full-strength ink on top. The palette is PANEL_RUNG — the lower band's, where
 * Acceptable turns BLUE — imported from overview-panel.tsx rather than copied, so a badge
 * on the Revenues page and a pill on the Executive health table can never disagree.
 *
 * Always renders its WORD, never a bare colour. That is not politeness: the label is the
 * identity channel and the colour reinforces it. A badge that showed only a coloured dot
 * would be unreadable to a reader with deuteranopia, and this is the one signal in the
 * product that must not be.
 */

/** The chart fill for a rung — the mark step, never the ink step. */
export const RUNG_MARK: Record<StatusRung, string> = {
  Strong: "var(--color-strong-mark)",
  Acceptable: "var(--color-acceptable-mark)",
  Monitor: "var(--color-monitor-mark)",
  "Action Required": "var(--color-action-mark)",
  "N/A": "var(--color-na)",
};

export function StatusBadge({
  status,
  /** Overrides the word. Use only when the domain has its own name for the same rung. */
  label,
  /** Why the figure could not be computed. Shown on hover; only meaningful for N/A. */
  reason,
  size = "md",
  /** The design's pills carry no dot, so it is opt-in now rather than opt-out. */
  dot = false,
  className,
}: {
  status: StatusRung;
  label?: string;
  reason?: string;
  /** "lg" is §3.2a's Financial Health Summary, where the badge IS the column. */
  size?: "sm" | "md" | "lg";
  dot?: boolean;
  className?: string;
}) {
  const rung = PANEL_RUNG[status];
  const text = label ?? (status === "N/A" ? "Not available" : status);

  const SIZE = {
    sm: "px-[7px] py-[2px] text-[10px] tracking-[0.1px]",
    md: "px-[8px] py-[3px] text-[11px] tracking-[0.11px]",
    lg: "px-[9px] py-[5px] text-[12px] tracking-[0.12px]",
  } as const;

  return (
    <span
      data-status-badge
      title={status === "N/A" ? (reason ?? "Not enough data to work this out yet.") : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[20px] font-semibold leading-[normal]",
        SIZE[size],
        className,
      )}
      style={{ background: rung.bg, color: rung.fg }}
    >
      {dot && (
        <span
          className="size-1.5 flex-none rounded-full"
          style={{ background: rung.fg }}
        />
      )}
      {text}
    </span>
  );
}
