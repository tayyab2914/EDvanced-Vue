import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getTenantDb, userCan } from "@/lib/auth/dal";
import { datasetBySlug, DATASET_SLUGS } from "@/lib/datasets/kinds";
import {
  browse,
  browseFilters,
  browseTotals,
  cellOf,
  filtersFromParams,
  nameOf,
  FILTER_PREFIX,
  PAGE_SIZE,
} from "@/lib/datasets/browse";
import { labelMode } from "@/lib/dashboard/label-mode";
import { periodLabel } from "@/lib/periods/fiscal";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { VIEW_DETAILS } from "@/lib/dashboard/cta";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ServerTable, type ServerRow } from "@/components/data/server-table";
import { PeriodSelect, type FiscalYearOption } from "@/components/data/period-select";
import type { DatasetKind, PeriodType } from "@/lib/enums";

/**
 * Browse the committed rows of one dataset, one period at a time.
 *
 * Only the CURRENT version is shown — that is what "drives the dashboards" (Spec §5.9),
 * and showing superseded rows here would put two answers on one screen. The version
 * history is where the others live.
 */
export default async function DatasetBrowsePage({
  params,
  searchParams,
}: {
  params: Promise<{ dataset: string }>;
  // The dimension filters arrive as `f_<column>` and are read off by name, so a new
  // dimension on a dataset gets a filter without this signature changing.
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { dataset } = await params;
  const meta = datasetBySlug(dataset);
  if (!meta) notFound();

  const { db, user, districtId } = await getTenantDb();
  if (!userCan(user, "view_dashboards")) redirect("/dashboard");

  const sp = await searchParams;

  const district = await db.district.findFirst({
    where: { id: districtId },
    select: { fiscalYearStartMonth: true },
  });
  const startMonth = district?.fiscalYearStartMonth ?? 7;

  // Every period this dataset has data for — the picker, and the default.
  const versions = await db.datasetVersion.findMany({
    where: { dataset: meta.kind as DatasetKind, isCurrent: true },
    orderBy: [{ fiscalYear: "desc" }, { period: "desc" }],
    select: {
      id: true,
      fiscalYear: true,
      period: true,
      periodType: true,
      version: true,
      rowCount: true,
      fileName: true,
      committedAt: true,
    },
  });

  if (versions.length === 0) {
    return (
      <div className="animate-fade-up space-y-[18px]">
        <Header slug={dataset} label={meta.label} />
        <Card>
          <div className="py-8 text-center">
            <p className="text-[13.5px] text-muted">No {meta.label.toLowerCase()} has been imported yet.</p>
            {userCan(user, "upload_data") && (
              <div className="mt-3">
                <Link href="/data/upload">
                  <Button>Upload {meta.label.toLowerCase()}</Button>
                </Link>
              </div>
            )}
          </div>
        </Card>
      </div>
    );
  }

  // Default to the most recent period that has data — the one they almost always want. A
  // year without the requested period falls back to that year's latest, which is what the
  // fiscal-year dropdown relies on when it changes year without naming a period.
  const selected =
    (sp.fy
      ? (versions.find(
          (v) => v.fiscalYear === sp.fy && (!sp.period || String(v.period ?? "") === sp.period),
        ) ?? versions.find((v) => v.fiscalYear === sp.fy))
      : undefined) ?? versions[0];

  // The picker's two lists. Years keep the order they were read in — newest first — and are
  // grouped off the back of that order, so this must not be re-sorted. The periods within a
  // year are turned back the other way: twelve months read as a calendar, not as a history.
  const years: FiscalYearOption[] = [];
  for (const v of versions) {
    const last = years[years.length - 1];
    const year = last?.fiscalYear === v.fiscalYear ? last : null;
    const entry = year ?? { fiscalYear: v.fiscalYear, periods: [] };
    if (!year) years.push(entry);
    if (v.period !== null) {
      entry.periods.unshift({
        value: String(v.period),
        label: periodLabel(v.periodType as PeriodType, v.period, startMonth),
      });
    }
  }

  const dir = sp.dir === "desc" ? "desc" : "asc";
  const filters = filtersFromParams(sp);

  // The reader's Codes / Names setting. The export route deliberately does NOT read it —
  // see the note on `cellOf`. Resolved before the reads below because the filter dropdowns
  // are labelled with it too.
  const mode = await labelMode();

  // Three reads of the same version with nothing between them. The totals and the filter
  // options are not free, but they are not sequential either — the page waits once.
  const [result, totals, filterDefs] = await Promise.all([
    browse(db, {
      slug: meta.slug,
      versionId: selected.id,
      q: sp.q || undefined,
      filters,
      sort: sp.sort || undefined,
      dir,
      page: Number(sp.page) || 1,
      pageSize: PAGE_SIZE,
    }),
    browseTotals(db, { slug: meta.slug, versionId: selected.id, q: sp.q || undefined, filters }),
    browseFilters(db, meta.slug, selected.id, mode),
  ]);

  const rows: ServerRow[] = result.rows.map((row) => ({
    id: String(row.id),
    cells: Object.fromEntries(
      result.columns.map((c) => [c.key, cellOf(meta.slug, row, c, { display: true, mode })]),
    ),
    titles: Object.fromEntries(result.columns.map((c) => [c.key, nameOf(meta.slug, row, c)])),
  }));

  const exportParams = new URLSearchParams({
    fy: selected.fiscalYear,
    ...(selected.period !== null ? { period: String(selected.period) } : {}),
    ...(sp.q ? { q: sp.q } : {}),
    ...(sp.sort ? { sort: sp.sort, dir } : {}),
    // The filters travel too, or the file stops matching the screen — which is the one
    // property this page's URL-as-state design exists to guarantee.
    ...Object.fromEntries(
      Object.entries(filters).map(([k, v]) => [`${FILTER_PREFIX}${k}`, v]),
    ),
  });

  return (
    <div className="animate-fade-up space-y-[18px]">
      <Header slug={dataset} label={meta.label} />

      <Card>
        {/*
          Fiscal year and reporting period are picked separately — one list that grows a
          row a year, one that is capped at the twelve months of a fiscal year — rather
          than as one list of every committed version, which grows twelve a year on the
          monthly datasets. See components/data/period-select.tsx.
        */}
        <PeriodSelect
          dataset={dataset}
          years={years}
          fiscalYear={selected.fiscalYear}
          period={selected.period !== null ? String(selected.period) : null}
        />

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line-soft pt-3 text-[12px] text-muted-2">
          <Badge tone="green">Current · v{selected.version}</Badge>
          <span>
            {selected.rowCount.toLocaleString()} rows from {selected.fileName}, imported{" "}
            {formatDateTime(selected.committedAt)}
          </span>
          <Link href="/data/versions" className="font-medium text-brand hover:underline">
            {VIEW_DETAILS.versionHistory}
          </Link>
        </div>
      </Card>

      <ServerTable
        columns={result.columns.map((c) => ({ key: c.key, label: c.label, type: c.type }))}
        rows={rows}
        total={result.total}
        page={result.page}
        pageCount={result.pageCount}
        sort={sp.sort ?? null}
        dir={dir}
        q={sp.q ?? ""}
        filters={filterDefs}
        active={filters}
        filterPrefix={FILTER_PREFIX}
        totals={totals}
        exportHref={`/data/${dataset}/export?${exportParams.toString()}`}
      />
    </div>
  );
}

function Header({ slug, label }: { slug: string; label: string }) {
  return (
    <>
      <PageHeader
        title={label}
        description="Browse, search, sort, and export the current data for the selected period."
      />
      {/*
        THE SAME TABS AS CHART OF ACCOUNTS — components/master-data/master-data-workspace.tsx.
        Two screens that both switch between dimensions of the same district's ledger should
        not switch differently. Links rather than buttons because each dataset is its own
        route, but the face is the underline tab, to the pixel.
      */}
      <div className="border-b border-line">
        <div className="-mb-px flex gap-1 overflow-x-auto">
          {DATASET_SLUGS.map((s) => {
            const m = datasetBySlug(s)!;
            const active = s === slug;
            return (
              <Link
                key={s}
                href={`/data/${s}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors",
                  active
                    ? "border-brand text-brand"
                    : "border-transparent text-muted-2 hover:border-line hover:text-ink-soft",
                )}
              >
                {m.label}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
