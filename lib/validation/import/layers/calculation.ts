// Layer 5 — calculation checks: recompute every derived column and compare.
//
// The decision this layer encodes: the platform computes calculated fields, and the file
// is NEVER the source of truth for them. When a district's export supplies one anyway we
// recompute and compare rather than trusting it or silently overwriting it — a mismatch
// means their ERP disagrees with its own arithmetic, and that is worth them knowing.
//
// This is the only place a Formula is evaluated, so the value we store and the value we
// check the file against are produced by one line of code and cannot drift apart.

import { Prisma } from "@/lib/generated/prisma/client";
import type { Formula } from "@/lib/datasets/fields";
import type { DatasetDef } from "@/lib/datasets/registry";
import { RULE, error, money, type Finding } from "@/lib/validation/import/findings";
import type { ResolvedRow } from "@/lib/validation/import/layers/referential";

const D = Prisma.Decimal;

/**
 * How far a district's own figure may sit from ours before it is a real disagreement.
 *
 * A cent, and not zero: an ERP that rounds each line to the cent will land a hair off a
 * recomputed total, and failing a 40,000-row file over a rounding artefact would teach
 * districts to distrust the report. Wider than a cent and we would be waving through
 * discrepancies that matter.
 *
 * Everything here is Decimal. 0.1 + 0.2 in a reserve calculation is how a district stops
 * trusting the platform.
 */
export const TOLERANCE = new D("0.01");

/** Evaluates a formula over a row. Absent operands count as zero. */
export function evaluate(
  formula: Formula,
  value: Record<string, string | undefined>,
): Prisma.Decimal {
  let total = new D(0);
  for (const name of formula.plus) total = total.plus(new D(value[name] || 0));
  for (const name of formula.minus ?? []) total = total.minus(new D(value[name] || 0));
  return total;
}

/** The computed value of every calculated field on a row, ready to store. */
export function computedValues(
  def: DatasetDef,
  value: Record<string, string | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of def.fields) {
    if (!field.formula) continue;
    out[field.name] = evaluate(field.formula, value).toFixed(2);
  }
  return out;
}

export function calculationFindings(def: DatasetDef, rows: ResolvedRow[]): Finding[] {
  const findings: Finding[] = [];
  // Checksum fields only. A `computeOnly` field (the Opening Fund Balance totals) is the
  // platform's to compute — `computedValues` still derives and stores it, but we never hold
  // the file to a figure the district was told not to supply. Absent that carve-out, a
  // stray total column in an ERP export would resurrect the very error we removed.
  const calculated = def.fields.filter((f) => f.formula && !f.computeOnly);
  if (calculated.length === 0) return findings;

  for (const row of rows) {
    for (const field of calculated) {
      const supplied = row.value[field.name];
      // Not supplied is the normal case, and the happy one — we compute it.
      if (supplied === undefined || supplied === "") continue;

      const expected = evaluate(field.formula!, row.value);
      const actual = new D(supplied);
      if (actual.minus(expected).abs().lessThanOrEqualTo(TOLERANCE)) continue;

      findings.push(
        error({
          layer: "calculation",
          rule: RULE.CALC_MISMATCH,
          rowNumber: row.rowNumber,
          column: field.label,
          value: supplied,
          message: `${field.label} should be ${money(expected.toFixed(2))} — that's ${explain(field.formula!, def)}. This file says ${money(actual.toFixed(2))}, so one of those amounts is entered incorrectly. You can also leave the "${field.label}" column blank and the system will total it for you.`,
        }),
      );
    }
  }

  return findings;
}

/** Renders a formula the way the workbook writes it: "Budget − Actual YTD − Encumbrances". */
function explain(formula: Formula, def: DatasetDef): string {
  const label = (name: string) => def.fields.find((f) => f.name === name)?.label ?? name;
  const plus = formula.plus.map(label).join(" + ");
  const minus = (formula.minus ?? []).map(label);
  return minus.length ? `${plus} − ${minus.join(" − ")}` : plus;
}
