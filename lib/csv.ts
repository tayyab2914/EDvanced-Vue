// Minimal RFC-4180-ish CSV utilities (no dependency). Handles quoted fields,
// embedded commas/newlines, and "" escaped quotes.

export function parseCsv(text: string): string[][] {
  const s = text.replace(/\r\n?/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop fully-empty rows (e.g. trailing newline).
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function parseCsvRows(text: string): {
  headers: string[];
  rows: string[][];
} {
  const all = parseCsv(text);
  if (all.length === 0) return { headers: [], rows: [] };
  return { headers: all[0].map((h) => h.trim()), rows: all.slice(1) };
}

/** Quote a value for CSV output when it contains a comma, quote, or newline. */
export function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
