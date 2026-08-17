import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/components/icons";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { codeName, type LabelMode } from "@/lib/text";
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

/** The Alert Overview tile's ground — the same tints at half strength, over the card's white. */
const TILE: Record<DisplaySeverity, string> = {
  CRITICAL: "bg-action-bg/60",
  WARNING: "bg-monitor-bg/60",
  INFORMATIONAL: "bg-acceptable-bg/60",
};

/** The glyph on that tile: the MARK step, not the ink step — it sits on a tint, not on type. */
const CHIP_INK: Record<DisplaySeverity, string> = {
  CRITICAL: "text-action-mark",
  WARNING: "text-monitor-mark",
  INFORMATIONAL: "text-acceptable-mark",
};

export interface AlertRow {
  id: string;
  severity: DisplaySeverity;
  title: string;
  message: string;
  /**
   * WHERE TO GO — the funds carrying most of what this alert is about.
   *
   * The client's note: "The Alerts doesn't tell me which fund is under collected or
   * overspent so I do not know where to go." An alert is evaluated on district-wide totals
   * (see lib/alerts/attribution.ts for why it stays that way), so the sentence names a
   * condition and these name the place. Empty on a single-fund page, where the scope
   * selector has already answered it.
   */
  funds?: { id: string; code: string; name: string; detail: string; href?: string }[];
}

/**
 * One "1000 — General · $10.92M below expected" row under an alert.
 *
 * A LINK, not a chip with an ✕ — nothing here holds selection state, the fund scope is a
 * URL parameter (lib/dashboard/scope.ts), so this is an anchor and the back button undoes
 * it. `grid-cols-subgrid` over `col-span-2` is what lets one anchor occupy both of the
 * parent's tracks while still aligning with its siblings.
 */
function FundWhereRow({
  label,
  detail,
  href,
}: {
  label: string;
  detail?: string;
  href?: string;
}) {
  /*
    The ground is on the ROW, not on each cell. Two backgrounds meeting in the middle look
    like one bar only while both cells are the same height — and they are not: a detail long
    enough to wrap ("105.3% committed · $3.29M above the district's rate") makes its cell two
    lines tall while the fund name beside it stays one, and the row renders as two detached
    boxes with a step between them. One background cannot come apart.
  */
  const cell = "py-[7px] text-[11px] leading-[15px]";
  const body = (
    <>
      <span className={cn(cell, "truncate pl-2.5 pr-5 text-[#060606]")}>{label}</span>
      <span className={cn(cell, "pl-5 pr-2.5 text-right tabular-nums text-[#060606]")}>{detail}</span>
    </>
  );

  const shape = "col-span-2 grid grid-cols-subgrid items-center rounded-[6px] bg-[#f4f5f7]";

  return href ? (
    <Link href={href} className={cn(shape, "transition-opacity hover:opacity-75")}>
      {body}
    </Link>
  ) : (
    <span className={shape}>{body}</span>
  );
}

export function AlertList({
  alerts,
  empty = "Nothing needs attention in this period.",
  emptyNote,
  max,
  /** Makes each row a link — the client's "allow alerts to become clickable". */
  href,
  /**
   * The reader's Codes / Names setting, normally `scope.labelMode`. Defaulted, because a
   * caller that has no scope to hand still gets the client's recommended Codes + Names
   * rather than a type error.
   */
  mode,
}: {
  alerts: AlertRow[];
  empty?: string;
  /**
   * The reassuring second line under an empty state — "Cash position is within all policy
   * thresholds." `empty` states the fact; this says what the fact means, which is the
   * difference between a reader believing the card and wondering whether it failed to load.
   */
  emptyNote?: string;
  max?: number;
  href?: string;
  mode?: LabelMode;
}) {
  if (alerts.length === 0) {
    return (
      <div className="flex items-start gap-2.5 rounded-[10px] bg-strong-bg/70 px-3.5 py-3">
        <span aria-hidden className="mt-px flex-none text-strong">
          <Icon name="check-circle" size={16} />
        </span>
        <span className="min-w-0">
          <span className="block text-[12px] font-semibold leading-snug text-strong">
            {empty}
          </span>
          {emptyNote && (
            <span className="mt-0.5 block text-[11px] leading-snug text-[#060606]">{emptyNote}</span>
          )}
        </span>
      </div>
    );
  }

  const shown = max ? alerts.slice(0, max) : alerts;

  return (
    <ul data-alert-list className="flex flex-col">
      {shown.map((a, i) => {
        const body = (
          <>
            <span
              aria-hidden
              data-alert-chip
              className={cn(
                "mt-[1px] flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full",
                CHIP[a.severity],
              )}
            >
              <Icon name={GLYPH[a.severity]} size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <span
                data-alert-message
                className="block text-[12px] font-medium leading-snug text-[#060606]"
              >
                {a.message}
              </span>
              <span data-alert-title className="mt-0.5 block text-[11px] text-[#060606]">
                {a.title}
              </span>
            </span>
            <StatusBadge
              status={RUNG[a.severity]}
              label={BADGE_LABEL[a.severity]}
              size="sm"
              dot={false}
              className="mt-[1px] flex-none"
            />
            {href && (
              <span aria-hidden className="mt-[3px] flex-none text-[11px] text-[#060606]">
                ›
              </span>
            )}
          </>
        );

        const funds = a.funds ?? [];

        return (
          <li
            key={a.id}
            className={cn(i < shown.length - 1 && "border-b border-line-soft")}
          >
            {href ? (
              <Link
                href={href}
                className={cn(
                  "-mx-1.5 flex items-start gap-2.5 rounded-lg px-1.5 transition-colors hover:bg-panel",
                  funds.length ? "pt-3 pb-1.5" : "py-3",
                )}
              >
                {body}
              </Link>
            ) : (
              <span
                className={cn(
                  "flex items-start gap-2.5",
                  funds.length ? "pt-3 pb-1.5" : "py-3",
                )}
              >
                {body}
              </span>
            )}

            {/*
              OUTSIDE the row link, not inside it.
              Each fund tag is itself an anchor, and an anchor inside an anchor is invalid
              HTML that browsers resolve by dropping one of them — which would silently cost
              the reader either the alert link or the drill-down the client asked for. Placed
              here, both work, and the tags line up under the message rather than the glyph.
            */}
            {funds.length > 0 && (
              <div className="pb-3 pl-9">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.05em] text-[#060606]">
                  Where
                </span>
                {/*
                  Two columns that ALIGN DOWN THE CARD, sized to their content rather than
                  the card's width. Each row is one link, so it spans both tracks and takes
                  the parent's columns via `subgrid` — the alternative, a per-row flex, lets
                  a long fund name in row two push its amount out of line with row one's,
                  and a stack of money figures that does not right-align reads as noise.
                */}
                <div className="mt-1.5 grid w-fit max-w-full grid-cols-[minmax(0,auto)_auto] gap-y-[3px]">
                  {funds.map((f) => (
                    <FundWhereRow
                      key={f.id}
                      label={codeName(f.code, f.name, mode)}
                      detail={f.detail}
                      href={f.href}
                    />
                  ))}
                </div>
              </div>
            )}
          </li>
        );
      })}
      {max && alerts.length > max && (
        <li className="pt-2.5 text-[11px] text-[#060606]">and {alerts.length - max} more.</li>
      )}
    </ul>
  );
}

