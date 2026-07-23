import Link from "next/link";
import { cn } from "@/lib/cn";
import { StatusBadge } from "@/components/dashboard/status-badge";
import type { AlertSeverity } from "@/lib/alerts/catalog";
import type { StatusRung } from "@/lib/dashboard/status";

/**
 * Alerts on screen — §3.3c's summary and the per-domain lists on §4 to §7.
 *
 * Severity is never carried by colour alone: every row has an icon glyph AND a word. The
 * ink steps behind Monitor and Action Required are darkened for text contrast, which
 * compresses their hue separation (see app/globals.css), so the label is the identity
 * channel and the colour reinforces it.
 */

/** The catalogue's two severities, plus the informational tier §3.3c counts. */
export type DisplaySeverity = AlertSeverity | "INFORMATIONAL";

const RUNG: Record<DisplaySeverity, StatusRung> = {
  CRITICAL: "Action Required",
  WARNING: "Monitor",
  INFORMATIONAL: "Acceptable",
};

const GLYPH: Record<DisplaySeverity, string> = {
  CRITICAL: "!",
  WARNING: "!",
  INFORMATIONAL: "i",
};

const CHIP: Record<DisplaySeverity, string> = {
  CRITICAL: "bg-action-bg text-action",
  WARNING: "bg-monitor-bg text-monitor",
  INFORMATIONAL: "bg-acceptable-bg text-acceptable",
};

export interface AlertRow {
  id: string;
  severity: DisplaySeverity;
  title: string;
  message: string;
}

export function AlertList({
  alerts,
  empty = "Nothing needs attention in this period.",
  max,
}: {
  alerts: AlertRow[];
  empty?: string;
  max?: number;
}) {
  if (alerts.length === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg bg-strong-bg px-3.5 py-3 text-[12.5px] text-strong">
        <span aria-hidden className="font-bold">
          ✓
        </span>
        {empty}
      </div>
    );
  }

  const shown = max ? alerts.slice(0, max) : alerts;

  return (
    <ul className="flex flex-col">
      {shown.map((a, i) => (
        <li
          key={a.id}
          className={cn("flex items-start gap-2.5 py-2.5", i < shown.length - 1 && "border-b border-line-soft")}
        >
          <span
            aria-hidden
            className={cn(
              "mt-[1px] flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full text-[11px] font-bold",
              CHIP[a.severity],
            )}
          >
            {GLYPH[a.severity]}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] leading-snug text-ink-muted">{a.message}</p>
            <p className="mt-0.5 text-[11px] text-muted-2">{a.title}</p>
          </div>
          <StatusBadge status={RUNG[a.severity]} size="sm" dot={false} className="mt-[1px] flex-none" />
        </li>
      ))}
      {max && alerts.length > max && (
        <li className="pt-2.5 text-[11.5px] text-muted-2">
          and {alerts.length - max} more.
        </li>
      )}
    </ul>
  );
}

/** §3.3c's three-row summary: a count per severity, each with what it means. */
export function AlertSummary({
  critical,
  warning,
  informational,
  href,
}: {
  critical: number;
  warning: number;
  informational: number;
  href: string;
}) {
  const rows: { severity: DisplaySeverity; label: string; note: string; count: number }[] = [
    { severity: "CRITICAL", label: "Critical alerts", note: "Action required immediately", count: critical },
    { severity: "WARNING", label: "Warning alerts", note: "Monitor and address soon", count: warning },
    { severity: "INFORMATIONAL", label: "Informational", note: "For awareness", count: informational },
  ];

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.severity}>
          <Link
            href={href}
            className="flex items-center gap-3 rounded-lg border border-line-soft px-3 py-2.5 transition-colors hover:border-[#c8d3e4]"
          >
            <span
              aria-hidden
              className={cn(
                "flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg text-[13px] font-bold",
                CHIP[r.severity],
              )}
            >
              {GLYPH[r.severity]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-medium text-ink">{r.label}</span>
              <span className="block truncate text-[11px] text-muted-2">{r.note}</span>
            </span>
            <span className="flex-none text-[17px] font-semibold tabular-nums text-ink">{r.count}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** §3.4's Key Insights — one plain sentence with a direction glyph. */
export function InsightList({
  insights,
}: {
  insights: { id: string; direction: "up" | "down" | "flag"; text: string }[];
}) {
  if (insights.length === 0) return null;

  const chip = {
    up: "bg-strong-bg text-strong",
    down: "bg-action-bg text-action",
    flag: "bg-monitor-bg text-monitor",
  };
  const glyph = { up: "↑", down: "↓", flag: "⚑" };

  return (
    <ul className="grid gap-4 md:grid-cols-3">
      {insights.map((i) => (
        <li key={i.id} className="flex items-start gap-2.5">
          <span
            aria-hidden
            className={cn(
              "flex h-[24px] w-[24px] flex-none items-center justify-center rounded-full text-[12px] font-bold",
              chip[i.direction],
            )}
          >
            {glyph[i.direction]}
          </span>
          <p className="text-[12.5px] leading-relaxed text-ink-muted">{i.text}</p>
        </li>
      ))}
    </ul>
  );
}
