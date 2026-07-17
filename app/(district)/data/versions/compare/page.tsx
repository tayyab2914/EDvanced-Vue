import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTenantDb, userCan } from "@/lib/auth/dal";
import { datasetByKind } from "@/lib/datasets/kinds";
import { compareVersions } from "@/lib/import/compare";
import { periodLabel } from "@/lib/periods/fiscal";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { DatasetKind, PeriodType } from "@/lib/enums";

/**
 * Compare two versions of the same period.
 *
 * Reached from the version history with ?from=&to=. Both must be the same dataset and
 * period — comparing August's revenue to September's expenditure is not a diff, it is a
 * category error.
 */
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const { db, user, districtId } = await getTenantDb();
  if (!userCan(user, "view_dashboards")) redirect("/dashboard");
  if (!sp.from || !sp.to) redirect("/data/versions");

  const [from, to] = await Promise.all([
    db.datasetVersion.findFirst({ where: { id: sp.from } }),
    db.datasetVersion.findFirst({ where: { id: sp.to } }),
  ]);
  if (!from || !to) notFound();

  if (
    from.dataset !== to.dataset ||
    from.fiscalYear !== to.fiscalYear ||
    from.period !== to.period
  ) {
    return (
      <div className="animate-fade-up space-y-[18px]">
        <PageHeader title="Compare versions" />
        <Card>
          <p className="text-[13.5px] text-muted">
            Those two versions are for different periods, so there is nothing meaningful to
            compare.{" "}
            <Link href="/data/versions" className="font-medium text-brand hover:underline">
              Back to version history
            </Link>
          </p>
        </Card>
      </div>
    );
  }

  const district = await db.district.findFirst({
    where: { id: districtId },
    select: { fiscalYearStartMonth: true },
  });
  const meta = datasetByKind(from.dataset as DatasetKind);
  const diff = await compareVersions(db, meta.slug, from.id, to.id);

  return (
    <div className="animate-fade-up space-y-[18px]">
      <PageHeader
        title={`${meta.label}: v${from.version} → v${to.version}`}
        description={`${from.fiscalYear} · ${periodLabel(from.periodType as PeriodType, from.period, district?.fiscalYearStartMonth ?? 7)}`}
      />

      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Side label={`v${from.version}`} v={from} />
          <Side label={`v${to.version}`} v={to} current={to.isCurrent} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-line-soft pt-4">
          <Badge tone={diff.added > 0 ? "green" : "gray"}>{diff.added} added</Badge>
          <Badge tone={diff.removed > 0 ? "red" : "gray"}>{diff.removed} removed</Badge>
          <Badge tone={diff.changed > 0 ? "amber" : "gray"}>{diff.changed} changed</Badge>
          <Badge tone="gray">{diff.unchanged} unchanged</Badge>
        </div>

        {diff.truncated && (
          <p className="mt-3 text-[12px] text-warn">
            These versions are too large to diff in full — this compares the first 20,000 rows of
            each. The totals below cover only those rows.
          </p>
        )}
      </Card>

      {/* The headline: a 4,000-row diff should still answer "did the money move?" */}
      <Card>
        <h2 className="mb-3 text-[14.5px] font-semibold">Net movement</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-wider text-muted">
                <th className="py-2 pr-3 font-semibold">Column</th>
                <th className="py-2 pl-3 text-right font-semibold">v{from.version}</th>
                <th className="py-2 pl-3 text-right font-semibold">v{to.version}</th>
                <th className="py-2 pl-3 text-right font-semibold">Change</th>
              </tr>
            </thead>
            <tbody>
              {diff.totals.map((t) => (
                <tr key={t.label} className="border-b border-line-soft">
                  <td className="py-2 pr-3 text-ink-soft">{t.label}</td>
                  <td className="py-2 pl-3 text-right font-mono tabular-nums text-muted">{t.from}</td>
                  <td className="py-2 pl-3 text-right font-mono tabular-nums text-ink">{t.to}</td>
                  <td
                    className={cn(
                      "py-2 pl-3 text-right font-mono tabular-nums font-medium",
                      t.delta.startsWith("-") ? "text-bad" : t.delta === "0.00" ? "text-muted-2" : "text-ok",
                    )}
                  >
                    {t.delta === "0.00" ? "—" : t.delta}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="pb-3">
        <h2 className="mb-3 text-[14.5px] font-semibold">
          What changed{diff.rows.length > 200 && " (first 200)"}
        </h2>

        {diff.rows.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-muted-2">
            These two versions hold identical data.
          </p>
        ) : (
          <div className="flex flex-col">
            {diff.rows.slice(0, 200).map((r, i) => (
              <div key={i} className="border-b border-line-soft py-2.5 last:border-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    tone={r.kind === "added" ? "green" : r.kind === "removed" ? "red" : "amber"}
                  >
                    {r.kind}
                  </Badge>
                  <span className="font-mono text-[12.5px] text-ink">{r.key.filter(Boolean).join(" / ")}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 pl-1 text-[12px]">
                  {r.changes.map((c) => (
                    <span key={c.label} className="text-muted">
                      {c.label}:{" "}
                      {c.from && <span className="font-mono line-through opacity-60">{c.from}</span>}
                      {c.from && c.to && " → "}
                      {c.to && <span className="font-mono text-ink">{c.to}</span>}
                      {c.delta && c.delta !== "0.00" && (
                        <span
                          className={cn(
                            "ml-1.5 font-mono",
                            c.delta.startsWith("-") ? "text-bad" : "text-ok",
                          )}
                        >
                          ({c.delta})
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Side({
  label,
  v,
  current,
}: {
  label: string;
  v: { fileName: string; rowCount: number; committedAt: Date };
  current?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold text-ink">{label}</span>
        {current && <Badge tone="green">Current</Badge>}
      </div>
      <div className="mt-1 text-[12px] text-muted-2">
        {v.fileName} · {v.rowCount.toLocaleString()} rows
      </div>
      <div className="text-[12px] text-muted-2">{formatDateTime(v.committedAt)}</div>
    </div>
  );
}