/**
 * The Alerts page's tally — three tiles, and NOT the alerts themselves.
 *
 * This card used to lead with a shortlist of the top three alert sentences over a strip of
 * counts. The shortlist is gone at the client's request: every one of those sentences is
 * already on this page in its own domain card a few hundred pixels below, so the card was
 * asking a reader to read the same three alerts twice and then work out which of the four
 * cards beneath held the ones it had left out.
 *
 * What is left is the one thing the domain cards below cannot say on their own: the shape
 * of the period in three numbers. "Where do I go" is answered by the cards; "how bad is
 * today" is answered here.
 */
export function AlertOverview({
  critical,
  warning,
  informational,
}: {
  critical: number;
  warning: number;
  informational: number;
}) {
  const counts: { severity: DisplaySeverity; label: string; count: number }[] = [
    { severity: "CRITICAL", label: "Critical", count: critical },
    { severity: "WARNING", label: "Warning", count: warning },
    { severity: "INFORMATIONAL", label: "Informational", count: informational },
  ];

  /**
   * Only the critical tally takes its severity's ink. Three coloured numerals would make
   * the row a decoration; one makes it a signal, and the tinted grounds and glyphs are
   * already carrying which tile is which.
   */
  const FIGURE: Record<DisplaySeverity, string> = {
    CRITICAL: "text-action",
    WARNING: "text-[#060606]",
    INFORMATIONAL: "text-[#060606]",
  };

  return (
    <ul className="grid grid-cols-3 gap-2.5">
      {counts.map((c) => (
        <li
          key={c.severity}
          className={cn(
            "flex min-w-0 flex-col items-center justify-center gap-1 rounded-[10px] px-2 py-7",
            TILE[c.severity],
          )}
        >
          <span aria-hidden className={cn("mb-0.5", CHIP_INK[c.severity])}>
            <Icon name={GLYPH[c.severity]} size={24} />
          </span>
          <span
            className={cn("text-[26px] font-semibold leading-[30px] tabular-nums", FIGURE[c.severity])}
          >
            {c.count}
          </span>
          <span className="block max-w-full truncate text-[10px] font-semibold uppercase tracking-[0.06em] text-[#060606]">
            {c.label}
          </span>
        </li>
      ))}
    </ul>
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
    <ul
      data-insight-list
      className={cn(layout === "grid" ? "grid gap-3 md:grid-cols-3" : "flex flex-col")}
    >
      {insights.map((i, idx) => {
        const body = (
          <>
            <span
              aria-hidden
              data-insight-glyph
              className={cn(
                "flex h-[28px] w-[28px] flex-none items-center justify-center rounded-lg",
                chip[i.direction],
              )}
            >
              <Icon name={glyph[i.direction]} size={15} />
            </span>
            <span className="min-w-0 flex-1">
              <span
                data-insight-text
                className="block text-[12px] font-medium leading-relaxed text-[#060606]"
              >
                {i.text}
              </span>
              {i.detail && (
                <span
                  data-insight-detail
                  className="mt-0.5 block text-[11px] leading-snug text-[#060606]"
                >
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
