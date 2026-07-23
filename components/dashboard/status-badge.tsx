import { cn } from "@/lib/cn";
import type { StatusRung } from "@/lib/dashboard/status";

/**
 * The status badge — Strong · Acceptable · Monitor · Action Required · N/A.
 *
 * Always renders its WORD, never a bare colour. That is not politeness: the ink steps
 * behind these badges are darkened for text contrast, which compresses their hue
 * separation (see the note in app/globals.css). The label is the identity channel and the
 * colour reinforces it. A badge that showed only a coloured dot would be unreadable to a
 * reader with deuteranopia, and this is the one signal in the product that must not be.
 */

const RUNG: Record<StatusRung, { text: string; bg: string; dot: string }> = {
  Strong: { text: "text-strong", bg: "bg-strong-bg", dot: "bg-strong-mark" },
  Acceptable: { text: "text-acceptable", bg: "bg-acceptable-bg", dot: "bg-acceptable-mark" },
  Monitor: { text: "text-monitor", bg: "bg-monitor-bg", dot: "bg-monitor-mark" },
  "Action Required": { text: "text-action", bg: "bg-action-bg", dot: "bg-action-mark" },
  "N/A": { text: "text-na", bg: "bg-na-bg", dot: "bg-na" },
};

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
  dot = true,
  className,
}: {
  status: StatusRung;
  label?: string;
  reason?: string;
  size?: "sm" | "md";
  dot?: boolean;
  className?: string;
}) {
  const rung = RUNG[status];
  const text = label ?? (status === "N/A" ? "Not available" : status);

  return (
    <span
      title={status === "N/A" ? (reason ?? "Not enough data to work this out yet.") : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-semibold",
        size === "sm" ? "px-1.5 py-0.5 text-[10.5px]" : "px-2 py-[3px] text-[11.5px]",
        rung.bg,
        rung.text,
        className,
      )}
    >
      {dot && <span className={cn("h-[6px] w-[6px] flex-none rounded-full", rung.dot)} />}
      {text}
    </span>
  );
}
