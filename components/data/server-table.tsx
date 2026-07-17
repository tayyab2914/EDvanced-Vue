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
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(q);

  function navigate(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    startTransition(() => router.push(`${pathname}?${sp.toString()}`, { scroll: false }));
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
                  {q ? `Nothing matches “${q}”.` : "No rows in this version."}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line-soft">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    // The code is what a district recognises; the name is the reassurance.
                    // A title keeps both without doubling the width of every column.
                    title={r.titles[c.key] ?? undefined}
                    className={cn(
                      "py-2",
                      c.type === "amount"
                        ? "pl-3 text-right font-mono tabular-nums"
                        : "pr-3",
                      c.type === "code" && "font-mono text-ink-soft",
                    )}
                  >
                    {r.cells[c.key] || <span className="text-muted-2">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-3 text-[12.5px]">
        <span className="text-muted">
          {total === 0 ? "No rows" : `Showing ${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}`}
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
