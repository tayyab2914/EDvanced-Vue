"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

export interface ServerColumn {
  key: string;
  label: string;
  type: "code" | "text" | "amount" | "date";
}

export interface ServerRow {
  id: string;
  cells: Record<string, string>;
  titles: Record<string, string | null>;
}

export interface ServerFilter {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

/**
 * A table whose state lives in the URL.
 *
 * Deliberately NOT built on usePagination / useSort. Those hold every row in memory and
 * sort in the browser, which is correct for master data and impossible for Expenditure
 * Detail — tens of thousands of rows per district-month. Here the server does the work
 * and this component only reads the query string.
 *
 * The upside of the URL being the state: a district can bookmark or share "August,
 * fund 0101, sorted by available budget", the back button behaves, and the export link
 * is the same query with a different path — so the file always matches the screen.
 */
export function ServerTable({
  columns,
  rows,
  total,
  page,
  pageCount,
  sort,
  dir,
  q,
  exportHref,
  filters = [],
  active = {},
  filterPrefix = "f_",
  totals,
}: {
  columns: ServerColumn[];
  rows: ServerRow[];
  total: number;
  page: number;
  pageCount: number;
  sort: string | null;
  dir: "asc" | "desc";
  q: string;
  exportHref: string;
  /** One dropdown per dimension column, offering only values this version actually uses. */
  filters?: ServerFilter[];
  /** The filters currently applied, keyed by column. */
  active?: Record<string, string>;
  filterPrefix?: string;
  /**
   * SUM per amount column across every matching row, NOT just this page.
   *
   * Absent when the dataset has no money columns. The distinction matters enough to say in
   * the footer: a district checking a dashboard figure against these rows needs to know the
   * total it is reading covers the filter, not the fifty rows it can see.
   */
  totals?: Record<string, string>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(q);

  const activeCount = Object.values(active).filter(Boolean).length;

  function navigate(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    startTransition(() => router.push(`${pathname}?${sp.toString()}`, { scroll: false }));
  }

  function clearFilters() {
    const cleared: Record<string, string | null> = { page: "1" };
    for (const f of filters) cleared[`${filterPrefix}${f.key}`] = null;
    navigate(cleared);
  }

  function toggleSort(key: string) {
    // Same rule as lib/sort.ts: first click ascends, clicking the active column flips.
    const nextDir = sort === key && dir === "asc" ? "desc" : "asc";
    navigate({ sort: key, dir: nextDir, page: "1" });
  }

  const from = total === 0 ? 0 : (page - 1) * 50 + 1;
  const to = Math.min(page * 50, total);

  return (
    <Card className="pb-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ q: search, page: "1" });
          }}
          className="flex flex-1 gap-2"
        >
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search codes…"
            className="max-w-xs"
          />
          <Button type="submit" variant="secondary">
            Search
          </Button>
          {q && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSearch("");
                navigate({ q: null, page: "1" });
              }}
            >
              Clear
            </Button>
          )}
        </form>
        {/* Same query, different path — so the file is exactly what's on screen. */}
        <a href={exportHref} download>
          <Button variant="secondary">Export CSV</Button>
        </a>
      </div>

      {/*
        ONE DROPDOWN PER DIMENSION, and each narrows the totals row at the bottom as well as
        the rows between. That pairing is the point: filtering without totals still means
        exporting to add anything up, and totals without filtering only ever states the whole
        file. Together they are what lets a district check a dashboard figure in place.
      */}
      {filters.length > 0 && (
        <div className="mb-3 flex flex-wrap items-end gap-2 border-t border-line-soft pt-3">
          <span className="pb-1.5 text-[10.5px] font-medium uppercase tracking-wider text-muted-2">
            Filter
          </span>
          {filters.map((f) => (
            <label key={f.key} className="flex flex-col gap-1">
              <span className="text-[10.5px] uppercase tracking-wider text-muted-2">
                {f.label}
              </span>
              <select
                value={active[f.key] ?? ""}
                disabled={pending || f.options.length === 0}
                onChange={(e) =>
                  navigate({ [`${filterPrefix}${f.key}`]: e.target.value || null, page: "1" })
                }
                className={cn(
                  "max-w-60 rounded-lg border px-2 py-1.5 text-[12.5px]",
                  active[f.key]
                    ? "border-brand bg-brand/5 text-ink"
                    : "border-line bg-white text-ink-muted",
                )}
              >
                <option value="">All</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {activeCount > 0 && (
            <Button type="button" variant="ghost" onClick={clearFilters} disabled={pending}>
              Clear filters
            </Button>
          )}
        </div>
      )}

      <div className={cn("overflow-x-auto transition-opacity", pending && "opacity-60")}>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-wider text-muted">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn("font-semibold", c.type === "amount" && "text-right")}
                  aria-sort={
                    sort === c.key ? (dir === "asc" ? "ascending" : "descending") : "none"
                  }
                >
                  {/* The button carries the padding so the whole cell is the hit target,
                      matching SortTH in components/ui/sortable.tsx. */}
                  <button
                    type="button"
                    onClick={() => toggleSort(c.key)}
                    className={cn(
                      "w-full py-2 hover:text-ink",
                      c.type === "amount" ? "pl-3 text-right" : "pr-3 text-left",
                    )}
                  >
                    {c.label}
                    {sort === c.key && (
                      <span className="ml-1 text-brand">{dir === "asc" ? "▲" : "▼"}</span>
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="py-8 text-center text-[13px] text-muted-2">
                  {q || activeCount > 0
                    ? "Nothing matches the current search and filters."
                    : "No rows in this version."}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line-soft">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    // Always the full `Code — Name`, even when the cell shows it in full:
                    // the client's rule (c) on dimension fields.
                    title={r.titles[c.key] ?? undefined}
                    className={cn(
                      "py-2",
                      c.type === "amount"
                        ? "pl-3 text-right font-mono tabular-nums"
                        : "pr-3",
                      c.type === "code" && "text-ink-soft",
                    )}
                  >
                    {r.cells[c.key] ? (
                      c.type === "code" ? (
                        // A dimension column now carries `1000 — General Fund` rather than
                        // `1000`, and Expenditure Detail has EIGHT of them. Without a
                        // ceiling one long project name sets the width of a column on
                        // every one of fifty rows and pushes the amounts off the screen.
                        // 26ch is the low end of the client's 25–35, chosen for a table
                        // this dense; CSS ellipsises earlier if the column is narrower.
                        <span className="block max-w-[26ch] truncate">{r.cells[c.key]}</span>
                      ) : (
                        r.cells[c.key]
                      )
                    ) : (
                      <span className="text-muted-2">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {totals && rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-line bg-panel font-semibold text-ink">
                {columns.map((c, i) => (
                  <td
                    key={c.key}
                    className={cn(
                      "py-2",
                      c.type === "amount" ? "pl-3 text-right font-mono tabular-nums" : "pr-3",
                    )}
                  >
                    {/* The label rides in the first cell, so the row reads as a total even
                        where the leading columns are dimensions rather than blanks. */}
                    {i === 0
                      ? `Total · ${total.toLocaleString()} row${total === 1 ? "" : "s"}`
                      : c.type === "amount"
                        ? (totals[c.key] ?? "")
                        : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-3 text-[12.5px]">
        <span className="text-muted">
          {total === 0
            ? "No rows"
            : `Showing ${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}`}
          {totals && total > 0 && (
            <span className="text-muted-2"> · totals cover all {total.toLocaleString()} matching rows</span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            disabled={page <= 1 || pending}
            onClick={() => navigate({ page: String(page - 1) })}
          >
            Previous
          </Button>
          <span className="text-muted-2">
            Page {page} of {pageCount}
          </span>
          <Button
            variant="secondary"
            disabled={page >= pageCount || pending}
            onClick={() => navigate({ page: String(page + 1) })}
          >
            Next
          </Button>
        </div>
      </div>
    </Card>
  );
}
