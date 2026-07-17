import Link from "next/link";
import { getTenantDb, userCan } from "@/lib/auth/dal";
import { prisma } from "@/lib/db";
import { datasetByKind } from "@/lib/datasets/kinds";
import { datasetDef } from "@/lib/datasets/registry";
import { periodLabel } from "@/lib/periods/fiscal";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { VersionList, type VersionRow } from "@/components/import/version-list";
import type { DatasetKind, PeriodType } from "@/lib/enums";

/**
 * Version history: every upload for every period, with what happened to it.
 *
 * "Exactly one version per period is marked current and drives the dashboards. The others
 * are retained for audit and rollback." (Spec §5.9)
 */
export default async function VersionsPage() {
  const { db, user, districtId } = await getTenantDb();

  const [district, versions] = await Promise.all([
    db.district.findFirst({
      where: { id: districtId },
      select: { fiscalYearStartMonth: true },
    }),
    db.datasetVersion.findMany({
      orderBy: [{ fiscalYear: "desc" }, { period: "desc" }, { version: "desc" }],
      take: 500,
    }),
  ]);
  const startMonth = district?.fiscalYearStartMonth ?? 7;

  // Resolve committer names in one query rather than per row — the same shape lib/audit.ts
  // uses, and for the same reason. Through the base client: the actor may be a platform
  // admin, who belongs to no district and so cannot be found through a scoped one.
  const actorIds = [...new Set(versions.map((v) => v.committedByUserId))];
  const actors = await prisma.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, name: true, email: true },
  });
  const actorName = new Map(actors.map((a) => [a.id, a.name || a.email]));

  // A Replace deletes the superseded version's rows but keeps the version record. So
  // "can this be restored?" is a question about rows, not about the version — and it has
  // to be asked per dataset, since each lands in its own table.
  const rowCounts = await countRowsPerVersion(db, versions);

  const rows: VersionRow[] = versions.map((v) => {
    const meta = datasetByKind(v.dataset as DatasetKind);
    return {
      id: v.id,
      dataset: v.dataset,
      datasetLabel: meta.label,
      fiscalYear: v.fiscalYear,
      periodLabel: periodLabel(v.periodType as PeriodType, v.period, startMonth),
      version: v.version,
      isCurrent: v.isCurrent,
      action: v.action as VersionRow["action"],
      rowCount: v.rowCount,
      warningCount: v.warningCount,
      fileName: v.fileName,
      committedAt: formatDateTime(v.committedAt),
      committedBy: actorName.get(v.committedByUserId) ?? "—",
      hasData: (rowCounts.get(v.id) ?? 0) > 0,
      restoredFrom: null,
    };
  });

  // Which version each restore came from, for the "Restored from v1" label.
  const versionNumber = new Map(versions.map((v) => [v.id, v.version]));
  versions.forEach((v, i) => {
    if (v.restoredFromVersionId) {
      rows[i].restoredFrom = versionNumber.get(v.restoredFromVersionId) ?? null;
    }
  });

  // One group per period: "what happened to August" is the question being asked.
  const groups = new Map<string, (typeof rows)[number][]>();
  for (const r of rows) {
    const key = `${r.dataset}|${r.fiscalYear}|${r.periodLabel}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  return (
    <div className="animate-fade-up space-y-[18px]">
      <PageHeader
        title="Data & versions"
        description="Every upload is kept. One version per period drives the dashboards; the rest stay for audit and rollback."
        actions={
          userCan(user, "upload_data") ? (
            <Link href="/data/upload">
              <Button>Upload data</Button>
            </Link>
          ) : undefined
        }
      />

      <VersionList
        groups={[...groups.entries()].map(([key, versions]) => ({
          key,
          datasetLabel: versions[0].datasetLabel,
          fiscalYear: versions[0].fiscalYear,
          periodLabel: versions[0].periodLabel,
          versions,
        }))}
        districtId={districtId}
        canManage={userCan(user, "manage_versions")}
      />
    </div>
  );
}

/**
 * How many rows each version still holds.
 *
 * Grouped per dataset because each lands in its own table — one groupBy per table that
 * actually appears, rather than one query per version.
 */
async function countRowsPerVersion(
  db: Awaited<ReturnType<typeof getTenantDb>>["db"],
  versions: { id: string; dataset: string }[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const byDataset = new Map<string, string[]>();

  for (const v of versions) {
    const list = byDataset.get(v.dataset) ?? [];
    list.push(v.id);
    byDataset.set(v.dataset, list);
  }

  for (const [dataset, ids] of byDataset) {
    const model = datasetDef(datasetByKind(dataset as DatasetKind).slug).model;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const grouped: { versionId: string; _count: { _all: number } }[] = await (db as any)[
      model
    ].groupBy({
      by: ["versionId"],
      where: { versionId: { in: ids } },
      _count: { _all: true },
    });
    for (const g of grouped) out.set(g.versionId, g._count._all);
  }

  return out;
}
