/**
 * Money and percentage formatting for the dashboards.
 *
 * Separate from lib/format.ts, which is dates. This module is the one place that decides
 * how a district's money looks on screen, because a figure formatted two ways on one page
 * reads as two different figures.
 *
 * Pure and client-safe. Accepts a Prisma.Decimal structurally rather than importing it,
 * so a client component can format a figure the server computed without pulling Prisma
 * into the browser bundle — the same trick lib/datasets/browse.ts uses.
 */

/** Anything with Decimal's shape, or a plain number. */
export type Numeric =
  | number
  | { toNumber?: () => number; toFixed: (dp: number) => string };

export function toNumber(v: Numeric | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v.toNumber === "function") {
    const n = v.toNumber();
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(v.toFixed(6));
  return Number.isFinite(n) ? n : null;
}

/** What a figure shows when the platform could not work it out. Never "0", never "$0". */
export const NOT_AVAILABLE = "—";

// ===================== money =====================

/**
 * Groups an absolute value with COMMAS and a full stop, by hand.
 *
 * `toLocaleString("en-US")` is the obvious way to do this and it is what this module used
 * to do. It is also what put a middle dot between the thousands on a district's screen: a
 * Node build without full ICU collapses every locale to a root locale whose group separator
 * is U+00B7, so "$426,845,120" rendered as "$426·845·120" on the server and as commas in
 * the browser. Formatting by hand is a dozen characters of regex and cannot drift with the
 * runtime's ICU data.
 *
 * The default of two decimal places is the client's, and it applies everywhere a figure is
 * shown in full. Axis ticks pass `dp: 0` explicitly, because cents on a gridline are noise.
 */
function group(abs: number, dp: number): string {
  const [whole, fraction] = abs.toFixed(dp).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction ? `${grouped}.${fraction}` : grouped;
}

/** The plain grouped number, no currency symbol: 426,845,120.00. */
export function number(v: Numeric | null | undefined, dp = 2): string {
  const n = toNumber(v);
  if (n === null) return NOT_AVAILABLE;
  return `${n < 0 ? "−" : ""}${group(Math.abs(n), dp)}`;
}

/**
 * The headline form: $426.85M, $41.60M, $890.00K, $1,240.00.
 *
 * A district's general fund runs to hundreds of millions, and "$426,845,120.00" on a KPI
 * tile is a number nobody reads — they count digits instead. Compact is the right default
 * for a tile or an axis; `money()` below is for tables, where the exact figure is the
 * point.
 */
export function compactMoney(v: Numeric | null | undefined, dp?: number): string {
  const n = toNumber(v);
  if (n === null) return NOT_AVAILABLE;

  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const d = dp ?? 2;

  if (abs >= 1_000_000_000) return `${sign}$${group(abs / 1_000_000_000, d)}B`;
  if (abs >= 1_000_000) return `${sign}$${group(abs / 1_000_000, d)}M`;
  if (abs >= 1_000) return `${sign}$${group(abs / 1_000, d)}K`;
  return `${sign}$${group(abs, d)}`;
}

/** The exact figure, comma-grouped: $426,845,120.00. Tables and drill-downs. */
export function money(v: Numeric | null | undefined, dp = 2): string {
  const n = toNumber(v);
  if (n === null) return NOT_AVAILABLE;
  return `${n < 0 ? "-" : ""}$${group(Math.abs(n), dp)}`;
}

/**
 * Accounting form: a negative is parenthesised, not signed — ($84.8M).
 *
 * This is not decoration. Finance staff read a parenthesis as "negative" faster than they
 * read a minus, and a minus sign set in a small font beside a dollar sign is genuinely
 * easy to miss. Every variance and every deficit on these dashboards uses this.
 */
export function accounting(
  v: Numeric | null | undefined,
  opts: { compact?: boolean; dp?: number } = {},
): string {
  const n = toNumber(v);
  if (n === null) return NOT_AVAILABLE;
  const body = opts.compact
    ? compactMoney(Math.abs(n), opts.dp)
    : money(Math.abs(n), opts.dp ?? 0);
  return n < 0 ? `(${body})` : body;
}

// ===================== percentages =====================

export function percent(v: Numeric | null | undefined, dp = 2): string {
  const n = toNumber(v);
  if (n === null) return NOT_AVAILABLE;
  return `${n.toFixed(dp)}%`;
}

/** +3.21% / −0.80%. The sign is the message, so it is always shown. */
export function signedPercent(v: Numeric | null | undefined, dp = 2): string {
  const n = toNumber(v);
  if (n === null) return NOT_AVAILABLE;
  // A true minus sign, not a hyphen: at 11px a hyphen is nearly invisible.
  return `${n < 0 ? "−" : "+"}${Math.abs(n).toFixed(dp)}%`;
}

export function days(v: Numeric | null | undefined): string {
  const n = toNumber(v);
  if (n === null) return NOT_AVAILABLE;
  return number(Math.round(n), 0);
}

/** A signed money figure where the sign, not the parenthesis, is the message: +$1.05M. */
export function signedMoney(
  v: Numeric | null | undefined,
  opts: { compact?: boolean; dp?: number } = {},
): string {
  const n = toNumber(v);
  if (n === null) return NOT_AVAILABLE;
  const body = opts.compact ? compactMoney(Math.abs(n), opts.dp) : money(Math.abs(n), opts.dp);
  return `${n < 0 ? "−" : "+"}${body}`;
}

// ===================== deltas =====================

export type DeltaTone = "positive" | "negative" | "neutral";

/**
 * Which way is good.
 *
 * "up" — revenue, cash, fund balance. Rising is good.
 * "down" — spending against budget, days to close. Rising is bad.
 * "none" — a figure that is neither, so the delta is stated without a colour.
 *
 * Getting this wrong paints a district's cash falling in green, so it is a required
 * argument rather than a defaulted one.
 */
export type GoodDirection = "up" | "down" | "none";

export function deltaTone(v: Numeric | null | undefined, good: GoodDirection): DeltaTone {
  const n = toNumber(v);
  if (n === null || n === 0 || good === "none") return "neutral";
  const rising = n > 0;
  return (good === "up") === rising ? "positive" : "negative";
}

/** The arrow that rides beside a delta. Direction of MOVEMENT, never of judgement. */
export function deltaArrow(v: Numeric | null | undefined): string {
  const n = toNumber(v);
  if (n === null || n === 0) return "";
  return n > 0 ? "▲" : "▼";
}

// ===================== safe arithmetic on possibly-absent figures =====================

/**
 * Percentage change from `before` to `now`, or null.
 *
 * Null in, null out — and null when `before` is zero, because "grew from nothing" has no
 * percentage. Every month-over-month figure on these dashboards goes through this, so the
 * divide-by-zero case is handled once rather than five times.
 */
export function changePercent(
  now: Numeric | null | undefined,
  before: Numeric | null | undefined,
): number | null {
  const a = toNumber(now);
  const b = toNumber(before);
  if (a === null || b === null || b === 0) return null;
  return ((a - b) / Math.abs(b)) * 100;
}

/** `part` as a share of `whole`, or null when there is no whole to be a share of. */
export function sharePercent(
  part: Numeric | null | undefined,
  whole: Numeric | null | undefined,
): number | null {
  const a = toNumber(part);
  const b = toNumber(whole);
  if (a === null || b === null || b === 0) return null;
  return (a / b) * 100;
}
