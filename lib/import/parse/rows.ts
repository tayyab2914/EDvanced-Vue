// No "server-only" here, or in the modules under it, for the reason lib/tenant-scope.ts
// gives: it makes them unit-testable (`npm run verify:import` runs under tsx, which
// server-only throws in). Nothing here imports the database or a secret — `db` always
// arrives as a parameter — so the guard would buy little. What keeps this server-side is
// that only the upload Route Handler and the import actions import it, and the xlsx
// reader's node:stream dependency would fail a browser build loudly anyway.

import { coerceCell } from "@/lib/import/parse/values";
import { matchHeaders, type HeaderMatch } from "@/lib/import/parse/headers";
import { readCsv } from "@/lib/import/parse/csv";
import { readXlsx } from "@/lib/import/parse/excel";
import type { DatasetDef } from "@/lib/datasets/registry";

/**
 * The seam. Both formats produce a CellGrid, and everything downstream — the registry,
 * the validator, staging — reads RawRow and never learns which one it came from.
 *
 * That is the whole point of this module. Without it, every validation rule gets written
 * twice, once per format, and one of the two copies quietly rots.
 */
export interface CellGrid {
  headers: string[];
  rows: { rowNumber: number; cells: unknown[] }[];
}

/**
 * One row, keyed by FIELD NAME, values as text.
 *
 * This is what lands in ImportStagingRow.raw. Values are the district's own, untouched
 * beyond trimming and date coercion — so the validation report can quote them back
 * ("Unknown fund '0101'") rather than showing an id the user has never seen.
 */
export type RawRow = Record<string, string>;

export interface ParsedFile {
  headers: HeaderMatch;
  rows: { rowNumber: number; raw: RawRow }[];
  /** Rows the file physically contained, before any validation. */
  rowCount: number;
}

export class UnsupportedFileError extends Error {}

/** Decided by extension. Content sniffing would be false precision — the user picked. */
export function formatOf(fileName: string): "csv" | "xlsx" {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "csv") return "csv";
  if (ext === "xlsx") return "xlsx";
  // .xls is the old binary format ExcelJS cannot read; say so rather than fail obscurely.
  if (ext === "xls") {
    throw new UnsupportedFileError(
      "That is an older .xls file. Re-save it as .xlsx (Excel: File → Save As → Excel Workbook) and upload it again.",
    );
  }
  throw new UnsupportedFileError(
    `Unsupported file type ".${ext}". Upload a .xlsx or .csv file.`,
  );
}

/**
 * Reads a file into rows keyed by the dataset's fields.
 *
 * Header matching happens once, up front — a file missing a required column is fatal and
 * there is no point reading 40,000 rows to say so.
 */
export async function parseFile(
  def: DatasetDef,
  fileName: string,
  buffer: Buffer,
): Promise<ParsedFile> {
  const format = formatOf(fileName);
  const grid = format === "csv" ? readCsv(buffer.toString("utf8")) : await readXlsx(buffer);

  const headers = matchHeaders(def, grid.headers);

  // Still parse the rows when a required column is missing: the caller decides whether
  // that is fatal, and reporting "missing column X" alongside "and the file was empty"
  // is more useful than either alone.
  const byName = new Map(def.fields.map((f) => [f.name, f]));
  const rows = grid.rows.map(({ rowNumber, cells }) => {
    const raw: RawRow = {};
    for (const [fieldName, colIndex] of headers.columns) {
      const field = byName.get(fieldName)!;
      raw[fieldName] = coerceCell(cells[colIndex], field.type);
    }
    return { rowNumber, raw };
  });

  return { headers, rows, rowCount: rows.length };
}
