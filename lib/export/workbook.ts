import "server-only";
import ExcelJS from "exceljs";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Excel export for the dashboards (Spec §8.5).
 *
 * Uses the `exceljs` dependency the importer already brought in, so this adds no new
 * package for the reverse direction.
 *
 * ---------------------------------------------------------------------------
 * NUMBERS GO IN AS NUMBERS
 *
 * The one rule that matters. A district exports to Excel in order to do arithmetic on the
 * figures; a workbook full of "$426,845,120.00" strings is a worse artefact than the CSV
 * it replaced, because it looks usable and is not. So money is written as a JS number with
 * an Excel number FORMAT applied, and the formatting lives in the cell rather than in the
 * value.
 *
 * That conversion is the one place a Decimal legitimately becomes a float: Excel has no
 * decimal type, and a district's largest figure is nine digits with two decimal places —
 * comfortably inside a double's exact integer range once scaled. Everywhere else in this
 * product, Decimal stays Decimal.
 * ---------------------------------------------------------------------------
 */

export const MONEY_FORMAT = '#,##0.00;[Red](#,##0.00)';
export const PERCENT_FORMAT = '0.00"%"';

export type CellValue = string | number | null;

export interface SheetColumn {
  header: string;
  width?: number;
  format?: "money" | "percent" | "text";
}

export interface Sheet {
  name: string;
  /** A line of context above the table — the scope the figures were taken at. */
  caption?: string;
  columns: SheetColumn[];
  rows: CellValue[][];
  /** Rendered last, in bold, with a rule above it. */
  total?: CellValue[];
}

/** Decimal → number, at the one boundary where that is correct. */
export function num(v: Prisma.Decimal | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(v.toFixed(2));
  return Number.isFinite(n) ? n : null;
}

export async function buildWorkbook(args: {
  title: string;
  district: string;
  scope: string;
  sheets: Sheet[];
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "EDvanced Vue";
  wb.created = new Date();
  wb.title = args.title;

  for (const sheet of args.sheets) {
    // Excel refuses several characters in a sheet name and truncates at 31.
    const ws = wb.addWorksheet(sheet.name.replace(/[*?:/\\[\]]/g, " ").slice(0, 31));

    ws.addRow([args.title]);
    ws.getRow(1).font = { bold: true, size: 13 };
    ws.addRow([`${args.district} · ${args.scope}`]);
    ws.getRow(2).font = { size: 10, color: { argb: "FF64728A" } };
    if (sheet.caption) {
      ws.addRow([sheet.caption]);
      ws.getRow(3).font = { size: 10, color: { argb: "FF64728A" } };
    }
    ws.addRow([]);

    const headerRow = ws.addRow(sheet.columns.map((c) => c.header));
    headerRow.font = { bold: true, size: 10 };
    headerRow.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F9FC" } };
      cell.border = { bottom: { style: "thin", color: { argb: "FFE2E7EF" } } };
    });

    for (const row of sheet.rows) ws.addRow(row);

    if (sheet.total) {
      const totalRow = ws.addRow(sheet.total);
      totalRow.font = { bold: true };
      totalRow.eachCell((cell) => {
        cell.border = { top: { style: "thin", color: { argb: "FFC7CFDB" } } };
      });
    }

    sheet.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.width = c.width ?? Math.max(12, c.header.length + 4);
      if (c.format === "money") col.numFmt = MONEY_FORMAT;
      if (c.format === "percent") col.numFmt = PERCENT_FORMAT;
      if (c.format !== "text" && i > 0) col.alignment = { horizontal: "right" };
    });

    ws.views = [{ state: "frozen", ySplit: sheet.caption ? 5 : 4 }];
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

/** Content-Disposition for a download, with a name a district can find again. */
export function downloadHeaders(filename: string, kind: "xlsx" | "csv"): HeadersInit {
  return {
    "Content-Type":
      kind === "xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  };
}

/** A file name that sorts usefully in a downloads folder. */
export function exportFilename(dashboard: string, scope: string, kind: "xlsx" | "csv"): string {
  const safe = `${dashboard}-${scope}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${safe}.${kind}`;
}
