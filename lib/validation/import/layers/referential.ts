// Layers 3 & 4 — controlled vocabulary and referential integrity.
//
// The spec treats these as two checks, and they genuinely are two:
//
//   vocabulary  — does the value match a PLATFORM-managed global list? For the six
//                 importers that is Status alone (Preliminary / Unaudited / Final).
//                 The other global lists (Fund Type, Object Type...) are referenced by
//                 master data, not by an uploaded file.
//   referential — does the id exist in THIS DISTRICT's own master data? Fund, revenue
//                 source, function, object, cost centre, grant, project.
//
// One module because they share a mechanism — lib/import/resolve.ts — and splitting the
// file would mean two callers of it drifting on how a miss is worded.
//
// This is also where the leading-zero recovery surfaces to the user.

import type { DatasetDef } from "@/lib/datasets/registry";
import type { ResolveMaps } from "@/lib/import/resolve";
import { indexSize, resolveCode } from "@/lib/import/resolve";
import { RULE, error, warning, type Finding } from "@/lib/validation/import/findings";
import type { TypedRow } from "@/lib/validation/import/layers/types";

/** A row whose codes have become ids — ready to commit, once everything else passes. */
export interface ResolvedRow {
  rowNumber: number;
  value: Record<string, string | undefined>;
  /** Field name -> resolved id. */
  ids: Record<string, string>;
}

const HUMAN: Record<string, string> = {
  fund: "fund",
  revenueSource: "revenue source",
  function: "function",
  object: "object",
  costCenter: "cost center",
  project: "project",
  status: "status",
};

export function referentialFindings(
  def: DatasetDef,
  rows: TypedRow[],
  maps: ResolveMaps,
): { findings: Finding[]; resolved: ResolvedRow[] } {
  const findings: Finding[] = [];
  const resolved: ResolvedRow[] = [];

  const codeFields = def.fields.filter((f) => f.type === "code");

  // "Unknown fund 0101" is a useless thing to say to a district that has not imported
  // any funds yet. Said once, for the file, it is the most useful sentence in the report.
  for (const field of codeFields) {
    // Project is skipped: it is optional on the annual budgets, so a district with no
    // projects yet must not have a project-less budget file rejected wholesale. A missing
    // project on a row that DOES name one still surfaces per-row below.
    if (!field.resolvesTo || field.resolvesTo === "project") continue;
    if (indexSize(maps, field.resolvesTo) === 0) {
      findings.push(
        error({
          layer: "referential",
          rule: RULE.EMPTY_MASTER_LIST,
          column: field.label,
          message: `This district has no ${HUMAN[field.resolvesTo]} master data yet, so no "${field.label}" in this file can match. Import your ${HUMAN[field.resolvesTo]}s first, under Master data.`,
        }),
      );
    }
  }
  // Every row would repeat the same failure; the file-level finding already said it.
  if (findings.length > 0) return { findings, resolved: [] };

  for (const row of rows) {
    const ids: Record<string, string> = {};
    let rowOk = true;

    for (const field of codeFields) {
      const code = row.value[field.name];

      if (!code) {
        // Absent and allowed — the schema already refused it if it was required.
        continue;
      }

      const hit = resolveCode(maps, field.resolvesTo!, code);
      if (!hit.ok) {
        rowOk = false;
        findings.push(
          error({
            layer: field.resolvesTo === "status" ? "vocabulary" : "referential",
            rule:
              hit.reason === "ambiguous"
                ? RULE.AMBIGUOUS_CODE
                : field.resolvesTo === "status"
                  ? RULE.UNKNOWN_STATUS
                  : RULE.UNKNOWN_CODE,
            rowNumber: row.rowNumber,
            column: field.label,
            value: code,
            message:
              hit.reason === "ambiguous"
                ? `"${code}" matches more than one ${HUMAN[field.resolvesTo!]} once leading zeros are ignored. Use the exact code.`
                : `"${code}" isn't a ${HUMAN[field.resolvesTo!]} in ${field.resolvesTo === "status" ? "the approved list" : "your master data"}.`,
          }),
        );
        continue;
      }

      ids[field.name] = hit.id;
      if (hit.recovered) findings.push(recoveredZero(row.rowNumber, field.label, code, hit.recovered));
    }

    if (rowOk) resolved.push({ rowNumber: row.rowNumber, value: row.value, ids });
  }

  return { findings, resolved };
}

/**
 * Excel ate a leading zero and master data put it back.
 *
 * A Warning rather than a silent fix: we are confident enough to accept the row — it was
 * the only candidate — but the district should know their export is writing account
 * codes as numbers, because the day they add a fund that collides, we will stop being
 * able to tell.
 */
function recoveredZero(
  rowNumber: number,
  column: string,
  wrote: string,
  canonical: string,
): Finding {
  return warning({
    layer: "referential",
    rule: RULE.RECOVERED_LEADING_ZERO,
    rowNumber,
    column,
    value: wrote,
    message: `Read "${wrote}" as "${canonical}" — your file lost a leading zero, most likely by storing the code as a number. We matched it because nothing else fits, but it is worth exporting this column as text.`,
  });
}
