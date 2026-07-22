"use client";

import { Fragment, useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { restoreDatasetVersion } from "@/app/actions/import";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Input, Select } from "@/components/ui/input";
import { Icon } from "@/components/icons";
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { csvFilename, downloadCsv, toCsv } from "@/lib/csv-export";

export interface VersionLogRow {
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
  committedAtMs: number;
  committedBy: string;
  /** False when a later Replace destroyed this version's rows — it cannot be restored. */
  hasData: boolean;
  restoredFrom: number | null;
  /** The version immediately before this one for the same dataset + period, if any. */
  compareToId: string | null;
  compareToVersion: number | null;
}

const ACTION_LABEL: Record<VersionLogRow["action"], string> = {
  INITIAL: "First import",
  REPLACED: "Replaced",
  NEW_VERSION: "New version",
};

function statusLabel(v: VersionLogRow): string {
  return v.isCurrent ? "Current" : ACTION_LABEL[v.action];
}

/** How many table columns a group-header row must span. */
const COLS = 6;

/**
 * The full upload history, grouped by dataset — every dataset gets its own labelled section
 * (Cash Position, Revenue Budget, …) with its versions beneath it, so a district reads one
 * dataset at a time instead of scanning a single mixed list. Rendered as one aligned table
 * with a header row per group, so the columns still line up across sections.
 *
 * Search, the dataset/year filters, and Export CSV are the audit-log toolbar the district
 * already knows; Compare and Restore are per-row actions. Everything is computed client-side
 * over the rows the server already sent — no round-trips.
 */
