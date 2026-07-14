"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { TH_PADDING, TH_TYPE } from "@/components/ui/table";
import {
  nextSort,
  sortRows,
  type SortDir,
  type SortState,
  type SortValue,
} from "@/lib/sort";

/**
 * Click-to-sort table headers, shared by every table in the app. The ordering rules live in
 * lib/sort.ts (pure, unit-tested); this file is only the React wiring.
 *
 * Sorting is client-side over the already-loaded rows — the same place filtering and
 * pagination already happen (see usePagination), so a sort costs no round-trip. Sort BEFORE
 * paginating, so the order applies to the whole list rather than just the visible page.
 */

export type { SortDir, SortState, SortValue };

/**
 * `get(row, key)` returns the value to sort a column by — the value the user SEES, not the
 * raw one (sort a "Type" column by its label, not its foreign key). Return `null` for blanks.
 *
 * Callers pass `get` inline, so it has a fresh identity each render and the memo recomputes
 * every time. That's deliberate and cheap: these tables already re-filter the same list on
 * every keystroke, so the sort is the same order of work as the filter beside it.
 */
export function useSort<T>(
  rows: T[],
  get: (row: T, key: string) => SortValue,
  initial: SortState | null = null,
) {
  const [sort, setSort] = useState<SortState | null>(initial);

  const sorted = useMemo(() => sortRows(rows, get, sort), [rows, sort, get]);

  const toggle = useCallback((key: string) => {
    setSort((prev) => nextSort(prev, key));
  }, []);

  return { sorted, sort, toggle };
}

function Arrow({ dir }: { dir: SortDir | null }) {
  // Inactive columns show a faint double-chevron that only appears on hover/focus, so the
  // header row stays quiet until you go looking for the affordance.
  if (!dir) {
    return (
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="flex-none opacity-0 transition-opacity group-hover:opacity-40 group-focus-visible:opacity-40"
      >
        <path d="m7 15 5 5 5-5" />
        <path d="m7 9 5-5 5 5" />
      </svg>
    );
  }
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="flex-none text-brand"
    >
      {dir === "asc" ? <path d="m5 15 7-7 7 7" /> : <path d="m5 9 7 7 7-7" />}
    </svg>
  );
}

/**
 * A sortable column header. The whole header cell is the click target (the button carries
 * the padding), so it's an easy hit rather than a tiny label.
 */
export function SortTH({
  sortKey,
  sort,
  onSort,
  align = "left",
  className,
  children,
}: {
  sortKey: string;
  sort: SortState | null;
  onSort: (key: string) => void;
  align?: "left" | "right";
  className?: string;
  children: ReactNode;
}) {
  const active = sort?.key === sortKey;
  const dir = active ? sort!.dir : null;

  // The <th> carries only the type styles; the button carries the padding, so the entire
  // header cell is the click target rather than just the few pixels behind the label.
  return (
    <th
      className={cn(TH_TYPE, className)}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "group flex w-full items-center gap-1.5 transition-colors hover:text-ink",
          TH_PADDING,
          align === "right" && "justify-end",
          active && "text-ink",
        )}
      >
        {children}
        <Arrow dir={dir} />
      </button>
    </th>
  );
}
