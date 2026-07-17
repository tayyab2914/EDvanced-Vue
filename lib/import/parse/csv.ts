import { parseCsvRows } from "@/lib/csv";
import type { CellGrid } from "@/lib/import/parse/rows";

/**
 * CSV -> the same cell grid the xlsx reader produces.
 *
 * Reuses M1's hand-rolled RFC-4180 parser (lib/csv.ts) rather than adding a second CSV
 * implementation. That parser is already the counterpart of `csvEscape`, which is what
 * makes the export -> edit -> import round-trip hold; a different reader here would let
 * the two drift.
 *
 * Not streamed. The whole file is already in memory — it arrived as a request body — so
 * there is nothing to stream FROM, and pretending otherwise would add machinery without
 * lowering the peak. The xlsx path genuinely benefits, because its reader can decompress
 * incrementally; this one cannot.
 */
export function readCsv(text: string): CellGrid {
  // parseCsvRows already splits off the header, trims it, and drops fully-empty rows.
  const { headers, rows } = parseCsvRows(text);

  return {
    headers,
    rows: rows.map((cells, i) => ({
      // +2: rows are 1-based and the header occupies row 1. This is the number the
      // district will see in the validation report, so it has to be the number they see
      // next to the row in Excel.
      rowNumber: i + 2,
      cells: cells as unknown[],
    })),
  };
}
