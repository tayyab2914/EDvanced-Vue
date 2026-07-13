"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";

export const PAGE_SIZE = 25;

/**
 * Client-side pagination over an already-loaded list. These tables render every row in a
 * single server pass, so paging is pure client state — no round-trip on page change.
 *
 * `page` is clamped rather than reset via an effect: when a filter shrinks the list below
 * the current page, the clamp lands the user on the last real page instead of a blank one.
 */
export function usePagination<T>(items: T[], pageSize: number = PAGE_SIZE) {
  const [page, setPage] = useState(1);

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * pageSize;

  const pageItems = useMemo(
    () => items.slice(start, start + pageSize),
    [items, start, pageSize],
  );

  return {
    pageItems,
    page: current,
    pageCount,
    total: items.length,
    from: items.length === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, items.length),
    setPage,
    reset: () => setPage(1),
  };
}

export function Pagination({
  page,
  pageCount,
  total,
  from,
  to,
  onPage,
  noun = "rows",
}: {
  page: number;
  pageCount: number;
  total: number;
  from: number;
  to: number;
  onPage: (p: number) => void;
  noun?: string;
}) {
  // One page of results needs no controls — the row count is self-evident.
  if (total <= PAGE_SIZE) return null;

  const btn =
    "flex h-8 items-center rounded-lg border border-line bg-white px-3 text-[12.5px] font-medium text-ink-soft transition-colors hover:bg-panel disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-white";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-[12.5px] text-muted-2">
        Showing <span className="font-medium text-ink-soft">{from}</span>–
        <span className="font-medium text-ink-soft">{to}</span> of{" "}
        <span className="font-medium text-ink-soft">{total}</span> {noun}
      </p>

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
    </div>
  );
}
