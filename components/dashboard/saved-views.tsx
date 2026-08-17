"use client";

import { useState, useRef, useEffect, useActionState } from "react";
import { usePathname } from "next/navigation";
import { saveView, deleteView } from "@/app/actions/saved-views";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/icons";
import { useScopeNavigation, Spinner } from "@/components/dashboard/scope-navigation";
import { PILL_BUTTON, PILL_MENU, PillChevron } from "@/components/dashboard/pill";

export interface SavedViewItem {
  id: string;
  name: string;
  /** The stored query string — `ftype=…&funds=…`. No period; see the Prisma model. */
  filters: string;
}

/**
 * Saved views — "users save their favourite filters".
 *
 * ---------------------------------------------------------------------------
 * APPLYING A VIEW KEEPS THE PERIOD YOU ARE ON
 *
 * A view stores which funds and cost centres, never which month. So applying one rebuilds
 * the query string as `<current fy & period> + <stored filters>`, and the reader stays on
 * the period they were reading. The alternative — storing the period too — means a view
 * saved in September silently walks a superintendent back to September every time they
 * open it, which is the same class of mistake as the silent period substitution
 * lib/dashboard/scope.ts refuses to make.
 *
 * IT REPLACES, IT DOES NOT MERGE. Applying a view clears whatever filters were on screen
 * first. A view named "Special Revenue funds" that quietly kept a School filter someone
 * left behind would show a different slice to each person who applied it, which defeats the
 * one thing a district-wide saved view is for.
 * ---------------------------------------------------------------------------
 *
 * Views are DISTRICT-WIDE, so deleting one takes it from colleagues too. Hence the
 * two-step delete rather than a bare trash icon.
 */
export function SavedViews({
  views,
  /** The filters currently on screen, as a query string. What Save stores. */
  currentFilters,
  /** `fy=…&period=…` — carried onto every applied view. */
  periodQuery,
  hasFilters,
}: {
  views: SavedViewItem[];
  currentFilters: string;
  periodQuery: string;
  hasFilters: boolean;
}) {
  const pathname = usePathname();
  // Applying a view IS a filter change, so it waits the same way and dims the same page.
  const { pending, go } = useScopeNavigation();
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const [saveState, save, saving] = useActionState(saveView, EMPTY_FORM_STATE);
  const [deleteState, remove] = useActionState(deleteView, EMPTY_FORM_STATE);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setNaming(false);
        setConfirming(null);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const apply = (filters: string) => {
    const qs = [periodQuery, filters].filter(Boolean).join("&");
    setOpen(false);
    go(qs ? `${pathname}?${qs}` : pathname);
  };

  /** Highlights the view whose filters are exactly what is applied. */
  const isCurrent = (filters: string) =>
    hasFilters && new URLSearchParams(filters).toString() === currentFilters;

  return (
    <div ref={ref} className="relative print:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        aria-haspopup="menu"
        aria-expanded={open}
        className={PILL_BUTTON}
      >
        {pending && <Spinner size={13} />}
        {pending ? "Applying…" : "Views"}
        {!pending && <PillChevron open={open} />}
      </button>

      {open && (
        <div
          role="menu"
          className={cn(PILL_MENU, "absolute right-0 z-40 mt-[6px] w-[300px] overflow-hidden")}
        >
          <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#060606]">
            Saved views · shared with your district
          </p>

          <div className="max-h-[240px] overflow-y-auto pb-1">
            {views.length === 0 ? (
              <p className="px-3 py-2 text-[12px] text-[#060606]">
                No saved views yet. Apply some filters and save them here — everyone in your
                district will see them.
              </p>
            ) : (
              views.map((v) => (
                <div key={v.id} className="group flex items-center gap-1 px-1">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => apply(v.filters)}
                    className={cn(
                      "min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-panel",
                      isCurrent(v.filters) ? "font-semibold text-brand" : "text-[#060606]",
                    )}
                  >
                    {v.name}
                  </button>

                  {confirming === v.id ? (
                    <form action={remove} className="flex flex-none items-center gap-1 pr-1">
                      <input type="hidden" name="id" value={v.id} />
                      <input type="hidden" name="path" value={pathname} />
                      <button
                        type="submit"
                        className="rounded-md bg-[#c0392b] px-2 py-1 text-[11px] font-semibold text-white"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        className="rounded-md border border-line px-2 py-1 text-[11px] text-[#060606]"
                      >
                        No
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(v.id)}
                      aria-label={`Delete the "${v.name}" view`}
                      className="flex-none rounded-md p-1.5 text-[#060606] opacity-0 transition-opacity hover:text-[#c0392b] focus:opacity-100 group-hover:opacity-100"
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="border-t border-line-soft p-2">
            {naming ? (
              /*
               * `key` on the save result, so a successful save empties the name box.
               *
               * The panel deliberately STAYS OPEN afterwards: the confirmation a user wants
               * is their view appearing in the list above, and closing the form would take
               * that away at the moment it arrived.
               */
              <form action={save} key={saveState.success ?? "new"} className="space-y-1.5">
                <input type="hidden" name="filters" value={currentFilters} />
                <input type="hidden" name="path" value={pathname} />
                <input
                  name="name"
                  autoFocus
                  maxLength={60}
                  placeholder="Name this view…"
                  className="h-8 w-full rounded-md border border-line bg-panel px-2 text-[12px] text-[#060606] outline-none placeholder:text-[#060606] focus:border-brand/50"
                />
                <div className="flex gap-1.5">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-md bg-brand px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setNaming(false)}
                    className="rounded-md border border-line px-2.5 py-1 text-[11px] text-[#060606]"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setNaming(true)}
                disabled={!hasFilters}
                title={hasFilters ? undefined : "Apply a filter first."}
                className="w-full rounded-md border border-line bg-white px-2 py-1.5 text-[12px] font-medium text-[#060606] transition-colors hover:border-[#c8d3e4] disabled:cursor-not-allowed disabled:opacity-45"
              >
                Save current filters as a view
              </button>
            )}

            {(saveState.error || deleteState.error) && (
              <p className="mt-1.5 text-[11px] text-[#c0392b]">
                {saveState.error ?? deleteState.error}
              </p>
            )}
            {(saveState.success || deleteState.success) && (
              <p className="mt-1.5 text-[11px] text-[#1e8e5a]">
                {saveState.success ?? deleteState.success}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
