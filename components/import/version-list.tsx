"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { restoreDatasetVersion } from "@/app/actions/import";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";

export interface VersionRow {
  id: string;
  dataset: string;
  datasetLabel: string;
  fiscalYear: string;
  periodLabel: string;
  version: number;
  isCurrent: boolean;
  action: "INITIAL" | "REPLACED" | "NEW_VERSION";
  rowCount: number;
  warningCount: number;
  fileName: string;
  committedAt: string;
  committedBy: string;
  /** False when a later Replace destroyed this version's rows — it cannot be restored. */
  hasData: boolean;
  restoredFrom: number | null;
}

const ACTION_LABEL: Record<VersionRow["action"], string> = {
  INITIAL: "First import",
  REPLACED: "Replaced",
  NEW_VERSION: "New version",
};

/**
 * The history of one period, newest first.
 *
 * Grouped by period rather than listed flat: "what happened to August" is the question a
 * district actually asks, and a flat list of 60 versions across 12 months answers it only
 * by making them scan.
 */
export function VersionList({
  groups,
  districtId,
  canManage,
}: {
  groups: { key: string; datasetLabel: string; fiscalYear: string; periodLabel: string; versions: VersionRow[] }[];
  districtId: string;
  canManage: boolean;
}) {
  const [restoring, setRestoring] = useState<VersionRow | null>(null);

  if (groups.length === 0) {
    return (
      <Card>
        <div className="py-8 text-center">
          <p className="text-[13.5px] text-muted">No data has been imported yet.</p>
          <p className="mt-1 text-[12.5px] text-muted-2">
            Every upload is kept here, so you can compare periods and roll one back.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <Card key={g.key} className="pb-3">
          <div className="mb-3 flex items-baseline justify-between">
            <div>
              <div className="text-[14.5px] font-semibold">{g.datasetLabel}</div>
              <div className="mt-0.5 text-[12px] text-muted-2">
                {g.fiscalYear} · {g.periodLabel}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Compare needs two, so it only appears when there are two. The newest
                  against the one before it is the comparison people actually want —
                  "what did this re-upload change?" */}
              {g.versions.length > 1 && (
                <Link
                  href={`/data/versions/compare?from=${g.versions[1].id}&to=${g.versions[0].id}`}
                  className="text-[12px] font-medium text-brand hover:underline"
                >
                  Compare v{g.versions[1].version} → v{g.versions[0].version}
                </Link>
              )}
              <span className="text-[11.5px] text-muted-2">
                {g.versions.length} version{g.versions.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          <div className="flex flex-col">
            {g.versions.map((v, i) => (
              <div
                key={v.id}
                className={cn(
                  "flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5",
                  i < g.versions.length - 1 && "border-b border-line-soft",
                )}
              >
                <span className="w-10 font-mono text-[12.5px] font-semibold text-ink">
                  v{v.version}
                </span>

                {v.isCurrent ? (
                  <Badge tone="green">Current</Badge>
                ) : (
                  <Badge tone="gray">{ACTION_LABEL[v.action]}</Badge>
                )}

                <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted">
                  {v.restoredFrom !== null ? (
                    <>Restored from v{v.restoredFrom}</>
                  ) : (
                    v.fileName
                  )}
                  {" · "}
                  {v.rowCount.toLocaleString()} rows
                  {v.warningCount > 0 && ` · ${v.warningCount} warning${v.warningCount === 1 ? "" : "s"}`}
                </span>

                <span className="text-[11.5px] text-muted-2">
                  {v.committedBy} · {v.committedAt}
                </span>

                {canManage && !v.isCurrent && (
                  <Button
                    variant="ghost"
                    onClick={() => setRestoring(v)}
                    // A Replace removed this version's rows; there is nothing left to
                    // restore, and offering the button would be a lie.
                    disabled={!v.hasData}
                    title={v.hasData ? undefined : "A later replace removed this version's data"}
                  >
                    Restore
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}

      {restoring && (
        <Modal open onClose={() => setRestoring(null)} title={`Restore v${restoring.version}?`}>
          <RestoreConfirm
            version={restoring}
            districtId={districtId}
            onDone={() => setRestoring(null)}
          />
        </Modal>
      )}
    </div>
  );
}

function RestoreConfirm({
  version,
  districtId,
  onDone,
}: {
  version: VersionRow;
  districtId: string;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    restoreDatasetVersion,
    EMPTY_FORM_STATE,
  );

  if (state.success) {
    return (
      <div className="space-y-4">
        <Alert tone="success">{state.success}</Alert>
        <div className="flex justify-end">
          <Button onClick={onDone}>Done</Button>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="versionId" value={version.id} />
      <input type="hidden" name="districtId" value={districtId} />

      {state.error && <Alert tone="error">{state.error}</Alert>}

      <p className="text-[13.5px] leading-relaxed text-ink-soft">
        This will make v{version.version} the current version for{" "}
        <strong className="font-semibold text-ink">{version.periodLabel}</strong> again, and the
        dashboards will show its {version.rowCount.toLocaleString()} rows.
      </p>
      <p className="text-[12.5px] leading-relaxed text-muted">
        Nothing is overwritten — the restore is recorded as a new version, so your history keeps
        every step including this one.
      </p>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Restoring…" : `Restore v${version.version}`}
        </Button>
      </div>
    </form>
  );
}
