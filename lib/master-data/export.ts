// Shaping master-data rows for CSV export. Pure (no React, no Prisma) so the round-trip
// with the importer can be tested on its own — see scripts/verify-export.mts.
//
// The contract this file exists to hold: what we write out, `importMasterData` must be able
// to read straight back in. That means columns are keyed by FIELD LABEL (the importer matches
// on label first), select values are written as the label/name the importer resolves by, and
// numbers are written plain — never currency-formatted.

import type { ClientResourceDef, FieldDef } from "@/lib/master-data/registry";

export type MasterExportRow = Record<string, unknown> & { active?: boolean };

/** Maps a select field's stored value → the human label shown for it (fieldName → id → label). */
export type RelLabels = Record<string, Map<string, string>>;

export const STATUS_HEADER = "Status";

/**
 * Every field, not just the visible table columns — an export that dropped the form-only
 * fields would be lossy, and useless as an editing round-trip.
 */
export function masterExportHeaders(def: ClientResourceDef): string[] {
  return [...def.fields.map((f) => f.label), STATUS_HEADER];
}

/**
 * The CSV value for one cell. Deliberately NOT the on-screen `cell()` renderer:
 *  - numbers stay plain ("1000", not "$1,000") or the file would not re-import;
 *  - blanks are empty, not the "—" placeholder.
 */
export function masterExportValue(
  row: MasterExportRow,
  f: FieldDef,
  relLabels: RelLabels,
): string {
  const raw = row[f.name];
  if (raw == null || raw === "") return "";
  if (f.numeric) {
    const n = Number(raw);
    return isNaN(n) ? String(raw) : String(n);
  }
  if (f.staticOptions) {
    return f.staticOptions.find((o) => o.value === String(raw))?.label ?? String(raw);
  }
  if (relLabels[f.name]) return relLabels[f.name].get(String(raw)) ?? "";
  return String(raw);
}

export function masterExportRow(
  row: MasterExportRow,
  def: ClientResourceDef,
  relLabels: RelLabels,
): string[] {
  return [
    ...def.fields.map((f) => masterExportValue(row, f, relLabels)),
    row.active ? "Active" : "Inactive",
  ];
}
