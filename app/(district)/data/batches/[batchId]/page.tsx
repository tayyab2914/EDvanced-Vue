import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantDb, userCan } from "@/lib/auth/dal";
import { datasetByKind } from "@/lib/datasets/kinds";
import { periodLabel } from "@/lib/periods/fiscal";
import { checkDuplicate } from "@/lib/import/duplicate";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import {
  ValidationReport,
  type ReportFinding,
} from "@/components/import/validation-report";
import type { DatasetKind, PeriodType } from "@/lib/enums";

/**
 * The validation report. Findings are read from the database rather than recomputed:
 * they outlive the request that produced them, because a district reads this, fixes their
 * file, and comes back — possibly tomorrow.
 */
export default async function BatchPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  const { db, user, districtId } = await getTenantDb();

  // findFirst through the tenant client: another district's batch id simply does not
  // resolve, so there is nothing to leak and no 403 to write.
  const batch = await db.importBatch.findFirst({ where: { id: batchId } });
  if (!batch) notFound();

  const district = await db.district.findFirst({
    where: { id: districtId },
    select: { fiscalYearStartMonth: true },
  });
  const startMonth = district?.fiscalYearStartMonth ?? 7;
  const meta = datasetByKind(batch.dataset as DatasetKind);

  const findings = await db.validationFinding.findMany({
    where: { batchId },
    // Errors first, then in file order — the order a district works through their file.
    orderBy: [{ severity: "asc" }, { rowNumber: "asc" }],
    take: 5_000,
  });

  // Only ask about a duplicate once the file is actually importable. There is no point
  // making someone choose how to handle a re-upload of a file that turns out to be broken.
  const dup =
    batch.errorCount === 0 && batch.status !== "COMMITTED"
      ? await checkDuplicate(db, {
          dataset: batch.dataset as DatasetKind,
          fiscalYear: batch.fiscalYear,
          period: batch.period,
        })
      : null;

  return (
    <div className="animate-fade-up space-y-[18px]">
      <PageHeader
        title="Validation report"
        description="Errors must be fixed in your file. Warnings can be acknowledged and imported past."
      />

      {batch.status === "COMMITTED" ? (
        <div className="rounded-lg border border-[#c3e2d0] bg-ok-bg px-3.5 py-2.5 text-[13px] text-ok">
          This upload has already been imported.{" "}
          <Link href="/data/versions" className="font-medium underline">
            See it in your version history
          </Link>
          .
        </div>
      ) : null}

      <ValidationReport
        batchId={batch.id}
        districtId={districtId}
        datasetLabel={meta.label}
        periodLabel={periodLabel(batch.periodType as PeriodType, batch.period, startMonth)}
        fiscalYear={batch.fiscalYear}
        fileName={batch.fileName}
        rowsParsed={batch.rowsParsed}
        errorCount={batch.errorCount}
        warningCount={batch.warningCount}
        warningsAcked={batch.warningsAckedAt !== null}
        findings={findings.map(
          (f): ReportFinding => ({
            id: f.id,
            severity: f.severity as "ERROR" | "WARNING",
            layer: f.layer,
            rule: f.rule,
            rowNumber: f.rowNumber,
            column: f.column,
            value: f.value,
            message: f.message,
          }),
        )}
        existing={
          dup?.existing
            ? {
                version: dup.existing.version,
                rowCount: dup.existing.rowCount,
                fileName: dup.existing.fileName,
                committedAt: formatDateTime(dup.existing.committedAt),
              }
            : null
        }
        canUpload={userCan(user, "upload_data") && batch.status !== "COMMITTED"}
      />
    </div>
  );
}
