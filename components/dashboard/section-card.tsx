import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { ArrowGlyph } from "@/components/dashboard/overview-panel";
import { InfoDot } from "@/components/dashboard/info-dot";
import { CARD_TITLE, CARD_SUBTITLE, METRIC_LABEL } from "@/components/dashboard/type-scale";

/**
 * The card every dashboard section sits in: title, optional subtitle, an optional control
 * on the right, the content, and an optional footer link.
 *
 * Restyled to the executive redesign's card (Figma 3:11828's frame): 62% white on the
 * canvas at a 14px radius, no border and no shadow — the ground colour is what makes it a
 * card. The header speaks OverviewPanelHeader's ramp: a 16px sentence-case title with the
 * white "Go to …" capsule beside it, and the 10px bold sub-line at 56% black. The footer
 * link the old card parked at the bottom IS that capsule now, which is where the design
 * puts every card's destination.
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
  /** The label of the card's destination capsule — "View revenue detail". */
  footer?: string;
  footerHref?: string;
  /** A caveat set at the card's foot — "All amounts are unaudited". */
  footerNote?: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col rounded-[14px] bg-white/[0.62] p-[18px]",
        className,
      )}
    >
      <header className="mb-3.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-[14px] gap-y-1">
            <h2 className={cn("flex min-w-0 items-center gap-1.5", CARD_TITLE)}>
              {/* Wraps rather than truncates: at 16px a card in a narrow rail column loses
                  half its name to an ellipsis, and a second line is cheaper than a title
                  nobody can read. */}
              <span className="min-w-0">{title}</span>
              {badge}
              {info && <InfoDot text={info} />}
            </h2>
            {footer && footerHref && (
              <Link
                href={footerHref}
                className="flex h-[20px] flex-none items-center gap-[2px] rounded-[22px] bg-white pl-[3px] pr-[9px] transition-opacity hover:opacity-75"
              >
                <span className="flex size-[16px] items-center justify-center">
                  <ArrowGlyph color="#1A932E" className="-rotate-45" />
                </span>
                <span className="whitespace-nowrap text-[10px] leading-[12px] tracking-[0.2px] text-[#060606]">
                  {footer}
                </span>
              </Link>
            )}
          </div>
          {subtitle && (
            <p className={cn("mt-[2px]", CARD_SUBTITLE)}>
              {subtitle}
            </p>
          )}
        </div>
        {control && <div className="flex-none">{control}</div>}
      </header>

      <div className={cn("min-w-0 flex-1", bodyClassName)}>{children}</div>

      {footerNote && (
        <footer className="mt-3.5 border-t border-black/10 pt-2.5 text-[12px] leading-[1.5] text-[#060606]">
          {footerNote}
        </footer>
      )}
    </section>
  );
}

/**
 * The card's destination, set at the TOP RIGHT rather than beside the title.
 *
 * The Alerts redesign gives every domain card two links, and they are not the same link:
 * this one leaves for that domain's dashboard, and `CardFooterLink` below stays inside
 * Alerts. Putting the departure at the far right and the continuation at the foot is what
 * keeps a reader from having to read both to tell them apart.
 *
 * Green, and the same 45°-rotated `ArrowGlyph` the card title's capsule uses — one arrow
 * shape for "goes somewhere else" across the product.
 */
export function CardActionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-[6px] whitespace-nowrap text-[11px] leading-[14px] tracking-[0.1px] text-[#1A932E] transition-opacity hover:opacity-70"
    >
      <ArrowGlyph color="#1A932E" className="-rotate-45" />
      {children}
    </Link>
  );
}

/**
 * The "View all revenue alerts ›" link at a card's foot.
 *
 * `mt-auto` is why the card is asked for `bodyClassName="flex flex-col"`: in a grid row the
 * cards stretch to the tallest, and without it a short card's link floats up mid-air while
 * its neighbour's sits at the bottom. The two links must line up along the row.
 */
export function CardFooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="mt-auto inline-flex w-fit items-center gap-1.5 pt-4 text-[12px] font-medium text-brand transition-colors hover:text-brand-dark"
    >
      {children}
      <span aria-hidden className="text-[11px]">
        ›
      </span>
    </Link>
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
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-white/[0.62] px-[18px] py-3">
      <p className="flex min-w-0 items-start gap-2 text-[12px] leading-[1.5] text-[#060606]">
        <span aria-hidden className="font-semibold text-brand">
          ⓘ
        </span>
        <span>{children}</span>
      </p>
      {action && href && (
        <Link
          href={href}
          className="flex-none rounded-full bg-brand px-4 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-brand-dark"
        >
          {action} →
        </Link>
      )}
    </div>
  );
}

/**
 * `DataAsOf` — the "🗓 Data as of 31 May 2026 · All funds" line that used to sit under every
 * dashboard header — is gone. It stated the applied filters a SECOND time (it was handed
 * `scopeDescription(scope)`, built from the same `scope.filters.chips` the header's chips
 * are), so a filtered page read "Fund Type: General" twice in two adjacent lines.
 *
 * The date itself survives, at the end of the header's "Showing:" row — see
 * components/dashboard/filter-bar.tsx, which also keeps the rule the old component carried:
 * the date is the END OF THE SCOPED PERIOD, not the upload timestamp. A district that uploads
 * April's figures in June is looking at April's position, and stamping the page with the
 * upload date would date the numbers wrongly.
 */

/** A row of small label/value pairs under a chart — §7.2's 12-month high/low strip.
 *  Speaks the redesign's rail ramp: a black label over a black figure, separated by
 *  size and weight rather than by colour. */
export function StatStrip({ items }: { items: { label: string; value: string; note?: string }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-black/10 pt-3.5 sm:grid-cols-4">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className={cn("truncate", METRIC_LABEL)}>{i.label}</dt>
          <dd className="mt-1 truncate text-[14px] font-semibold tabular-nums text-[#060606]">
            {i.value}
          </dd>
          {i.note && (
            <dd className="truncate text-[11px] font-normal text-[#060606]">{i.note}</dd>
          )}
        </div>
      ))}
    </dl>
  );
}
