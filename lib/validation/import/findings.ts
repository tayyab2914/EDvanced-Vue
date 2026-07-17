// What a validation finding IS, and the stable ids every rule is known by.
//
// Pure — no database, no Prisma. The engine persists these; the layers only produce them.

import type { Severity } from "@/lib/enums";

/** The seven layers of Spec §5.6, in the order the engine runs them. */
export type Layer =
  | "structure"
  | "types"
  | "vocabulary"
  | "referential"
  | "calculation"
  | "business-rules"
  | "duplicates";

/**
 * One thing wrong with one row (or with the file itself).
 *
 * Spec §5.6 sets the bar: every finding names the sheet, the row, the column, the
 * offending value, and a plain-English explanation. `column` is therefore the LABEL the
 * district wrote in their file — never our internal field name, which they have never
 * seen and cannot act on.
 */
export interface Finding {
  severity: Severity;
  layer: Layer;
  rule: string;
  /** Absent for file-level findings — a missing column has no row. */
  rowNumber?: number;
  column?: string;
  value?: string;
  message: string;
}

/**
 * Stable rule ids.
 *
 * Separate from the message on purpose: the message is prose that will be reworded, and
 * counting, filtering and testing must not depend on prose. `verify:validation` asserts
 * by rule id, so a copy edit never breaks a test and never silently stops one from
 * checking what it claims to.
 */
export const RULE = {
  // structure — about the file
  MISSING_REQUIRED_COLUMN: "STRUCTURE_MISSING_REQUIRED_COLUMN",
  MISSING_RECOMMENDED_COLUMN: "STRUCTURE_MISSING_RECOMMENDED_COLUMN",
  UNKNOWN_COLUMN: "STRUCTURE_UNKNOWN_COLUMN",

  // types & format
  INVALID_VALUE: "TYPE_INVALID_VALUE",

  // controlled vocabulary — the platform-managed global lists
  UNKNOWN_STATUS: "VOCAB_UNKNOWN_STATUS",

  // referential integrity — this district's own master data
  UNKNOWN_CODE: "REF_UNKNOWN_CODE",
  AMBIGUOUS_CODE: "REF_AMBIGUOUS_CODE",
  RECOVERED_LEADING_ZERO: "REF_RECOVERED_LEADING_ZERO",
  EMPTY_MASTER_LIST: "REF_EMPTY_MASTER_LIST",

  // calculation checks
  CALC_MISMATCH: "CALC_MISMATCH",

  // business rules — the configurable anomaly checks
  REVENUE_OVER_COLLECTED: "RULE_REVENUE_OVER_COLLECTED",
  SPEND_OVER_BUDGET: "RULE_SPEND_OVER_BUDGET",
  UTILISATION_OVER_100: "RULE_UTILISATION_OVER_100",
  NEGATIVE_AVAILABLE_BUDGET: "RULE_NEGATIVE_AVAILABLE_BUDGET",
  ENCUMBRANCES_OVER_AVAILABLE: "RULE_ENCUMBRANCES_OVER_AVAILABLE",

  // duplicate rows
  DUPLICATE_ROW: "DUPLICATE_ROW",
} as const;

export const error = (f: Omit<Finding, "severity">): Finding => ({ ...f, severity: "ERROR" });
export const warning = (f: Omit<Finding, "severity">): Finding => ({ ...f, severity: "WARNING" });

export function countBySeverity(findings: Finding[]): { errors: number; warnings: number } {
  let errors = 0;
  let warnings = 0;
  for (const f of findings) f.severity === "ERROR" ? errors++ : warnings++;
  return { errors, warnings };
}

/** Money, for a message. Plain and unambiguous — not localised, not abbreviated. */
export function money(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
