"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import {
  acknowledgeWarnings,
  cancelImport,
  commitImport,
} from "@/app/actions/import";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms";
import { DUPLICATE_PROMPT } from "@/lib/import/duplicate";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePagination, Pagination } from "@/components/ui/pagination";
import { cn } from "@/lib/cn";

export interface ReportFinding {
  id: string;
  severity: "ERROR" | "WARNING";
  layer: string;
  rule: string;
  rowNumber: number | null;
  column: string | null;
  value: string | null;
  message: string;
}

export interface ExistingSummary {
  version: number;
  rowCount: number;
  fileName: string;
  committedAt: string;
}

/**
 * Steps 3-6 on one screen: read the findings, fix or acknowledge, then decide what to do
 * about a period that already has data.
 *
 * The district's whole question is "can I import this, and if not, what do I fix?" — so
 * errors come first, warnings second, and the action is at the bottom where they land
 * after reading.
 */
export function ValidationReport({
  batchId,
  districtId,
  datasetLabel,
  periodLabel,
  fiscalYear,
  fileName,
  rowsParsed,
  errorCount,
  warningCount,
  warningsAcked,
  findings,
  existing,
  canUpload,
}: {
  batchId: string;
  districtId: string;
  datasetLabel: string;
  periodLabel: string;
  fiscalYear: string;
  fileName: string;
  rowsParsed: number;
  errorCount: number;
  warningCount: number;
  warningsAcked: boolean;
  findings: ReportFinding[];
  existing: ExistingSummary | null;
  canUpload: boolean;
}) {
  const router = useRouter();
  const [ackState, ackAction, acking] = useActionState<FormState, FormData>(
    acknowledgeWarnings,
    EMPTY_FORM_STATE,
  );
  const [commitState, commitAction, committing] = useActionState<FormState, FormData>(
    commitImport,
    EMPTY_FORM_STATE,
  );
  const [cancelState, cancelAction, cancelling] = useActionState<FormState, FormData>(
    cancelImport,
    EMPTY_FORM_STATE,
  );
  const [choice, setChoice] = useState<"REPLACED" | "NEW_VERSION">("REPLACED");

  const errors = findings.filter((f) => f.severity === "ERROR");
  const warnings = findings.filter((f) => f.severity === "WARNING");

  const clean = errorCount === 0;
  const acked = warningsAcked || warningCount === 0;
  const ready = clean && acked;

  if (commitState.success) {
    return (
      <Card>
        <Alert tone="success">{commitState.success}</Alert>
        <div className="mt-4 flex gap-2">
          <Button onClick={() => router.push("/data/versions")}>View version history</Button>
          <Button variant="secondary" onClick={() => router.push("/data/upload")}>
            Upload another
          </Button>
        </div>
      </Card>
    );
  }
  if (cancelState.success) {
    return (
      <Card>
        <Alert tone="info">{cancelState.success}</Alert>
        <div className="mt-4">
          <Button onClick={() => router.push("/data/upload")}>Upload a different file</Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* What was read */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[15px] font-semibold">{datasetLabel}</div>
            <div className="mt-0.5 text-[12.5px] text-muted-2">
              {fiscalYear} · {periodLabel} · {fileName}
            </div>
          </div>
          <div className="flex gap-2">
            <Badge tone={clean ? "green" : "red"}>
              {errorCount} error{errorCount === 1 ? "" : "s"}
            </Badge>
            <Badge tone={warningCount > 0 ? "amber" : "gray"}>
              {warningCount} warning{warningCount === 1 ? "" : "s"}
            </Badge>
            <Badge tone="gray">{rowsParsed} rows</Badge>
          </div>
        </div>

        <div className="mt-4">
          {clean ? (
            <Alert tone="success">
              Every row checks out against your master data and the approved lists.
            </Alert>
          ) : (
            <Alert tone="error">
              This file can&rsquo;t be imported until the errors below are fixed. Correct them in
              your file and upload it again — nothing has been changed.
            </Alert>
          )}
        </div>
      </Card>

      {errors.length > 0 && (
        <FindingTable title="Errors — these must be fixed" tone="bad" findings={errors} />
      )}

      {warnings.length > 0 && (
        <FindingTable
          title="Warnings — review, then acknowledge to continue"
          tone="warn"
          findings={warnings}
        />
      )}

      {/* Acknowledge */}
      {clean && warningCount > 0 && !warningsAcked && canUpload && (
        <Card>
          <p className="text-[13.5px] text-ink-soft">
            These {warningCount === 1 ? "is a condition" : "are conditions"} worth knowing about,
            not {warningCount === 1 ? "an error" : "errors"}. Over-collection and spend above
            budget are real states a district can be in.
          </p>
          {ackState.error && (
            <div className="mt-3">
              <Alert tone="error">{ackState.error}</Alert>
            </div>
          )}
          <form action={ackAction} className="mt-3">
            <input type="hidden" name="batchId" value={batchId} />
            <input type="hidden" name="districtId" value={districtId} />
            <Button type="submit" variant="secondary" disabled={acking}>
              {acking ? "Acknowledging…" : `Acknowledge ${warningCount} warning${warningCount === 1 ? "" : "s"}`}
            </Button>
          </form>
        </Card>
      )}

      {/* The duplicate prompt, and the import */}
      {ready && canUpload && (
        <Card>
          {existing ? (
            <>
              {/* The client's own sentence, from Spec §5.8. Not paraphrased. */}
              <p className="text-[13.5px] font-medium text-ink">{DUPLICATE_PROMPT}</p>
              <p className="mt-1.5 text-[12.5px] text-muted-2">
                v{existing.version} was imported from {existing.fileName} on{" "}
                {existing.committedAt} and holds {existing.rowCount} rows.
              </p>

              <div className="mt-4 space-y-2">
                <Choice
                  checked={choice === "REPLACED"}
                  onSelect={() => setChoice("REPLACED")}
                  title="Replace the existing data"
                  detail={`Supersedes v${existing.version}. Its rows are removed, but the version stays in your history — nothing is permanently lost.`}
                />
                <Choice
                  checked={choice === "NEW_VERSION"}
                  onSelect={() => setChoice("NEW_VERSION")}
                  title="Keep it as a new version"
                  detail={`v${existing.version} is retained in full. This file becomes the current version, and you can compare or restore either.`}
                />
              </div>
            </>
          ) : (
            <p className="text-[13.5px] text-ink-soft">
              This is the first data for {periodLabel}. Importing it will make it the current
              version.
            </p>
          )}

          {commitState.error && (
            <div className="mt-4">
              <Alert tone="error">{commitState.error}</Alert>
            </div>
          )}
          {cancelState.error && (
            <div className="mt-4">
              <Alert tone="error">{cancelState.error}</Alert>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <form action={commitAction}>
              <input type="hidden" name="batchId" value={batchId} />
              <input type="hidden" name="districtId" value={districtId} />
              <input type="hidden" name="action" value={existing ? choice : "INITIAL"} />
              <Button type="submit" disabled={committing || cancelling}>
                {committing ? "Importing…" : existing && choice === "REPLACED" ? "Replace" : "Import"}
              </Button>
            </form>
            <form action={cancelAction}>
              <input type="hidden" name="batchId" value={batchId} />
              <input type="hidden" name="districtId" value={districtId} />
              <Button type="submit" variant="secondary" disabled={committing || cancelling}>
                {cancelling ? "Cancelling…" : "Cancel the upload"}
              </Button>
            </form>
          </div>
        </Card>
      )}

      {!canUpload && (
        <Card>
          <p className="text-[13.5px] text-muted">
            You have read-only access, so you can review this report but not import it.
          </p>
        </Card>
      )}
    </div>
  );
}

function Choice({
  checked,
  onSelect,
  title,
  detail,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors",
        checked ? "border-brand bg-[#f2f7ff]" : "border-line hover:border-[#c8d3e4]",
      )}
    >
      <input
        type="radio"
        name="duplicate-choice"
        checked={checked}
        onChange={onSelect}
        className="mt-0.5"
      />
      <span>
        <span className="block text-[13px] font-medium text-ink">{title}</span>
        <span className="mt-0.5 block text-[12px] leading-relaxed text-muted">{detail}</span>
      </span>
    </label>
  );
}

/** Findings paginate: a broken 40,000-row file can produce thousands. */
function FindingTable({
  title,
  tone,
  findings,
}: {
  title: string;
  tone: "bad" | "warn";
  findings: ReportFinding[];
}) {
  const pg = usePagination(findings);

  return (
    <Card className="pb-2">
      <div className="mb-3 flex items-center gap-2">
        <span
          className={cn("h-2 w-2 rounded-full", tone === "bad" ? "bg-bad" : "bg-warn")}
          aria-hidden
        />
        <h2 className="text-[14.5px] font-semibold">{title}</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-wider text-muted">
              <th className="w-16 py-2 pr-3 font-semibold">Row</th>
              <th className="w-40 py-2 pr-3 font-semibold">Column</th>
              <th className="w-28 py-2 pr-3 font-semibold">Value</th>
              <th className="py-2 font-semibold">What&rsquo;s wrong</th>
            </tr>
          </thead>
          <tbody>
            {pg.pageItems.map((f) => (
              <tr key={f.id} className="border-b border-line-soft align-top">
                <td className="py-2 pr-3 font-mono text-muted">{f.rowNumber ?? "—"}</td>
                <td className="py-2 pr-3 text-ink-soft">{f.column ?? "—"}</td>
                <td className="py-2 pr-3 font-mono text-muted-2">
                  {f.value ? `"${f.value}"` : "—"}
                </td>
                <td className="py-2 text-ink-soft">{f.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        page={pg.page}
        pageCount={pg.pageCount}
        pageSize={pg.pageSize}
        onPageSize={pg.setPageSize}
        total={pg.total}
        from={pg.from}
        to={pg.to}
        onPage={pg.setPage}
        noun="findings"
      />
    </Card>
  );
}
