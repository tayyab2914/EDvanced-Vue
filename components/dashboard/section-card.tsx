import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * The card every dashboard section sits in: title, optional subtitle, an optional control
 * on the right, the content, and an optional footer link.
 *
 * One card does one job. That is the discipline behind the client's "use of white space" —
 * a card that answered two questions would need a divider, and a divider is where a
 * dashboard starts becoming a spreadsheet.
 */
export function SectionCard({
  title,
  subtitle,
  info,
  badge,
  control,
  footer,
  footerHref,
  footerNote,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  subtitle?: string;
  /** One sentence explaining what the card shows, on the title's ⓘ. */
  info?: string;
  /** A status badge that belongs to the card as a whole, set beside its title. */
  badge?: ReactNode;
  /** A range toggle, a "view by" — anything that changes only this card. */
  control?: ReactNode;
  footer?: string;
  footerHref?: string;
  /** A caveat set opposite the footer link — "All amounts are unaudited". */
  footerNote?: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col rounded-xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(15,32,56,0.03)]",
        className,
      )}
    >
      <header className="mb-3.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* #1F2937 and a step up in size — the client's "section headings" rung. The old
              heading wore the secondary-label token, which put a card's title at the same
              weight as the labels inside it and flattened the hierarchy. */}
          <h2 className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.055em] text-heading">
            <span className="truncate">{title}</span>
            {badge}
            {info && (
              <span
                title={info}
                aria-label={info}
                className="flex h-[13px] w-[13px] flex-none cursor-help items-center justify-center rounded-full border border-line bg-panel text-[9px] font-bold text-muted-2"
              >
                i
              </span>
            )}
          </h2>
          {subtitle && <p className="mt-1 text-[12px] text-muted-2">{subtitle}</p>}
        </div>
        {control && <div className="flex-none">{control}</div>}
      </header>

      <div className={cn("min-w-0 flex-1", bodyClassName)}>{children}</div>

      {(footer && footerHref) || footerNote ? (
        <footer className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-3">
          {footer && footerHref ? (
            <Link
              href={footerHref}
              className="text-[12.5px] font-semibold text-brand transition-opacity hover:opacity-75"
            >
              {footer} →
            </Link>
          ) : (
            <span />
          )}
          {footerNote && <span className="text-[11px] text-muted-2">{footerNote}</span>}
        </footer>
      ) : null}
    </section>
  );
}

/**
 * The footer bar four dashboards end with — a note and, usually, somewhere to go next.
 */
export function FooterInfoBar({
  children,
  action,
  href,
}: {
  children: ReactNode;
  action?: string;
  href?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d5e3fb] bg-[#f2f7ff] px-4 py-3">
      <p className="flex min-w-0 items-start gap-2 text-[12.5px] leading-relaxed text-[#33507a]">
        <span aria-hidden className="font-semibold text-brand">
          ⓘ
        </span>
        <span>{children}</span>
      </p>
      {action && href && (
        <Link
          href={href}
          className="flex-none rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-medium text-white transition-colors hover:bg-brand-dark"
        >
          {action} →
        </Link>
      )}
    </div>
  );
}

/**
 * "Data as of 31 May 2026" — a trust signal on every dashboard.
 *
 * The date is the END OF THE SCOPED PERIOD, not the upload timestamp. A district that
 * uploads April's figures in June is looking at April's position, and stamping the page
 * with the upload date would date the numbers wrongly.
 */
export function DataAsOf({ date, note }: { date: Date | null; note?: string }) {
  if (!date) return null;
  return (
    <p className="flex items-center justify-end gap-1.5 text-[11.5px] text-muted-2">
      <span aria-hidden>🗓</span>
      Data as of{" "}
      {date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}
      {note && <span className="text-faint">· {note}</span>}
    </p>
  );
}

/** A row of small label/value pairs under a chart — §7.2's 12-month high/low strip. */
export function StatStrip({ items }: { items: { label: string; value: string; note?: string }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line-soft pt-3.5 sm:grid-cols-4">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="truncate text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-2">
            {i.label}
          </dt>
          <dd className="mt-1 truncate text-[14.5px] font-semibold tabular-nums text-ink">{i.value}</dd>
          {i.note && <dd className="truncate text-[11px] text-muted-2">{i.note}</dd>}
        </div>
      ))}
    </dl>
  );
}
