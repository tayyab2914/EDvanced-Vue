// The field vocabulary every importer is described in, plus the shared Zod builders.
//
// Pure and client-safe on purpose: no Prisma, no Decimal, no server-only imports. The
// registry that uses this ends up in the browser bundle (the import form imports a value
// from it, exactly as master-data's does), so anything heavy in here would ship to the
// client. That constraint is why `Formula` below is data rather than a function.

import * as z from "zod";

/**
 * How much the importer insists on a column, using the client workbook's own vocabulary.
 *
 *   required    — must be present and non-empty; absence is an Error
 *   recommended — may be absent, but its absence is a Warning worth surfacing
 *   optional    — may be absent, silently
 *   calculated  — the platform computes it. By default it is a checksum: it appears on the
 *                 blank template, and if the file supplies it we recompute and compare
 *                 rather than trust it, and a mismatch is an Error. A calculated field
 *                 marked `computeOnly` is instead owned outright — see that flag below.
 *
 * The workbook also has "conditional" (only in certain modes), which today would have no
 * user: its only case was the Monthly Fund Balance Snapshot, deferred with Import Monthly
 * mode. It comes back with that importer rather than sitting here unused.
 */
export type Requiredness = "required" | "recommended" | "optional" | "calculated";

/**
 *   code   — a chart-of-accounts value that must resolve to a master-data row
 *   text   — free text, stored as-is
 *   amount — money. Decimal(18,2) at rest; never parsed through a JS number.
 *   date   — a real date. May arrive as an Excel serial; the parser normalises it.
 */
export type FieldType = "code" | "text" | "amount" | "date";

/**
 * Which list a `code` field resolves against. Referential integrity (Spec §5.6) is a
 * separate async pass over the database, exactly like master-data's `validateSelects` —
 * it cannot live inside a synchronous Zod schema.
 *
 * `project` resolves against the district's unified Project master (Project Number). The
 * detail imports carry a single "Project / Grant" column; whatever it names resolves to
 * one Project and writes `projectId`. A value matching nothing is an Error.
 */
export type ResolveTarget =
  | "fund"
  | "revenueSource"
  | "function"
  | "object"
  | "costCenter"
  | "project"
  | "status";

/**
 * How a calculated field is derived — and therefore also how it is checked.
 *
 * Every calculated field in the workbook is a sum or a difference; not one is a product
 * or a quotient. So the formula is DATA, not a function. Three things follow:
 *
 *   1. the registry stays serializable and client-safe (see the note at the top);
 *   2. exactly one Decimal implementation exists, in the engine, rather than one per
 *      field waiting to disagree about rounding;
 *   3. one declaration both derives the value on import and produces the expected figure
 *      to compare the file against, so the two cannot drift apart.
 *
 * Available Budget = Budget − Actual YTD − Encumbrances becomes:
 *   { plus: ["budget"], minus: ["actualYtd", "encumbrances"] }
 */
export interface Formula {
  plus: string[];
  minus?: string[];
}

export interface DatasetField {
  /** Target column on the Prisma model. */
  name: string;
  /** The header the importer matches first — M1's matcher tries label, then name. */
  label: string;
  requiredness: Requiredness;
  type: FieldType;
  /** For `code` fields. */
  resolvesTo?: ResolveTarget;
  /** For `calculated` fields. Every name in it must be another field on the same dataset. */
  formula?: Formula;
  /**
   * A `calculated` field the platform owns outright: still computed and stored, but kept
   * off the import surface entirely. It is left out of the blank template, and a value the
   * file supplies for it is never validated — we quietly ignore it and store our own
   * figure (storage already recomputes it; see engine.ts). Districts should never have to
   * enter or reconcile it, which is the whole reason a fund-balance total that they got
   * wrong should not have blocked their import.
   *
   * Contrast the default calculated field, which is a checksum: on the template, and a
   * supplied value is compared. Available Budget and Ending Cash stay that way; the
   * Opening Fund Balance totals are `computeOnly`.
   */
  computeOnly?: boolean;
  /**
   * Extra headers accepted for this column.
   *
   * Not defensive padding — the client's own workbook names the same column two
   * different ways: "Revenue Object / Source Code" on the annual budget sheet and
   * "Revenue Source / Object Code" on the monthly detail sheet. Real exports will vary
   * more than that, and rejecting a file over a slash is a bad first impression.
   */
  aliases?: string[];
}

// ===================== Value normalisation =====================

