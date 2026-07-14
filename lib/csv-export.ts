// Building and downloading a CSV in the browser. Pure + dependency-free (shares csvEscape
// with the import parser, so what we write is what we can read back).
//
// These tables load every row up front and filter/sort/paginate on the client, so exporting
// from what's already in memory gives the user exactly the view they're looking at — no
// round-trip, and no second copy of the filter logic on the server to drift out of step.

import { csvEscape } from "@/lib/csv";

export type CsvCell = string | number | null | undefined;

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers.map((h) => csvEscape(h)).join(",")];
  for (const row of rows) {
    lines.push(row.map((c) => csvEscape(c == null ? "" : String(c))).join(","));
  }
  return lines.join("\n");
}

/** "Fund Types" → "fund-types-2026-07-14.csv" */
export function csvFilename(base: string, now: Date = new Date()): string {
  const slug = base
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${slug || "export"}-${y}-${m}-${d}.csv`;
}

/**
 * Triggers a download. Deliberately NO UTF-8 BOM: Excel likes one, but `parseCsvRows` would
 * then read the first header as "﻿Code" and fail to match it — which would quietly break
 * the export → edit → re-import loop these files exist for.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
