// Layer 2 — types & format: is each value the kind of thing the column claims to be?
//
// This is the registry's Zod schema, run per row. It answers shape and presence only.
// Whether a code EXISTS is a database question and belongs to the referential layer.
//
// A row that fails here is dropped from every later layer: you cannot recompute
// Available Budget when Budget is the word "pending", and reporting six consequential
// findings for one typo buries the typo.

import * as z from "zod";
import type { DatasetDef } from "@/lib/datasets/registry";
import type { RawRow } from "@/lib/import/parse/rows";
import { RULE, error, type Finding } from "@/lib/validation/import/findings";

/** A row that passed its schema. Values are normalised (amounts bare, dates ISO). */
export interface TypedRow {
  rowNumber: number;
  raw: RawRow;
  value: Record<string, string | undefined>;
}

export function typeFindings(
  def: DatasetDef,
  rows: { rowNumber: number; raw: RawRow }[],
): { findings: Finding[]; typed: TypedRow[] } {
  const findings: Finding[] = [];
  const typed: TypedRow[] = [];
  const labelOf = new Map(def.fields.map((f) => [f.name, f.label]));

  for (const { rowNumber, raw } of rows) {
    const parsed = def.schema.safeParse(raw);

    if (!parsed.success) {
      // Every issue, not just the first. M1's importer surfaces one message per row
      // because a form shows one message per field; a validation report is a worklist,
      // and a district fixing a file wants every problem in that row at once rather than
      // discovering them one re-upload at a time.
      for (const issue of (parsed.error as z.ZodError).issues) {
        const field = String(issue.path[0] ?? "");
        findings.push(
          error({
            layer: "types",
            rule: RULE.INVALID_VALUE,
            rowNumber,
            column: labelOf.get(field) ?? field,
            value: raw[field] ?? "",
            message: issue.message,
          }),
        );
      }
      continue;
    }

    typed.push({
      rowNumber,
      raw,
      value: parsed.data as Record<string, string | undefined>,
    });
  }

  return { findings, typed };
}
