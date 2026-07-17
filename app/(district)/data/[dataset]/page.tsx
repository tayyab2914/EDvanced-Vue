import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getTenantDb, userCan } from "@/lib/auth/dal";
import { datasetBySlug, DATASET_SLUGS } from "@/lib/datasets/kinds";
import { browse, cellOf, nameOf, PAGE_SIZE } from "@/lib/datasets/browse";
import { periodLabel } from "@/lib/periods/fiscal";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ServerTable, type ServerRow } from "@/components/data/server-table";
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
  searchParams: Promise<{
    fy?: string;
    period?: string;
    q?: string;
    sort?: string;
    dir?: string;
    page?: string;
  }>;
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

  // Default to the most recent period that has data — the one they almost always want.
  const selected =
    versions.find(
      (v) =>
        v.fiscalYear === sp.fy &&
        String(v.period ?? "") === (sp.period ?? String(v.period ?? "")),
    ) ??
    versions.find((v) => v.fiscalYear === sp.fy) ??
    versions[0];

  const dir = sp.dir === "desc" ? "desc" : "asc";
  const result = await browse(db, {
    slug: meta.slug,
    versionId: selected.id,
    q: sp.q || undefined,
    sort: sp.sort || undefined,
    dir,
    page: Number(sp.page) || 1,
    pageSize: PAGE_SIZE,
  });

  const rows: ServerRow[] = result.rows.map((row) => ({
    id: String(row.id),
    cells: Object.fromEntries(result.columns.map((c) => [c.key, cellOf(meta.slug, row, c)])),
    titles: Object.fromEntries(result.columns.map((c) => [c.key, nameOf(meta.slug, row, c)])),
  }));

  const exportParams = new URLSearchParams({
    fy: selected.fiscalYear,
    ...(selected.period !== null ? { period: String(selected.period) } : {}),
    ...(sp.q ? { q: sp.q } : {}),
    ...(sp.sort ? { sort: sp.sort, dir } : {}),
  });

  return (
    <div className="animate-fade-up space-y-[18px]">
      <Header slug={dataset} label={meta.label} />

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11.5px] font-medium uppercase tracking-wider text-muted-2">
            Period
          </span>
          {versions.slice(0, 12).map((v) => {
            const active = v.id === selected.id;
            const href = `/data/${dataset}?fy=${v.fiscalYear}${v.period !== null ? `&period=${v.period}` : ""}`;
            return (
              <Link
                key={v.id}
                href={href}
                className={
                  active
                    ? "rounded-full bg-brand px-2.5 py-1 text-[12px] font-medium text-white"
                    : "rounded-full border border-line px-2.5 py-1 text-[12px] text-muted hover:border-[#c8d3e4]"
                }
              >
                {v.fiscalYear} · {periodLabel(v.periodType as PeriodType, v.period, startMonth)}
              </Link>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line-soft pt-3 text-[12px] text-muted-2">
          <Badge tone="green">Current · v{selected.version}</Badge>
          <span>
            {selected.rowCount.toLocaleString()} rows from {selected.fileName}, imported{" "}
            {formatDateTime(selected.committedAt)}
          </span>
          <Link href="/data/versions" className="font-medium text-brand hover:underline">
            Version history
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
        description="The current version for the selected period. Search, sort and export run on the server."
      />
      <div className="flex flex-wrap gap-1.5">
        {DATASET_SLUGS.map((s) => {
          const m = datasetBySlug(s)!;
          return (
            <Link
              key={s}
              href={`/data/${s}`}
              className={
                s === slug
                  ? "rounded-lg bg-navy px-2.5 py-1.5 text-[12px] font-medium text-white"
                  : "rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-muted hover:border-[#c8d3e4]"
              }
            >
              {m.label}
            </Link>
          );
        })}
      </div>
    </>
  );
}