/**
 * Strips the formatting real spreadsheets carry, so "$1,234.56" and "1234.56" are the
 * same number, and accounting's "(1,234.56)" is understood as negative — a convention
 * finance exports use constantly and a naive parser reads as zero or NaN.
 *
 * Returns the bare numeric string. It is NOT parsed to a JS number here: 0.1 + 0.2 in a
 * reserve calculation is how a district stops trusting the platform. Decimal does the
 * arithmetic downstream; this only makes the text safe to hand it.
 */
export function normalizeAmount(raw: string): string {
  let v = raw.trim();
  if (!v) return v;

  // Accounting negative: (1,234.56) -> -1,234.56
  const paren = /^\((.*)\)$/.exec(v);
  if (paren) v = `-${paren[1].trim()}`;

  v = v.replace(/[$\s]/g, "").replace(/,/g, "");

  // A trailing minus is another export quirk: "1234.56-" -> "-1234.56"
  const trailing = /^(.*)-$/.exec(v);
  if (trailing) v = `-${trailing[1]}`;

  return v;
}

const AMOUNT_RE = /^-?\d+(\.\d+)?$/;

export function isAmount(raw: string): boolean {
  return AMOUNT_RE.test(normalizeAmount(raw));
}

// ===================== Zod builders =====================
// Shared across the six datasets, mirroring lib/master-data/registry.ts:79-98. Zod v4:
// the message key is `error`, not `message`.
//
// These validate SHAPE only — presence, and whether a value is the kind of thing it
// claims to be. Whether a code exists in this district's master data is a database
// question, answered by the referential layer.

export const requiredCode = (label: string) =>
  z
    .string()
    .trim()
    .min(1, { error: `${label} is required.` })
    .max(40, { error: `${label} is too long (max 40 characters).` });

export const optionalCode = z
  .string()
  .trim()
  .max(40)
  .optional()
  .transform((v) => (v ? v : undefined));

export const requiredAmount = (label: string) =>
  z
    .string()
    .trim()
    .min(1, { error: `${label} is required.` })
    .refine((v) => isAmount(v), { error: `${label} must be a number.` })
    .transform(normalizeAmount);

export const optionalAmount = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => v === undefined || isAmount(v), { error: "Enter a valid amount." })
  .transform((v) => (v === undefined ? undefined : normalizeAmount(v)));

export const optionalText = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => (v ? v : undefined));

/**
 * Whether a value is a real date.
 *
 * `Date.parse` alone is NOT enough, and the gap is the exact hazard the spec calls out.
 * Excel stores 1 July 2026 as the serial 46234, and `Date.parse("46234")` does not fail
 * — JavaScript reads a bare number as a YEAR, so an unconverted serial would validate
 * cleanly and land in the database as a date 44,000 years from now. The parser converts
 * serials before validation runs; this rejects the ones that slipped through rather than
 * trusting that it always did.
 *
 * The year bound catches the rest of the nonsense: a mistyped "202" or "20267" is not a
 * fiscal year anyone means.
 */
export function isDate(raw: string): boolean {
  const v = raw.trim();
  if (!v) return false;
  if (/^\d+$/.test(v)) return false; // an unconverted serial, or a bare year
  const t = Date.parse(v);
  if (Number.isNaN(t)) return false;
  const year = new Date(t).getUTCFullYear();
  return year >= 1900 && year <= 2200;
}

export const requiredDate = (label: string) =>
  z
    .string()
    .trim()
    .min(1, { error: `${label} is required.` })
    .refine((v) => isDate(v), {
      error: `${label} must be a valid date (for example 2026-07-01).`,
    });

// ===================== Field constructors =====================
// Small helpers so a dataset definition reads like the workbook's field table.

export const code = (
  name: string,
  label: string,
  resolvesTo: ResolveTarget,
  requiredness: Requiredness = "required",
  aliases?: string[],
): DatasetField => ({ name, label, requiredness, type: "code", resolvesTo, aliases });

export const amount = (
  name: string,
  label: string,
  requiredness: Requiredness = "required",
  aliases?: string[],
): DatasetField => ({ name, label, requiredness, type: "amount", aliases });

export const calculated = (
  name: string,
  label: string,
  formula: Formula,
  opts: { computeOnly?: boolean; aliases?: string[] } = {},
): DatasetField => ({
  name,
  label,
  requiredness: "calculated",
  type: "amount",
  formula,
  aliases: opts.aliases,
  computeOnly: opts.computeOnly,
});
