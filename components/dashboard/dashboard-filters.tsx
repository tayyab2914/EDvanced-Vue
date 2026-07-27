import { getTenantDb } from "@/lib/auth/dal";
import { scopeOptions } from "@/lib/dashboard/options";
import type { DashboardScope } from "@/lib/dashboard/scope";
import { FilterBar } from "@/components/dashboard/filter-bar";

/**
 * What every dashboard puts in its header: the global filters, the period, saved views and
 * export.
 *
 * A SERVER component wrapping the client bar, so a page adds filtering with one line and
 * cannot forget half of it. The saved views are read here rather than in each page for the
 * same reason — six pages each remembering to load them is six places for the Views menu to
 * quietly go missing.
 *
 * The read is one indexed query on a table with a handful of rows per district, in parallel
 * with nothing, because it is the only thing this component does.
 */
export async function DashboardFilters({
  scope,
  exportHref,
  summaryHref,
}: {
  scope: DashboardScope;
  exportHref?: string;
  /** Only the Executive dashboard has a one-page summary view. */
  summaryHref?: string;
}) {
  const { db } = await getTenantDb();
  const options = scopeOptions(scope);

  const views = await db.savedView.findMany({
    select: { id: true, name: true, filters: true },
    orderBy: { name: "asc" },
  });

  return (
    <FilterBar
      periods={options.periods}
      period={options.period}
      options={scope.filters.options}
      selection={scope.filters.selection}
      chips={scope.filters.chips}
      active={scope.filters.active}
      pruned={scope.filters.pruned}
      savedViews={views}
      exportHref={exportHref}
      summaryHref={summaryHref}
    />
  );
}
