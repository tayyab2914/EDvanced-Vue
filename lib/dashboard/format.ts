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
 * `dp` is decided by the caller and defaults to `autoDp` below — cents when the figure has
 * cents, none when it does not. Axis ticks pass `dp: 0` explicitly, to hold a fixed tick
 * width rather than to say anything about cents.
 */
function group(abs: number, dp: number): string {
  const [whole, fraction] = abs.toFixed(dp).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction ? `${grouped}.${fraction}` : grouped;
}

/**
 * How many decimal places a figure actually needs: cents when it HAS cents, none when it
 * does not.
 *
 * The client's rule, and the reason every `dp` below defaults to this rather than to 2:
 * "$426,845,120.00" spends four characters saying the district's general fund is a whole
 * number of dollars, and a column of them trains the eye to skip the end of every figure —
 * which is where the cents live on the rows that do have them.
 *
 * It asks the value ROUNDED TO CENTS, not the raw float. These figures are sums of
 * Prisma.Decimals, so a whole-dollar total can land at 1234.9999999 on the way through
 * `toNumber`; testing the raw value would call that "has cents" and then render it as
 * "1,235.00" — the exact trailing zeros this exists to remove.
 */
function autoDp(n: number): number {
  return Math.round(Math.abs(n) * 100) % 100 === 0 ? 0 : 2;
}

/**
 * Drops a fraction that is nothing but zeros: 41.60 → 41.6, 890.00 → 890.
 *
 * For the ABBREVIATED forms only, where the decimals are a scale artefact rather than
 * cents — "$41.60M" is not sixty cents, it is six hundred thousand dollars written in a
 * place the reader has to count to. `autoDp` handles the exact forms; this handles the
 * mantissa left over after dividing by a million.
 *
 * The `includes(".")` guard is load-bearing: without it the regex eats the trailing zeros
 * of a whole number and turns "1,000" into "1,".
 */
function trimZeros(s: string): string {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

/** The plain grouped number, no currency symbol: 426,845,120. Cents only if it has them. */
export function number(v: Numeric | null | undefined, dp?: number): string {
  const n = toNumber(v);
  if (n === null) return NOT_AVAILABLE;
  return `${n < 0 ? "−" : ""}${group(Math.abs(n), dp ?? autoDp(n))}`;
}

/**
 * The headline form: $426.85M, $41.6M, $890K, $1,240.
 *
 * A district's general fund runs to hundreds of millions, and "$426,845,120" on a KPI tile
 * is a number nobody reads — they count digits instead. That argument is not confined to
 * tiles, and the client made it about the rest of the product: the Revenue and Expenditure
 * dashboards and every alert sentence now abbreviate too, because a column of nine-digit
 * figures is a column nobody reads either, and the abbreviated form is what lets a summary
 * row fit on one line.
 *
 * `money()` below stays the form for the DRILL-DOWNS — the dataset browser, the fund
 * balance override screen, anywhere the reader has clicked through specifically to see what
 * a figure actually is and rounding it away would defeat the trip.
 *
 * The mantissa is trimmed of trailing zeros, so the decimals that survive are the ones
 * carrying information: $426.85M keeps both, $41.6M keeps the one that matters, $890K
 * keeps none. Pass `dp` explicitly — axis ticks pass 0 — to fix the width instead.
 */
export function compactMoney(v: Numeric | null | undefined, dp?: number): string {
  const n = toNumber(v);
  if (n === null) return NOT_AVAILABLE;

  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  // A caller that names its decimal places wants that width held, so only the defaulted
  // case is trimmed.
  const scaled = (unit: number) =>
    dp === undefined ? trimZeros(group(abs / unit, 2)) : group(abs / unit, dp);

  if (abs >= 1_000_000_000) return `${sign}$${scaled(1_000_000_000)}B`;
  if (abs >= 1_000_000) return `${sign}$${scaled(1_000_000)}M`;
  if (abs >= 1_000) return `${sign}$${scaled(1_000)}K`;
  // Below a thousand there is nothing to abbreviate, so this is the exact figure and cents
  // are cents rather than a scale artefact.
  return `${sign}$${group(abs, dp ?? autoDp(n))}`;
}

/**
 * The exact figure, comma-grouped: $426,845,120, or $426,845,120.37 when there are cents.
 * Tables and drill-downs.
 */
export function money(v: Numeric | null | undefined, dp?: number): string {
  const n = toNumber(v);
  if (n === null) return NOT_AVAILABLE;
  return `${n < 0 ? "-" : ""}$${group(Math.abs(n), dp ?? autoDp(n))}`;
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
    : money(Math.abs(n), opts.dp);
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
