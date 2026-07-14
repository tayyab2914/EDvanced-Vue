// Pure, dependency-free table-sorting logic (no React, no "use client") so it can be
// unit-tested on its own. components/ui/sortable.tsx wires this to the header UI.

export type SortDir = "asc" | "desc";
export type SortValue = string | number | boolean | Date | null | undefined;

export interface SortState {
  key: string;
  dir: SortDir;
}

// Natural ordering: "Fund 2" before "Fund 10", and case-insensitive — what people expect of
// codes and names. `base` sensitivity keeps "ábc" alongside "abc".
const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

export function isBlank(v: SortValue): boolean {
  return v == null || v === "";
}

/** Compares two non-blank values of the same kind. */
export function compareValues(a: SortValue, b: SortValue): number {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") {
    return (a ? 1 : 0) - (b ? 1 : 0);
  }
  return collator.compare(String(a), String(b));
}

/**
 * Returns a NEW array sorted by `sort`, leaving `rows` untouched.
 *
 * Two rules worth knowing:
 *  - Blanks always sink to the bottom, in BOTH directions. Flipping them to the top on a
 *    descending sort would bury the rows the user actually wants under a wall of "—".
 *  - The sort is stable (Array.prototype.sort is), so rows that tie keep the order the
 *    server sent them in.
 */
export function sortRows<T>(
  rows: T[],
  get: (row: T, key: string) => SortValue,
  sort: SortState | null,
): T[] {
  if (!sort) return rows;
  return [...rows].sort((x, y) => {
    const a = get(x, sort.key);
    const b = get(y, sort.key);
    if (isBlank(a) || isBlank(b)) {
      if (isBlank(a) && isBlank(b)) return 0;
      return isBlank(a) ? 1 : -1;
    }
    const c = compareValues(a, b);
    return sort.dir === "asc" ? c : -c;
  });
}

/** First click on a column sorts ascending; clicking the active column flips the direction. */
export function nextSort(prev: SortState | null, key: string): SortState {
  return prev && prev.key === key
    ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
    : { key, dir: "asc" };
}
