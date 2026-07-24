import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/components/icons";
import { StatusBadge } from "@/components/dashboard/status-badge";
import type { AlertSeverity } from "@/lib/alerts/catalog";
import type { StatusRung } from "@/lib/dashboard/status";

/**
 * Alerts on screen — §3.3c's summary and the per-domain lists on §4 to §7.
 *
 * Severity is never carried by colour alone: every row has a glyph AND a word. The ink
 * steps behind Monitor and Action Required are darkened for text contrast, which compresses
 * their hue separation (see app/globals.css), so the label is the identity channel and the
 * colour reinforces it.
 *
 * M4 replaced the bare "!" glyph with a warning triangle at the client's request. The
 * triangle is a stronger shape signal than a punctuation mark at 18px, which matters
 * precisely because the two severities it distinguishes are the closest pair on the ladder.
 */

/** The catalogue's two severities, plus the informational tier §3.3c counts. */
export type DisplaySeverity = AlertSeverity | "INFORMATIONAL";

const RUNG: Record<DisplaySeverity, StatusRung> = {
  CRITICAL: "Action Required",
  WARNING: "Monitor",
  INFORMATIONAL: "Acceptable",
};

/** The word on the badge. "Review" reads as an instruction where "Monitor" reads as a state. */
const BADGE_LABEL: Record<DisplaySeverity, string> = {
  CRITICAL: "Action Required",
  WARNING: "Review",
  INFORMATIONAL: "Informational",
};

const GLYPH: Record<DisplaySeverity, IconName> = {
  CRITICAL: "warning",
  WARNING: "warning",
  INFORMATIONAL: "lightbulb",
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
  /** Makes each row a link — the client's "allow alerts to become clickable". */
  href,
}: {
  alerts: AlertRow[];
  empty?: string;
  max?: number;
  href?: string;
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
      {shown.map((a, i) => {
        const body = (
          <>
            <span
              aria-hidden
              className={cn(
                "mt-[1px] flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full",
                CHIP[a.severity],
              )}
            >
              <Icon name={GLYPH[a.severity]} size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-medium leading-snug text-ink-muted">
                {a.message}
              </span>
              <span className="mt-0.5 block text-[11px] text-muted-2">{a.title}</span>
            </span>
            <StatusBadge
              status={RUNG[a.severity]}
              label={BADGE_LABEL[a.severity]}
              size="sm"
              dot={false}
              className="mt-[1px] flex-none"
            />
            {href && (
              <span aria-hidden className="mt-[3px] flex-none text-[11px] text-muted-2">
                ›
              </span>
            )}
          </>
        );

        return (
          <li
            key={a.id}
            className={cn(i < shown.length - 1 && "border-b border-line-soft")}
          >
            {href ? (
              <Link
                href={href}
                className="-mx-1.5 flex items-start gap-2.5 rounded-lg px-1.5 py-3 transition-colors hover:bg-panel"
              >
                {body}
              </Link>
            ) : (
              <span className="flex items-start gap-2.5 py-3">{body}</span>
            )}
          </li>
        );
      })}
      {max && alerts.length > max && (
        <li className="pt-2.5 text-[11.5px] text-muted-2">and {alerts.length - max} more.</li>
      )}
    </ul>
  );
}

/**
 * §3.3c's Alert Summary — the Executive dashboard's shortlist.
 *
 * It used to be three rows of counts. The client's note was that the section "looks good"
 * but wanted the icons changed, and the mockup beside it shows the ALERTS THEMSELVES rather
 * than a tally — which is the better card: a count of two tells a superintendent to click,
 * where the two sentences tell them whether they need to.
 *
 * The counts are kept as a strip beneath, so nothing that was on the card has been lost.
 */
export function AlertSummary({
  alerts,
  critical,
  warning,
  informational,
  href,
  max = 3,
}: {
  alerts: AlertRow[];
  critical: number;
  warning: number;
  informational: number;
  href: string;
  max?: number;
}) {
  const counts: { severity: DisplaySeverity; label: string; count: number }[] = [
    { severity: "CRITICAL", label: "Critical", count: critical },
    { severity: "WARNING", label: "Warning", count: warning },
    { severity: "INFORMATIONAL", label: "Informational", count: informational },
  ];

  return (
    <div className="flex flex-col gap-3">
      <AlertList
        alerts={alerts}
        max={max}
        href={href}
        empty="No thresholds have been crossed this period."
      />

      <ul className="grid grid-cols-3 gap-2 border-t border-line-soft pt-3">
        {counts.map((c) => (
          <li key={c.severity} className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={cn(
                  "flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full",
                  CHIP[c.severity],
                )}
              >
                <Icon name={GLYPH[c.severity]} size={10} />
              </span>
              <span className="text-[16px] font-semibold tabular-nums text-ink">{c.count}</span>
            </span>
            <span className="mt-0.5 block truncate text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-2">
              {c.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * §3.4's Key Insights — one plain sentence with a direction glyph.
 *
 * The client's future enhancement was "allow insights to become clickable", and each
 * insight already knows which dashboard it is about, so `href` is threaded from
 * lib/alerts/insights.ts rather than guessed here.
 */
export function InsightList({
  insights,
  layout = "grid",
}: {
  insights: { id: string; direction: "up" | "down" | "flag"; text: string; detail?: string; href?: string }[];
  layout?: "grid" | "column";
}) {
  if (insights.length === 0) return null;

  const chip = {
    up: "bg-strong-bg text-strong",
    down: "bg-action-bg text-action",
    flag: "bg-monitor-bg text-monitor",
  };
  const glyph: Record<"up" | "down" | "flag", IconName> = {
    up: "trend-up",
    down: "trend-down",
    flag: "warning",
  };

  return (
    <ul className={cn(layout === "grid" ? "grid gap-3 md:grid-cols-3" : "flex flex-col")}>
      {insights.map((i, idx) => {
        const body = (
          <>
            <span
              aria-hidden
              className={cn(
                "flex h-[28px] w-[28px] flex-none items-center justify-center rounded-lg",
                chip[i.direction],
              )}
            >
              <Icon name={glyph[i.direction]} size={15} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-medium leading-relaxed text-ink-muted">
                {i.text}
              </span>
              {i.detail && (
                <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-2">
                  {i.detail}
                </span>
              )}
            </span>
          </>
        );

        return (
          <li
            key={i.id}
            className={cn(
              layout === "column" && idx < insights.length - 1 && "border-b border-line-soft",
            )}
          >
            {i.href ? (
              <Link
                href={i.href}
                className="-mx-1.5 flex items-start gap-2.5 rounded-lg px-1.5 py-2.5 transition-colors hover:bg-panel"
              >
                {body}
              </Link>
            ) : (
              <span className="flex items-start gap-2.5 py-2.5">{body}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
