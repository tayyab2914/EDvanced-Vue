import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/components/icons";

/**
 * The small shared pieces: link tabs, empty states, the policy echo card, and the banner
 * that admits when the period on screen is not the one that was asked for.
 */

/**
 * Tabs that are LINKS, not local state.
 *
 * The Fund Balance screen's four tabs must be addressable: an alert deep-links to the
 * Alerts tab, and §6.2's footer bar links to Forecast & Planning. Three of the four tab
 * implementations already in this codebase hold their selection in React state, which would
 * make those links land on the wrong tab.
 */
export function LinkTabs({
  tabs,
  active,
}: {
  tabs: { href: string; label: string; icon?: IconName; count?: number }[];
  active: string;
}) {
  return (
    <nav className="flex flex-wrap gap-1 border-b border-line" aria-label="Sections">
      {tabs.map((t) => {
        const isActive = t.href === active;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-[13px] font-medium transition-colors",
              isActive
                ? "border-brand text-brand"
                : "border-transparent text-muted hover:text-ink-soft",
            )}
          >
            {t.icon && <Icon name={t.icon} size={15} />}
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10.5px] font-semibold tabular-nums",
                  isActive ? "bg-[#e8eef7] text-brand" : "bg-line-soft text-muted",
                )}
              >
                {t.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * What a district sees before it has uploaded anything.
 *
 * Never a page of zeros. A grid of $0 tiles reads as "your district has no money" rather
 * than "no data has been uploaded", and the difference matters to whoever opens this first.
 */
export function EmptyState({
  title,
  children,
  action,
  href,
  icon = "upload",
}: {
  title: string;
  children: ReactNode;
  action?: string;
  href?: string;
  icon?: IconName;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-line bg-white px-6 py-14 text-center">
      <span className="mb-3.5 flex h-11 w-11 items-center justify-center rounded-xl bg-panel text-muted-2">
        <Icon name={icon} size={20} />
      </span>
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      <p className="mt-1.5 max-w-[46ch] text-[13px] leading-relaxed text-muted">{children}</p>
      {action && href && (
        <Link
          href={href}
          className="mt-4 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-brand-dark"
        >
          {action}
        </Link>
      )}
    </div>
  );
}

/**
 * "You asked for March; March has no data, so this is May."
 *
 * The data-browse page substitutes silently, which is tolerable for a browser. On an
 * executive dashboard it is a trust problem: someone who bookmarked a period and is quietly
 * shown a different one has been misled about what they are looking at.
 */
export function SubstitutionNotice({ asked, showing }: { asked: string; showing: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-monitor-bg bg-monitor-bg px-3.5 py-2.5 text-[12.5px] text-monitor">
      <span aria-hidden className="font-bold">
        !
      </span>
      <span>
        <strong className="font-semibold">{asked}</strong> has no committed data. Showing{" "}
        <strong className="font-semibold">{showing}</strong> instead.
      </span>
    </div>
  );
}

/**
 * A read-only echo of the district's own thresholds, beside the figures they judge.
 *
 * §5.16's argument for showing these to Viewers is that someone being measured should be
 * able to read the ruler. The "Manage" link appears only for those who can actually change
 * them — a link that leads to a page you cannot use is worse than no link.
 */
export function PolicyEchoCard({
  rows,
  manageHref,
  manageLabel = "Manage policies",
}: {
  rows: { label: string; value: string; note?: string }[];
  manageHref?: string;
  manageLabel?: string;
}) {
  return (
    <div>
      <dl className="flex flex-col">
        {rows.map((r, i) => (
          <div
            key={r.label}
            className={cn(
              "flex items-baseline justify-between gap-3 py-2",
              i < rows.length - 1 && "border-b border-line-soft",
            )}
          >
            <dt className="min-w-0 flex-1 text-[12.5px] text-muted">
              {r.label}
              {r.note && <span className="block text-[11px] text-muted-2">{r.note}</span>}
            </dt>
            <dd className="flex-none text-[12.5px] font-semibold tabular-nums text-ink">{r.value}</dd>
          </div>
        ))}
      </dl>
      {manageHref && (
        <Link
          href={manageHref}
          className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-brand hover:underline"
        >
          <Icon name="settings" size={13} />
          {manageLabel}
        </Link>
      )}
    </div>
  );
}

/** A two-column dashboard row that collapses on narrow screens. */
export function Row({
  children,
  cols = "2",
  className,
}: {
  children: ReactNode;
  cols?: "2" | "3" | "1-2" | "2-1";
  className?: string;
}) {
  const grid = {
    "2": "lg:grid-cols-2",
    "3": "lg:grid-cols-3",
    "1-2": "lg:grid-cols-[1fr_2fr]",
    "2-1": "lg:grid-cols-[2fr_1fr]",
  }[cols];
  return <div className={cn("grid gap-4", grid, className)}>{children}</div>;
}
