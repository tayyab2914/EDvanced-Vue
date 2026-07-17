import ExcelJS from "exceljs";
import type { CellGrid } from "@/lib/import/parse/rows";

/**
 * xlsx -> the same cell grid the CSV reader produces.
 *
 * WHY NOT THE STREAMING READER
 *
 * The plan called for ExcelJS's stream.xlsx.WorkbookReader. It does not work reliably:
 * it needs workbook.xml parsed before it reaches a sheet entry, the zip entry order is
 * not guaranteed, and when it loses that race every read dies on "Cannot read properties
 * of undefined (reading 'sheets')". Measured on this machine, the identical call passed,
 * failed, then passed across three consecutive runs — from a buffer and from a file path
 * alike. A non-deterministic importer is worse than a memory-hungry one.
 *
 * `load()` is 10/10 reliable over the same fixture, and streaming bought less than it
 * looked like anyway: the buffer is already whole in memory because it arrived as a
 * request body (Vercel caps that at 4.5MB, so the input is bounded no matter what), and
 * the real memory cost is the expanded row objects, which both approaches share equally.
 *
 * It is also strictly better at the job: `load()` caches styles, so a properly formatted
 * date cell comes back as a real Date instead of a bare serial.
 *
 * If files ever outgrow the request body, the answer is the chunked upload the staging
 * table is already designed for — not this reader.
 *
 * ExcelJS, not SheetJS: the maintained SheetJS is no longer published to npm, and the
 * package still sitting on that name has a CVE history.
 */

/** Only the first worksheet is read: uploads are one dataset per file, not a workbook. */
export async function readXlsx(buffer: Buffer): Promise<CellGrid> {
  const workbook = new ExcelJS.Workbook();
  // ExcelJS's types predate @types/node making Buffer generic (Buffer<ArrayBufferLike>),
  // so the two Buffers no longer line up nominally. Same bytes either way.
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

  const sheet = workbook.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };

  let headers: string[] = [];
  const rows: CellGrid["rows"] = [];

  sheet.eachRow({ includeEmpty: false }, (row) => {
    // ExcelJS row.values is 1-INDEXED and sparse: index 0 is always empty. Reading it as
    // a normal array silently shifts every column left by one.
    const values = row.values as unknown[];
    const cells = Array.isArray(values) ? values.slice(1) : [];

    if (row.number === 1) {
      headers = cells.map((c) => cellText(c));
      return;
    }

    // Districts leave trailing empties behind. Reporting fifteen "missing Fund Code"
    // errors for rows nobody typed is noise that buries the real findings.
    if (cells.every((c) => cellText(c) === "")) return;

    rows.push({ rowNumber: row.number, cells });
  });

  return { headers, rows };
}

/** Minimal flattening — only to read the header row and to spot a blank row. */
function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object" && !(v instanceof Date)) {
    const o = v as Record<string, unknown>;
    if ("result" in o) return cellText(o.result);
    if ("richText" in o) {
      return (o.richText as { text: string }[]).map((r) => r.text).join("").trim();
    }
    if ("text" in o) return String(o.text ?? "").trim();
  }
  return String(v).trim();
}
