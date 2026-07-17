// Pure, client-safe fiscal-calendar logic (no server-only imports, no DB, no React) so
// it can be unit-tested on its own — `npm run verify:periods`.
//
// Everything in the data pipeline keys off this module: every ImportBatch, every
// DatasetVersion, every validation message and every dashboard filter names a fiscal
// year and a period. It is small on purpose and depended on by all of M2.

import { PeriodType } from "@/lib/enums";

/** Month numbers are 1-12 (January = 1), matching District.fiscalYearStartMonth. */
export type Month = number;

/** A period ordinal within a fiscal year: 1-12 for MONTHLY, 1-2 for SURVEY. */
export type Period = number;

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export const MONTHS_IN_YEAR = 12;

/** Survey 1 and Survey 2 (Spec §5.7). Reserved for the Phase 2 Enrollment import. */
export const SURVEY_COUNT = 2;

/** How many periods a fiscal year has, by period type. ANNUAL has none — see `period`. */
export function periodCount(type: PeriodType): number {
  switch (type) {
    case PeriodType.MONTHLY:
      return MONTHS_IN_YEAR;
    case PeriodType.SURVEY:
      return SURVEY_COUNT;
    case PeriodType.ANNUAL:
      return 0;
  }
}

// ===================== Fiscal year =====================

export interface FiscalYear {
  /** The calendar year the fiscal year starts in. FY2026-27 starts in 2026. */
  startYear: number;
  /** Always startYear + 1. Held explicitly because it is what the label shows. */
  endYear: number;
}

const FISCAL_YEAR_RE = /^(\d{4})-(\d{2})$/;

/** Formats a fiscal year the way the client's workbook writes it: "2026-27". */
export function formatFiscalYear(startYear: number): string {
  const end = (startYear + 1) % 100;
  return `${startYear}-${String(end).padStart(2, "0")}`;
}

/**
 * Parses "2026-27" into its two calendar years, or returns null.
 *
 * Deliberately strict — this is a validation-layer primitive, so it rejects anything
 * that is not exactly YYYY-YY with consecutive years. "2026-28" is not a fiscal year
 * anyone means, and letting it through would silently mis-file a district's data
 * against a year that does not exist.
 */
export function parseFiscalYear(value: string): FiscalYear | null {
  const m = FISCAL_YEAR_RE.exec(value.trim());
  if (!m) return null;

  const startYear = Number(m[1]);
  const endShort = Number(m[2]);

  // The two digits must be the year after startYear, including across a century
  // boundary (2099-00 is valid).
  const expected = (startYear + 1) % 100;
  if (endShort !== expected) return null;

  return { startYear, endYear: startYear + 1 };
}

export function isFiscalYear(value: string): boolean {
  return parseFiscalYear(value) !== null;
}

/**
 * The fiscal year a date falls in, for a district starting its year in `startMonth`.
 *
 * A district on the standard July start: 2026-08-15 is FY2026-27, and 2026-06-15 is
 * still FY2025-26. `startMonth` comes from District.fiscalYearStartMonth and is never
 * assumed — a district on an August or October calendar gets the right answer for free.
 */
export function fiscalYearFor(date: Date, startMonth: Month): string {
  assertMonth(startMonth);
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const startYear = month >= startMonth ? year : year - 1;
  return formatFiscalYear(startYear);
}

// ===================== Periods =====================

/**
 * The calendar month a monthly period lands on.
 *
 * Period 1 is the district's own first month, not July. For a July district,
 * period 2 -> August; for an October district, period 2 -> November.
 */
export function periodToMonth(period: Period, startMonth: Month): Month {
  assertMonth(startMonth);
  assertPeriod(period, PeriodType.MONTHLY);
  return ((startMonth - 1 + (period - 1)) % MONTHS_IN_YEAR) + 1;
}

/** The inverse of `periodToMonth`. */
export function monthToPeriod(month: Month, startMonth: Month): Period {
  assertMonth(startMonth);
  assertMonth(month);
  return ((month - startMonth + MONTHS_IN_YEAR) % MONTHS_IN_YEAR) + 1;
}

/**
 * The calendar year a monthly period falls in, given the fiscal year it belongs to.
 * A July district's period 7 (January) sits in the fiscal year's SECOND calendar year.
 */
export function periodCalendarYear(
  period: Period,
  startMonth: Month,
  fy: FiscalYear,
): number {
  const month = periodToMonth(period, startMonth);
  return month >= startMonth ? fy.startYear : fy.endYear;
}

// ===================== Labels =====================

/**
 * How a period is named on screen and in every validation message.
 *
 *   MONTHLY -> "August (Period 2)"   — mirrors the client's upload screen
 *   SURVEY  -> "Survey 1"
 *   ANNUAL  -> "Full year"           — annual imports carry no period at all
 */
export function periodLabel(
  type: PeriodType,
  period: Period | null,
  startMonth: Month = 7,
): string {
  if (type === PeriodType.ANNUAL) return "Full year";
  if (period == null) return "—";

  if (type === PeriodType.SURVEY) {
    assertPeriod(period, PeriodType.SURVEY);
    return `Survey ${period}`;
  }

  const month = periodToMonth(period, startMonth);
  return `${MONTH_NAMES[month - 1]} (Period ${period})`;
}

/** Every period of a fiscal year, in order, ready for a `<select>`. */
export function periodOptions(
  type: PeriodType,
  startMonth: Month = 7,
): { value: Period; label: string }[] {
  const n = periodCount(type);
  return Array.from({ length: n }, (_, i) => ({
    value: i + 1,
    label: periodLabel(type, i + 1, startMonth),
  }));
}

/**
 * Whether a (type, period) pair is coherent before it reaches the database.
 *
 * ANNUAL must carry NO period. That is not a formality: `period` is NULL for annual
 * rows, and the DatasetVersion uniqueness indexes COALESCE it to -1 to work around
 * Postgres treating NULLs as distinct. An annual row that smuggled in a period would
 * be keyed differently from its siblings and quietly escape both invariants.
 */
export function isValidPeriod(type: PeriodType, period: Period | null): boolean {
  if (type === PeriodType.ANNUAL) return period == null;
  if (period == null) return false;
  return Number.isInteger(period) && period >= 1 && period <= periodCount(type);
}

// ===================== Guards =====================

function assertMonth(month: Month): void {
  if (!Number.isInteger(month) || month < 1 || month > MONTHS_IN_YEAR) {
    throw new RangeError(`Month must be 1-12, got ${month}.`);
  }
}

function assertPeriod(period: Period, type: PeriodType): void {
  if (!isValidPeriod(type, period)) {
    throw new RangeError(
      `Period ${period} is out of range for ${type} (expected 1-${periodCount(type)}).`,
    );
  }
}
