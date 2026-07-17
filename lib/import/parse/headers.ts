// Matching the headers a district actually sent to the fields the registry expects.
//
// Pure — no file, no database. The strategy is M1's, from importMasterData: match on the
// human LABEL first, then fall back to the internal field name. M2 adds aliases, because
// the client's own workbook names the same column two different ways across two sheets.

import type { DatasetField } from "@/lib/datasets/fields";
import { acceptedHeaders, type DatasetDef } from "@/lib/datasets/registry";

/**
 * Case- and whitespace-insensitive, and blind to the punctuation districts sprinkle
 * through headers. "Revenue Source / Object Code", "revenue source/object code" and
 * "Revenue_Source_Object_Code" are the same column, and refusing a file over a stray
 * underscore is a bad first impression for something whose whole job is accepting files.
 */
export function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[_\-/\\.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface HeaderMatch {
  /** field name -> the index of the column in the file that supplies it */
  columns: Map<string, number>;
  /** Required fields with no column at all. Fatal: the file cannot be read. */
  missingRequired: DatasetField[];
  /** Recommended fields with no column. Not fatal — a Warning worth raising. */
  missingRecommended: DatasetField[];
  /** Headers we do not recognise. Ignored, but reported so a typo is visible. */
  unknown: string[];
}

/**
 * Maps a file's header row onto the dataset's fields.
 *
 * Unknown columns are ignored rather than rejected — a district's export may carry extra
 * columns for its own reasons, and that is not our business. But they are reported: a
 * file with an unknown "YTD Revenue" and a missing "Actual YTD" has almost certainly
 * just renamed the column, and saying both is what turns a rejection into a fix.
 */
export function matchHeaders(def: DatasetDef, headers: string[]): HeaderMatch {
  const seen = headers.map(normalizeHeader);
  const columns = new Map<string, number>();
  const claimed = new Set<number>();

  for (const field of def.fields) {
    for (const candidate of acceptedHeaders(field)) {
      const idx = seen.indexOf(normalizeHeader(candidate));
      if (idx >= 0) {
        columns.set(field.name, idx);
        claimed.add(idx);
        break; // label wins over aliases; first alias wins over later ones
      }
    }
    // Last resort: the internal field name, exactly as M1's matcher does. Mostly this
    // helps a file that was produced from our own export.
    if (!columns.has(field.name)) {
      const idx = seen.indexOf(normalizeHeader(field.name));
      if (idx >= 0) {
        columns.set(field.name, idx);
        claimed.add(idx);
      }
    }
  }

  const absent = (f: DatasetField) => !columns.has(f.name);

  return {
    columns,
    missingRequired: def.fields.filter((f) => f.requiredness === "required" && absent(f)),
    missingRecommended: def.fields.filter(
      (f) => f.requiredness === "recommended" && absent(f),
    ),
    unknown: headers.filter((_, i) => !claimed.has(i) && headers[i]?.trim() !== ""),
  };
}

/**
 * Suggests which missing column an unknown header was probably meant to be, for the
 * structure finding's message. Cheap and deliberately conservative: a shared word is
 * enough of a hint to be useful, and being wrong here costs nothing because the user
 * still reads the sentence.
 */
export function suggestFor(unknown: string, missing: DatasetField[]): string | null {
  const words = new Set(normalizeHeader(unknown).split(" ").filter((w) => w.length > 2));
  if (words.size === 0) return null;

  let best: { field: DatasetField; score: number } | null = null;
  for (const field of missing) {
    const target = normalizeHeader(field.label).split(" ");
    const hits = target.filter((w) => words.has(w)).length;
    if (hits === 0) continue;

    // Score by the FRACTION of the target matched, not the raw count. "YTD Revenue"
    // shares one word with both "Actual YTD" and "Revenue Source / Object Code"; only
    // the fraction (1/2 vs 1/4) says which it more likely meant.
    const score = hits / target.length;
    if (!best || score > best.score) best = { field, score };
  }
  return best ? best.field.label : null;
}
