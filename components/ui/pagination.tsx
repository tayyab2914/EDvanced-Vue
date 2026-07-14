"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";

export const PAGE_SIZE = 25;

/** "All" is a page size of Infinity — one page holding everything. */
export const ALL_ROWS = Number.POSITIVE_INFINITY;

export const PAGE_SIZE_OPTIONS: { value: number; label: string }[] = [
  { value: 10, label: "10" },
  { value: 25, label: "25" },
  { value: 50, label: "50" },
  { value: 100, label: "100" },
  { value: ALL_ROWS, label: "All" },
];

/** The smallest choice. Below this many rows, paging can't do anything. */
const MIN_PAGE_SIZE = 10;

const STORAGE_KEY = "edv.rowsPerPage";

function readStoredPageSize(): number | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const n = raw === "all" ? ALL_ROWS : Number(raw);
    return PAGE_SIZE_OPTIONS.some((o) => o.value === n) ? n : null;
  } catch {
    return null; // private mode / storage disabled — just use the default
  }
}

function writeStoredPageSize(n: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, n === ALL_ROWS ? "all" : String(n));
  } catch {
    // Not worth surfacing: the table still works, the choice just won't be remembered.
  }
}

/**
 * The rows-per-page preference as an external store.
 *
 * `useSyncExternalStore` is the right primitive here rather than "useState + read it back in
 * an effect": the server has no localStorage, so it must render the default while the client
 * renders the stored value. This hands React both snapshots explicitly, so hydration is clean
 * and no setState-in-an-effect cascade is needed.
 *
 * A single shared store also means every table agrees — set 100 on Funds and the Users table
 * is already showing 100 when you get there.
 */
const listeners = new Set<() => void>();
let cachedPageSize: number | null = null;

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Keep other tabs of the app in step.
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      cachedPageSize = null;
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

// Must return a STABLE value between calls, or React re-renders forever — hence the cache.
function getSnapshot(): number {
  if (cachedPageSize === null) cachedPageSize = readStoredPageSize() ?? PAGE_SIZE;
  return cachedPageSize;
}

function getServerSnapshot(): number {
  return PAGE_SIZE;
}

function storePageSize(n: number): void {
  cachedPageSize = n;
  writeStoredPageSize(n);
  for (const l of listeners) l();
}

/**
 * Client-side pagination over an already-loaded list. These tables render every row in a
 * single server pass, so paging is pure client state — no round-trip on page change.
 *
 * `page` is clamped rather than reset via an effect: when a filter shrinks the list below
 * the current page, the clamp lands the user on the last real page instead of a blank one.
 *
 * The rows-per-page choice is remembered across tables and navigations (localStorage). That
 * matters because MasterDataWorkspace remounts this manager on every tab switch — without it,
 * picking "100" and moving from Funds to Grants would silently snap back to 25.
 */
export function usePagination<T>(items: T[]) {
  const [page, setPage] = useState(1);
  const pageSize = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setPageSize = (n: number) => {
    storePageSize(n);
    setPage(1); // showing more/fewer rows starts you back at the top, not mid-list
  };

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pageCount);
  // Guard the ALL case explicitly: (1 - 1) * Infinity is NaN, not 0, which would poison
  // `from`/`to` and render "Showing NaN–47 of 47".
  const start = pageSize === ALL_ROWS ? 0 : (current - 1) * pageSize;

  const pageItems = useMemo(
    () => (pageSize === ALL_ROWS ? items : items.slice(start, start + pageSize)),
    [items, start, pageSize],
  );

  return {
    pageItems,
    page: current,
    pageCount,
    pageSize,
    setPageSize,
    total: items.length,
    from: items.length === 0 ? 0 : start + 1,
    to: pageSize === ALL_ROWS ? items.length : Math.min(start + pageSize, items.length),
    setPage,
    reset: () => setPage(1),
  };
}

export function Pagination({
  page,
  pageCount,
  pageSize,
  onPageSize,
  total,
  from,
  to,
  onPage,
  noun = "rows",
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  onPageSize: (n: number) => void;
  total: number;
  from: number;
  to: number;
  onPage: (p: number) => void;
  noun?: string;
}) {
  // Below the smallest page size there is nothing to page through and nothing a rows-per-page
  // choice could change, so the whole bar stays out of the way.
  if (total <= MIN_PAGE_SIZE) return null;

  const btn =
    "flex h-8 items-center rounded-lg border border-line bg-white px-3 text-[12.5px] font-medium text-ink-soft transition-colors hover:bg-panel disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-white";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-[12.5px] text-muted-2">
          <span>Rows per page</span>
          <select
            value={pageSize === ALL_ROWS ? "all" : String(pageSize)}
            onChange={(e) =>
              onPageSize(e.target.value === "all" ? ALL_ROWS : Number(e.target.value))
            }
            className="h-8 rounded-lg border border-line bg-white pl-2 pr-6 text-[12.5px] font-medium text-ink-soft outline-none transition-colors hover:bg-panel focus:border-brand focus:ring-2 focus:ring-brand/20"
          >
            {PAGE_SIZE_OPTIONS.map((o) => (
              <option key={o.label} value={o.value === ALL_ROWS ? "all" : o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <p className="text-[12.5px] text-muted-2">
          Showing <span className="font-medium text-ink-soft">{from}</span>–
          <span className="font-medium text-ink-soft">{to}</span> of{" "}
          <span className="font-medium text-ink-soft">{total}</span> {noun}
        </p>
      </div>

      {/* With "All" selected there is exactly one page, so the pager itself is pointless. */}
      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={btn}
            onClick={() => onPage(page - 1)}
            disabled={page <= 1}
          >
            Previous
          </button>
          <span className="px-1 text-[12.5px] text-muted-2">
            Page <span className="font-medium text-ink-soft">{page}</span> of{" "}
            <span className="font-medium text-ink-soft">{pageCount}</span>
          </span>
          <button
            type="button"
            className={cn(btn)}
            onClick={() => onPage(page + 1)}
            disabled={page >= pageCount}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
