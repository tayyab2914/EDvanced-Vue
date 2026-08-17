import type { StatusRung } from "@/lib/dashboard/status";
import type { DeltaTone } from "@/lib/dashboard/format";

/**
 * The dashboards that have a landscape print summary, in navigation order.
 *
 * One list, read by two things that must not drift: the print verifier, which asserts each
 * of these paginates exactly as its route authored it, and — should it ever be wanted — any
 * index of the printable views. A summary added to a route but not to this list is a summary
 * nobody checks the pagination of, which is exactly how the Executive one reached five pages.
 */
export interface SummaryView {
  /** Filename-safe id, used for the verifier's PDF output. */
  key: string;
  label: string;
  /** The route with the summary view already selected. */
  href: string;
}

/**
 * The sheet's accent, carried on a KPI tile's left edge.
 *
 * Deliberately coarser than the status ladder: the printed tile has no room for a badge, so
 * the edge is the only judgement channel it has, and four steps is as many as a 3px rule can
 * distinguish on paper. The word itself is still printed underneath — colour is never the
 * only channel, on screen or in ink.
 */
export type SheetTone = "neutral" | "positive" | "negative" | "monitor";

export function rungTone(rung: StatusRung): SheetTone {
  switch (rung) {
    case "Strong":
      return "positive";
    case "Acceptable":
      return "neutral";
    case "Monitor":
      return "monitor";
    case "Action Required":
      return "negative";
    default:
      return "neutral";
  }
}

export function sheetTone(tone: DeltaTone): SheetTone {
  return tone === "neutral" ? "neutral" : tone;
}

/**
 * The scope line under every sheet's title — "June 2027 · FY 2026-27 · All funds".
 *
 * A printed page outlives its filters. A PDF that does not say which period, year and fund
 * it was run for is a page of numbers somebody will read the wrong year into six months
 * from now, so this is stamped on the masthead AND repeated in the colophon.
 */
export function sheetScope(scope: {
  label: string;
  fiscalYear: string;
  fund?: { name: string } | null;
}): string {
  return `${scope.label} · FY ${scope.fiscalYear} · ${scope.fund ? scope.fund.name : "All funds"}`;
}

/**
 * The end of the scoped period, not the moment the sheet was printed.
 *
 * The screen reads from here too: the header's "Showing:" row ends with this same string
 * (components/dashboard/dashboard-filters.tsx), so the date a board packet carries and the
 * date on the page it was printed from cannot drift apart in wording or in timezone.
 */
export function sheetAsOf(date: Date | null): string | undefined {
  if (!date) return undefined;
  return `Data as of ${date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  })}`;
}

/**
 * How many rows of a ranked table a sheet prints.
 *
 * The sheet is a fixed page and a district's source list is not: eight rows is what fits
 * beside everything else at a legible size, and the rows are already ranked so the eight
 * that print are the eight that matter. The card SAYS it is a top-eight — a table that
 * silently truncated would be a page of numbers that does not add up to its own total.
 */
export const SHEET_TABLE_ROWS = 8;

/**
 * What a table gets when it has a band of a page to itself.
 *
 * The eight above is what fits BESIDE other cards. A ledger that is the point of its page —
 * the cash by-fund table, the fund balance directory — has the height for a district's whole
 * fund list, and a directory that stops at eight funds is not a directory.
 */
export const SHEET_LEDGER_ROWS = 14;

export function sheetTableNote(rows: number): string {
  return `Top ${rows} · total is all rows`;
}

export const SHEET_TABLE_NOTE = sheetTableNote(SHEET_TABLE_ROWS);

/**
 * The ceiling the print verifier enforces on any one summary.
 *
 * Not a layout constraint — nothing breaks at three — but a summary is a summary. Two
 * landscape pages is what a board packet was asked to be: page one the headline figures and
 * the charts they come from, page two the detail, the movers and the alerts. A route that
 * quietly grew to four would have stopped being a summary without anybody deciding to.
 *
 * Lives here rather than beside `PrintSheet` because the verifier is a plain node script and
 * must not have to load a React component — and every constant those two share has to sit in
 * one file or it is two constants.
 */
export const SHEET_MAX_PAGES = 2;

export const SUMMARY_VIEWS: SummaryView[] = [
  { key: "executive", label: "Executive Dashboard", href: "/dashboard?view=summary" },
  { key: "revenues", label: "Revenues", href: "/revenues?view=summary" },
  { key: "expenditures", label: "Expenditures", href: "/expenditures?view=summary" },
  { key: "fund-balance", label: "Fund Balance", href: "/fund-balance?view=summary" },
  { key: "cash", label: "Cash Position", href: "/cash?view=summary" },
];