export function VersionLog({
  rows,
  districtId,
  canManage,
}: {
  rows: VersionLogRow[];
  districtId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [restoring, setRestoring] = useState<VersionLogRow | null>(null);
  const [query, setQuery] = useState("");
  const [dataset, setDataset] = useState("");
  const [fiscalYear, setFiscalYear] = useState("");

  const datasetOptions = useMemo(
    () =>
      [...new Map(rows.map((r) => [r.dataset, r.datasetLabel]))]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [rows],
  );
  const fiscalYearOptions = useMemo(
    () => [...new Set(rows.map((r) => r.fiscalYear))].sort().reverse(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (dataset && r.dataset !== dataset) return false;
      if (fiscalYear && r.fiscalYear !== fiscalYear) return false;
      if (!q) return true;
      return (
        r.datasetLabel.toLowerCase().includes(q) ||
        r.fileName.toLowerCase().includes(q) ||
        r.periodLabel.toLowerCase().includes(q) ||
        r.committedBy.toLowerCase().includes(q)
      );
    });
  }, [rows, query, dataset, fiscalYear]);

  // One group per dataset. Rows keep the order the server sent (fiscal year, then period, then
  // version — all newest-first), so each dataset reads as its own history. Groups are ordered
  // by their most-recent upload, so the dataset a district touched last sits at the top.
  const groups = useMemo(() => {
    const map = new Map<
      string,
      { dataset: string; datasetLabel: string; rows: VersionLogRow[]; latest: number }
    >();
    for (const r of filtered) {
      const g = map.get(r.dataset);
      if (g) {
        g.rows.push(r);
        g.latest = Math.max(g.latest, r.committedAtMs);
      } else {
        map.set(r.dataset, {
          dataset: r.dataset,
          datasetLabel: r.datasetLabel,
          rows: [r],
          latest: r.committedAtMs,
        });
      }
    }
    return [...map.values()].sort((a, b) => b.latest - a.latest);
  }, [filtered]);

  const activeFilters = (dataset ? 1 : 0) + (fiscalYear ? 1 : 0);

  function clearFilters() {
    setDataset("");
    setFiscalYear("");
  }

  /** Exports the history you're looking at — filtered, and in the same dataset order as on screen. */
  function exportCsv() {
    const headers = [
      "Dataset",
      "Fiscal Year",
      "Period",
      "Version",
      "Status",
      "Rows",
      "Warnings",
      "Source",
      "Committed By",
      "Committed At",
    ];
    const body = groups.flatMap((g) =>
      g.rows.map((r) => [
        r.datasetLabel,
        r.fiscalYear,
        r.periodLabel,
        `v${r.version}`,
        statusLabel(r),
        r.rowCount,
        r.warningCount,
        r.restoredFrom !== null ? `Restored from v${r.restoredFrom}` : r.fileName,
        r.committedBy,
        r.committedAt,
      ]),
    );
    downloadCsv(csvFilename("Version history"), toCsv(headers, body));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs sm:w-72">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2">
              <Icon name="search" size={16} />
            </span>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search dataset, file, period, or person…"
              autoComplete="off"
              className="h-9 w-full pl-9"
            />
          </div>

          <Menu
            align="left"
            triggerLabel="Filters"
            triggerClassName="flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-3 text-[13px] font-medium text-ink-soft transition-colors hover:bg-panel"
            trigger={
              <>
                <Icon name="filter" size={15} />
                Filters
                {activeFilters > 0 && (
                  <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[10.5px] font-semibold text-white">
                    {activeFilters}
                  </span>
                )}
              </>
            }
          >
            {() => (
              <div className="w-64 space-y-3 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-2">
                    Filters
                  </span>
                  {activeFilters > 0 && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="text-[12px] font-medium text-brand hover:text-brand-dark"
                    >
                      Clear all
                    </button>
                  )}
                </div>

                <label className="block space-y-1">
                  <span className="text-[12px] font-medium text-ink-soft">Dataset</span>
                  <Select
                    value={dataset}
                    onChange={(e) => setDataset(e.target.value)}
                    className="h-9"
                  >
                    <option value="">All datasets</option>
                    {datasetOptions.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </Select>
                </label>

                <label className="block space-y-1">
                  <span className="text-[12px] font-medium text-ink-soft">Fiscal year</span>
                  <Select
                    value={fiscalYear}
                    onChange={(e) => setFiscalYear(e.target.value)}
                    className="h-9"
                  >
                    <option value="">All years</option>
                    {fiscalYearOptions.map((fy) => (
                      <option key={fy} value={fy}>
                        {fy}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
            )}
          </Menu>
        </div>

        <Button
          type="button"
          variant="secondary"
          onClick={exportCsv}
          disabled={filtered.length === 0}
          title={
            filtered.length === 0
              ? "Nothing to export"
              : `Export ${filtered.length} row${filtered.length === 1 ? "" : "s"} as CSV`
          }
        >
          <Icon name="upload" size={15} className="rotate-180" />
          Export CSV
        </Button>
      </div>

      <Table>
        <THead>
          <TR>
            <TH>Period</TH>
            <TH>Version</TH>
            <TH className="text-right">Rows</TH>
            <TH>Source</TH>
            <TH>Committed</TH>
            <TH className="text-right">Actions</TH>
          </TR>
        </THead>
        <TBody>
          {filtered.length === 0 && (
            <EmptyRow colSpan={COLS}>
              {rows.length === 0
                ? "No data has been imported yet."
                : "No versions match your search."}
            </EmptyRow>
          )}
          {groups.map((g) => (
            <Fragment key={g.dataset}>
              <tr>
                <td colSpan={COLS} className="border-t border-line bg-panel px-5 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] font-semibold text-ink">
                      {g.datasetLabel}
                    </span>
                    <span className="text-[11.5px] text-muted-2">
                      {g.rows.length} version{g.rows.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </td>
              </tr>
              {g.rows.map((r) => {
                const canRestore = canManage && !r.isCurrent && r.hasData;
                const canCompare = r.compareToId !== null;
                return (
                  <TR key={r.id}>
                    <TD className="whitespace-nowrap text-ink-soft">
                      {r.fiscalYear} · {r.periodLabel}
                    </TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[12.5px] font-semibold text-ink">
                          v{r.version}
                        </span>
                        {r.isCurrent ? (
                          <Badge tone="green">Current</Badge>
                        ) : (
                          <Badge tone="gray">{ACTION_LABEL[r.action]}</Badge>
                        )}
                      </div>
                    </TD>
                    <TD className="text-right tabular-nums text-ink-soft">
                      {r.rowCount.toLocaleString()}
                      {r.warningCount > 0 && (
                        <span className="ml-1.5 text-[11.5px] text-warn">
                          {r.warningCount} warning{r.warningCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </TD>
                    <TD className="max-w-[220px] truncate text-muted" title={r.fileName}>
                      {r.restoredFrom !== null ? (
                        <span className="text-ink-soft">Restored from v{r.restoredFrom}</span>
                      ) : (
                        r.fileName
                      )}
                    </TD>
                    <TD className="whitespace-nowrap">
                      <div className="text-ink-soft">{r.committedBy}</div>
                      <div className="text-[11.5px] text-muted-2">{r.committedAt}</div>
                    </TD>
                    <TD>
                      <div className="flex justify-end">
                        {canCompare || canRestore ? (
                          <Menu
                            align="right"
                            triggerLabel="Version actions"
                            triggerClassName="flex h-8 w-8 items-center justify-center rounded-lg text-muted-2 transition-colors hover:bg-line-soft hover:text-ink"
                            trigger={
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <circle cx="12" cy="5" r="1.6" />
                                <circle cx="12" cy="12" r="1.6" />
                                <circle cx="12" cy="19" r="1.6" />
                              </svg>
                            }
                          >
                            {(close) => (
                              <div className="min-w-[184px] py-1">
                                {canCompare && (
                                  <MenuItem
                                    icon={<Icon name="reports" size={15} />}
                                    onClick={() => {
                                      close();
                                      router.push(
                                        `/data/versions/compare?from=${r.compareToId}&to=${r.id}`,
                                      );
                                    }}
                                  >
                                    Compare with v{r.compareToVersion}
                                  </MenuItem>
                                )}
                                {canRestore && (
                                  <MenuItem
                                    icon={<Icon name="power" size={15} />}
                                    onClick={() => {
                                      setRestoring(r);
                                      close();
                                    }}
                                  >
                                    Restore this version
                                  </MenuItem>
                                )}
                              </div>
                            )}
                          </Menu>
                        ) : (
                          <span
                            className="pr-1 text-muted-2"
                            title="Only version of this period — nothing to compare or restore yet"
                          >
                            —
                          </span>
                        )}
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </Fragment>
          ))}
        </TBody>
      </Table>

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
  version: VersionLogRow;
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
