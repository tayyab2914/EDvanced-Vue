// Turning whatever a spreadsheet cell actually contains into the plain string the
// registry's Zod schema expects.
//
// Pure and dependency-free so it can be unit-tested without a file — `verify:import`.
// The ExcelJS cell shapes are described structurally here rather than imported, so this
// module stays free of the parser it serves.

import type { FieldType } from "@/lib/datasets/fields";

/**
 * Excel's day zero, chosen to absorb a 40-year-old bug.
 *
 * Excel says serial 1 is 1 Jan 1900, which would put day zero at 31 Dec 1899. But Excel
 * also believes 1900 was a leap year — it counts a 29 Feb 1900 that never existed — so
 * from serial 61 (1 Mar 1900) onward every serial is shifted one day later than the
 * honest count. Anchoring at 30 Dec 1899 cancels that shift.
 *
 * The trade: serials 1-59 (Jan and Feb 1900) come out one day early. Every serial a
 * school district will ever send is ~46,000, so the anchor that is right for 1900 would
 * be wrong for all real data, and this one is right for all of it.
 */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;

/** 1 = 1900-01-01; 2958465 = 9999-12-31. Anything outside is not a date. */
const MIN_SERIAL = 1;
const MAX_SERIAL = 2_958_465;

export function isExcelSerial(n: number): boolean {
  return Number.isFinite(n) && n >= MIN_SERIAL && n <= MAX_SERIAL;
}

/**
 * Converts an Excel date serial to an ISO date string (date only — no time, because a
 * "Snapshot Date" has no meaningful time and a timezone would only invent one).
 *
 * The spec's example serial is 46234, which is 31 Jul 2026 — a reporting-period end, and
 * exactly the kind of value a Snapshot Date column carries.
 */
export function excelSerialToISO(serial: number): string {
  const whole = Math.floor(serial);
  return new Date(EXCEL_EPOCH_UTC + whole * MS_PER_DAY).toISOString().slice(0, 10);
}

/** The shapes ExcelJS hands back for a non-scalar cell. */
type RichText = { richText: { text: string }[] };
type FormulaCell = { formula?: string; result?: unknown };
type HyperlinkCell = { text?: string; hyperlink?: string };
type ErrorCell = { error: string };

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * Flattens one cell to text, without interpreting it.
 *
 * A number becomes its digits, NOT a rounded or localised rendering: `String(101)` is
 * "101". That is exactly the leading-zero damage we cannot undo here — if the district's
 * ERP wrote fund 0101 into a numeric cell, the zero was gone before this function ever
 * saw it. It is recovered later, against master data, in lib/import/resolve.ts.
 */
export function cellToText(value: unknown): string {
  if (value == null) return "";

  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  if (isObj(value)) {
    // A formula cell: the cached result is what the district sees on screen, so it is
    // what we read. The formula text itself is none of our business.
    if ("result" in value) return cellToText((value as FormulaCell).result);
    // An error cell (#REF!, #DIV/0!) — surface the error text so the finding can quote
    // it back rather than saying "expected a number, got [object Object]".
    if ("error" in value) return String((value as ErrorCell).error);
    if ("richText" in value) {
      return (value as RichText).richText.map((r) => r.text).join("").trim();
    }
    if ("text" in value) return String((value as HyperlinkCell).text ?? "").trim();
    if ("formula" in value) return ""; // a formula with no cached result
  }

  return String(value).trim();
}

/**
 * Applies the field's type to a raw cell.
 *
 * Only `date` needs interpreting, and it is the one that matters: Excel stores 1 July
 * 2026 as 46234, and a bare 46234 reaching the schema would be REJECTED (Date.parse
 * reads it as the year 46234 — see isDate). The spec asks for serials to be "parsed
 * correctly", so this is where that happens, for CSV as well as xlsx: in a column the
 * registry declares to be a date, a bare number can only be a serial.
 *
 * Amounts are deliberately NOT touched — normalizeAmount owns that, in one place, and
 * doing it twice is how the two drift.
 */
export function coerceCell(value: unknown, type: FieldType): string {
  if (type !== "date") return cellToText(value);

  if (value instanceof Date) return value.toISOString().slice(0, 10);

  if (typeof value === "number" && isExcelSerial(value)) {
    return excelSerialToISO(value);
  }

  const text = cellToText(value);
  // The CSV path, and any xlsx cell that lost its date formatting: a column declared to
  // be a date, holding nothing but digits, is a serial.
  if (/^\d+(\.\d+)?$/.test(text)) {
    const n = Number(text);
    if (isExcelSerial(n)) return excelSerialToISO(n);
  }
  return text;
}
