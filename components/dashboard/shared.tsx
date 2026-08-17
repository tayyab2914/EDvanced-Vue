import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { CARD_TITLE } from "@/components/dashboard/type-scale";
import { Icon, type IconName } from "@/components/icons";
import { MANAGE } from "@/lib/dashboard/cta";

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
    /**
     * The Fund Balance redesign's segmented capsule (Figma 55:3736): a centred #f7f7f7
     * track at 38px radius, the active tab a white pill inside it, 10px bold labels with
     * their 10px glyphs, and the alerts count as the design's tinted red disc. The mockup
     * letters the labels at 10px and the disc's numeral at 7px; the numeral is set at 9px —
     * the same smallest-legible normalisation every tiny label in this redesign gets.
     */
    <nav
      aria-label="Sections"
      className="mx-auto flex w-fit max-w-full items-center overflow-x-auto rounded-[38px] bg-[#f7f7f7] p-px"
    >
      {tabs.map((t) => {
        const isActive = t.href === active;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex h-[31px] flex-none items-center gap-[6px] whitespace-nowrap rounded-[38px] px-[13px] text-[10px] font-bold leading-[2] tracking-[0.1px] text-[#060606] transition-colors",
              isActive ? "bg-white shadow-[0_1px_2px_rgba(0,6,6,0.06)]" : "hover:bg-white/60",
            )}
          >
            {t.icon && <Icon name={t.icon} size={11} />}
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="flex size-[15px] flex-none items-center justify-center rounded-full bg-[rgba(238,32,28,0.18)] text-[10px] font-bold leading-none tabular-nums text-[#ee201c]">
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
    <div className="flex flex-col items-center rounded-[14px] border border-dashed border-black/15 bg-white/[0.62] px-6 py-14 text-center">
      <span className="mb-3.5 flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#060606]">
        <Icon name={icon} size={20} />
      </span>
      <h2 className={CARD_TITLE}>{title}</h2>
      <p className="mt-1.5 max-w-[46ch] text-[13px] leading-relaxed text-[#060606]">
        {children}
      </p>
      {action && href && (
        <Link
          href={href}
          className="mt-4 rounded-full bg-brand px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-brand-dark"
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
    <div className="flex items-start gap-2 rounded-[10px] bg-[rgba(239,138,31,0.18)] px-3.5 py-2.5 text-[12px] text-[#b76a12]">
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
 * "This figure is fund-level. The cost-centre filter above does not reach it."
 *
 * ---------------------------------------------------------------------------
 * WHY THIS BADGE HAS TO EXIST
 *
 * Cash and fund balances are stored PER FUND and nothing finer — `CashPosition` and
 * `OpeningFundBalance` have no cost-centre column, because a district closes its books at
 * the fund grain. Revenue and expenditure detail do carry one.
 *
 * So when someone filters to a department, half the screen narrows and half cannot. Three
 * options existed and only one of them is honest:
 *
 *   - Hide the cash cards. The reader loses context and assumes the data is missing.
 *   - Show them narrowed anyway. Impossible — there is no column to narrow on — and every
 *     attempt to fake it (subtract department spending from district opening balance)
 *     produces a plausible number that is not any real quantity.
 *   - Show them fund-level and SAY SO. This.
 *
 * Same principle as `SubstitutionNotice` above: the platform never quietly shows one thing
 * while the controls claim another. See lib/finance/filter.ts for the enforcement, which is
 * a matter of which where-builder each query uses.
 * ---------------------------------------------------------------------------
 */
export function FundLevelOnly({ what = "This figure is" }: { what?: string }) {
  return (
    <span
      title={`${what} tracked per fund. Cost centre filters do not apply to it.`}
      className="inline-flex items-center gap-1 rounded-full border border-line bg-panel px-2 py-0.5 text-[11px] font-medium text-[#060606]"
    >
      <Icon name="building" size={10} />
      Fund level
    </span>
  );
}

/**
 * The page-wide version, for the top of a dashboard whose whole subject is fund-grain.
 *
 * The Cash and Fund Balance dashboards are entirely cash and balances, so badging every
 * card would be noise where one sentence at the top is the whole story.
 */
export function FundLevelNotice({ subject }: { subject: string }) {
  return (
    <div className="flex items-start gap-2 rounded-[10px] bg-white/[0.62] px-3.5 py-2.5 text-[12px] text-[#060606]">
      <span aria-hidden className="mt-px flex-none text-[#060606]">
        <Icon name="building" size={14} />
      </span>
      <span>
        <strong className="font-semibold">Cost centre filters do not apply here.</strong>{" "}
        {subject} is tracked per fund, so these figures honour the Fund Type and Fund Code
        filters in full and are shown at fund level regardless of the cost centre selection.
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
  manageLabel = MANAGE.policies,
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
            <dt className="min-w-0 flex-1 text-[12px] text-[#060606]">
              {r.label}
              {r.note && <span className="block text-[11px] text-[#060606]">{r.note}</span>}
            </dt>
            <dd className="flex-none text-[12px] font-semibold tabular-nums text-[#060606]">{r.value}</dd>
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

/**
 * "1000 — General Fund" — the small tag that says WHERE a figure came from.
 *
 * Rendered by the mover cards, and only on the All Funds view. The client's note: a
 * district-wide variance that does not name a fund "does not tell me where to go". The tag
 * names it, and links to the same screen with the fund selector moved — the drill-down a
 * reader expects is this page, narrowed.
 *
 * The alert lists used to render these too. They now use the wider two-column WHERE rows in
 * components/dashboard/alert-list.tsx, which align their amounts down the card where a row
 * of inline tags could not.
 *
 * A LINK, not a filter chip with an ✕. Nothing here holds selection state; the fund scope
 * is a URL parameter (lib/dashboard/scope.ts), so the tag is an anchor and the back button
 * undoes it.
 */
export function FundTag({
  label,
  detail,
  href,
}: {
  label: string;
  /** "$1.24M behind pace" — why this fund is being named. */
  detail?: string;
  href?: string;
}) {
  const body = (
    <>
      <span className="truncate font-medium">{label}</span>
      {detail && (
        <span className="flex-none border-l border-line-soft pl-1.5 tabular-nums">
          {detail}
        </span>
      )}
    </>
  );

  const shape =
    "inline-flex max-w-full items-center gap-1.5 rounded-[5px] border border-line-soft bg-panel px-1.5 py-[2px] text-[11px] text-[#060606]";

  return href ? (
    <Link href={href} className={cn(shape, "transition-colors hover:border-brand hover:text-brand")}>
      {body}
    </Link>
  ) : (
    <span className={shape}>{body}</span>
  );
}

/**
 * A dashboard row that collapses on narrow screens.
 *
 * `2-2-1` is the shape the client's Revenue and Expenditure layout diagrams describe: two
 * chart columns and a narrower rail carrying the policy echo, the movers and the alerts.
 * `minmax(0,…)` rather than a bare fraction on every track, because a wide table inside a
 * grid child will otherwise blow the column past its share and push the rail off the page.
 *
 * The two chart columns were once equal at 1.1fr each. They are not any more: the client's
 * note on "Revenues — budget vs actual" was that its figures came out truncated, and the
 * cause was width — a 640-unit viewBox squeezed into a ~430px column draws its type at two
 * thirds size, and the summary strip beneath it had four money columns to fit in the same
 * space. The rail is the cheapest donor on the row, because everything in it (a policy
 * list, a mover list) is a label-and-figure pair that reflows rather than scales.
 */
export function Row({
  children,
  cols = "2",
  className,
}: {
  children: ReactNode;
  cols?: "2" | "3" | "1-2" | "2-1" | "2-2-1" | "1-2-rail";
  className?: string;
}) {
  const grid = {
    "2": "lg:grid-cols-2",
    "3": "lg:grid-cols-3",
    "1-2": "lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]",
    "2-1": "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]",
    "2-2-1": "xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1.1fr)_minmax(0,0.8fr)]",
    "1-2-rail": "xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,0.9fr)]",
  }[cols];
  // 10px gaps — the redesign's band rhythm (the Executive page's grids use the same).
  return <div className={cn("grid gap-2.5", grid, className)}>{children}</div>;
}

/**
 * The narrative bar under a chart — "KEY INSIGHT: cash increased by $2.1M (5.32%) in May…".
 *
 * The client called Key Insights the section that "tells the story instead of simply
 * displaying numbers", and asked for the same treatment on Fund Balance Trend and Cash.
 * The sentence itself is always built in lib/ — see lib/alerts/insights.ts — so a
 * conclusion on a superintendent's screen is a testable function of the district's own
 * figures rather than a string assembled inside JSX.
 */
export function KeyInsightBar({
  children,
  tone = "info",
  icon = "lightbulb",
}: {
  children: ReactNode;
  tone?: "info" | "monitor" | "action" | "strong";
  icon?: IconName;
}) {
  const TONE = {
    info: "border-[#d5e3fb] bg-[#f2f7ff] text-[#33507a]",
    strong: "border-strong-bg bg-strong-bg text-strong",
    monitor: "border-monitor-bg bg-monitor-bg text-monitor",
    action: "border-action-bg bg-action-bg text-action",
  } as const;
  const CHIP = {
    info: "bg-brand text-white",
    strong: "bg-strong-mark text-white",
    monitor: "bg-monitor-mark text-white",
    action: "bg-action-mark text-white",
  } as const;

  return (
    <div
      data-insight-bar
      className={cn("flex items-start gap-2.5 rounded-[10px] border px-3.5 py-3", TONE[tone])}
    >
      <span
        aria-hidden
        data-insight-bar-chip
        className={cn(
          "flex h-[24px] w-[24px] flex-none items-center justify-center rounded-full",
          CHIP[tone],
        )}
      >
        <Icon name={icon} size={13} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.06em]">
          Key insight
        </span>
        <span data-insight-bar-text className="mt-0.5 block text-[12px] leading-relaxed">
          {children}
        </span>
      </span>
    </div>
  );
}
