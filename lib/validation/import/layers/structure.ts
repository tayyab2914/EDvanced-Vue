// Layer 1 — structure: is this the right shape of file at all?
//
// Runs at UPLOAD, not with the other layers, because it is the only one that is about
// the FILE rather than the rows: once parsing is done the headers are gone, and staging
// keeps rows keyed by field. A missing required column is fatal — there is no point
// staging 40,000 rows to say the file is unreadable.

import type { DatasetDef } from "@/lib/datasets/registry";
import { suggestFor, type HeaderMatch } from "@/lib/import/parse/headers";
import { RULE, error, warning, type Finding } from "@/lib/validation/import/findings";

export function structureFindings(def: DatasetDef, headers: HeaderMatch): Finding[] {
  const findings: Finding[] = [];

  for (const field of headers.missingRequired) {
    findings.push(
      error({
        layer: "structure",
        rule: RULE.MISSING_REQUIRED_COLUMN,
        column: field.label,
        message: `${def.title} needs a "${field.label}" column, and this file doesn't have one.`,
      }),
    );
  }

  for (const field of headers.missingRecommended) {
    // A Warning, not an Error: the district CAN report without it. But every view that
    // groups by that dimension goes blind, and they should hear that now rather than
    // wonder later why a dashboard is empty.
    findings.push(
      warning({
        layer: "structure",
        rule: RULE.MISSING_RECOMMENDED_COLUMN,
        column: field.label,
        message: `No "${field.label}" column. The import will work, but anything reported by ${field.label.toLowerCase()} will be blank for this period.`,
      }),
    );
  }

  for (const unknown of headers.unknown) {
    // Unknown columns are ignored, never fatal — a district's export may carry extra
    // columns for its own reasons. But an unknown column next to a missing one is almost
    // always a rename, and saying both in one sentence is what turns a rejected file
    // into a fixed one.
    const suggestion = suggestFor(unknown, [
      ...headers.missingRequired,
      ...headers.missingRecommended,
    ]);
    findings.push(
      warning({
        layer: "structure",
        rule: RULE.UNKNOWN_COLUMN,
        column: unknown,
        message: suggestion
          ? `We don't recognise the column "${unknown}" and have ignored it. Did you mean "${suggestion}"?`
          : `We don't recognise the column "${unknown}" and have ignored it.`,
      }),
    );
  }

  return findings;
}
