"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  EmptyRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/ui/modal";
import { Menu, MenuItem } from "@/components/ui/menu";
import {
  MasterItemForm,
  type MasterRow,
  type Option,
} from "@/components/master-data/master-item-form";
import { MasterDeleteConfirm } from "@/components/master-data/master-delete-confirm";
import { MasterImportForm } from "@/components/master-data/master-import-form";
import { toggleMasterItem } from "@/app/actions/master-data";
import type { ClientResourceDef, FieldDef } from "@/lib/master-data/registry";

type StatusFilter = "all" | "active" | "inactive";

export function MasterDataManager({
  def,
  districtId,
  rows,
  options,
  optionsByParent,
  relLabels,
  canManage,
}: {
  def: ClientResourceDef;
  districtId: string;
  rows: MasterRow[];
  options: Record<string, Option[]>;
  optionsByParent: Record<string, Record<string, Option[]>>;
  relLabels: Record<string, Map<string, string>>;
  canManage: boolean;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [selectFilters, setSelectFilters] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<MasterRow | null>(null);
  const [deleting, setDeleting] = useState<MasterRow | null>(null);
  const [viewing, setViewing] = useState<MasterRow | null>(null);
  const [, startTransition] = useTransition();

  const textFields = def.fields.filter(
    (f) => f.type === "text" || f.type === "textarea",
  );
  const selectFields = def.fields.filter(
    (f) => f.type === "select" || f.type === "radio",
  );
  const columnFields = def.columns
    .map((name) => def.fields.find((f) => f.name === name))
    .filter((f): f is FieldDef => !!f);
  const fieldOptions = (f: FieldDef) =>
    f.staticOptions ?? options[f.optionsKey ?? ""] ?? [];

  const cell = (row: MasterRow, f: FieldDef): string => {
    const raw = row[f.name];
    if (raw == null || raw === "") return "—";
    if (f.numeric) {
      const n = Number(raw);
      return isNaN(n)
        ? String(raw)
        : n.toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 0,
          });
    }
    if (f.staticOptions)
      return f.staticOptions.find((o) => o.value === String(raw))?.label ?? String(raw);
    if (relLabels[f.name]) return relLabels[f.name].get(String(raw)) ?? "—";
    return String(raw);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (status === "active" && !r.active) return false;
      if (status === "inactive" && r.active) return false;
      for (const f of selectFields) {
        const want = selectFilters[f.name];
        if (want && String(r[f.name] ?? "") !== want) return false;
      }
      if (q) {
        const hay = textFields
          .map((f) => String(r[f.name] ?? ""))
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, query, status, selectFilters, selectFields, textFields]);

  const pg = usePagination(filtered);

  const activeFilters =
    (status !== "all" ? 1 : 0) +
    selectFields.filter((f) => selectFilters[f.name]).length;
  const clearFilters = () => {
    setStatus("all");
    setSelectFilters({});
    pg.reset();
  };

  function toggleRow(r: MasterRow) {
    const fd = new FormData();
    fd.set("kind", def.kind);
    fd.set("districtId", districtId);
    fd.set("id", r.id);
    fd.set("active", r.active ? "false" : "true");
    startTransition(async () => {
      await toggleMasterItem(fd);
    });
  }

  const colCount = columnFields.length + 1 + (canManage ? 1 : 0);

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
              onChange={(e) => {
                setQuery(e.target.value);
                pg.reset();
              }}
              placeholder={`Search ${def.title.toLowerCase()}…`}
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
                  <span className="text-[12px] font-medium text-ink-soft">Status</span>
                  <Select
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value as StatusFilter);
                      pg.reset();
                    }}
                    className="h-9"
                  >
                    <option value="all">All statuses</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </Select>
                </label>

                {selectFields.map((f) => (
                  <label key={f.name} className="block space-y-1">
                    <span className="text-[12px] font-medium text-ink-soft">
                      {f.label}
                    </span>
                    <Select
                      value={selectFilters[f.name] ?? ""}
                      onChange={(e) => {
                        setSelectFilters((prev) => ({
                          ...prev,
                          [f.name]: e.target.value,
                        }));
                        pg.reset();
                      }}
                      className="h-9"
                    >
                      <option value="">All {f.label.toLowerCase()}</option>
                      {fieldOptions(f).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </label>
                ))}
              </div>
            )}
          </Menu>
        </div>

        {canManage && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setImporting(true)}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 15V3" />
                <path d="m7 8 5-5 5 5" />
                <path d="M5 21h14" />
              </svg>
              Import
            </Button>
            <Button type="button" onClick={() => setAdding(true)}>
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
              New {def.singular}
            </Button>
          </div>
        )}
      </div>

      <Table>
        <THead>
          <TR>
            {columnFields.map((f) => (
              <TH key={f.name}>{f.label}</TH>
            ))}
            <TH>Status</TH>
            {canManage && <TH className="text-right">Actions</TH>}
          </TR>
        </THead>
        <TBody>
          {filtered.length === 0 && (
            <EmptyRow colSpan={colCount}>
              {rows.length === 0
                ? `No ${def.title.toLowerCase()} yet${canManage ? ". Add one above." : "."}`
                : "No matches for these filters."}
            </EmptyRow>
          )}
          {pg.pageItems.map((r) => (
            <TR key={r.id}>
              {columnFields.map((f, i) =>
                i === 0 ? (
                  <TD key={f.name} className="font-medium">
                    <button
                      type="button"
                      onClick={() => setViewing(r)}
                      className="text-left text-ink transition-colors hover:text-brand hover:underline"
                    >
                      {cell(r, f)}
                    </button>
                  </TD>
                ) : (
                  <TD key={f.name}>{cell(r, f)}</TD>
                ),
              )}
              <TD>
                {r.active ? (
                  <Badge tone="green">Active</Badge>
                ) : (
                  <Badge tone="gray">Inactive</Badge>
                )}
              </TD>
              {canManage && (
                <TD>
                  <div className="flex justify-end">
                    <Menu
                      align="right"
                      triggerLabel="Row actions"
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
                        <div className="min-w-[168px] py-1">
                          <MenuItem
                            icon={<Icon name="eye" size={15} />}
                            onClick={() => {
                              setViewing(r);
                              close();
                            }}
                          >
                            View
                          </MenuItem>
                          <MenuItem
                            icon={<Icon name="pencil" size={15} />}
                            onClick={() => {
                              setEditing(r);
                              close();
                            }}
                          >
                            Edit
                          </MenuItem>
                          <MenuItem
                            icon={<Icon name="power" size={15} />}
                            onClick={() => {
                              toggleRow(r);
                              close();
                            }}
                          >
                            {r.active ? "Deactivate" : "Activate"}
                          </MenuItem>
                          <MenuItem
                            icon={<Icon name="trash" size={15} />}
                            danger
                            onClick={() => {
                              setDeleting(r);
                              close();
                            }}
                          >
                            Delete
                          </MenuItem>
                        </div>
                      )}
                    </Menu>
                  </div>
                </TD>
              )}
            </TR>
          ))}
        </TBody>
      </Table>

      <Pagination
        page={pg.page}
        pageCount={pg.pageCount}
        total={pg.total}
        from={pg.from}
        to={pg.to}
        onPage={pg.setPage}
        noun={def.title.toLowerCase()}
      />

      {canManage && (
        <Modal
          open={adding}
          onClose={() => setAdding(false)}
          title={`New ${def.singular}`}
        >
          <MasterItemForm
            def={def}
            districtId={districtId}
            options={options}
            optionsByParent={optionsByParent}
            onDone={() => setAdding(false)}
          />
        </Modal>
      )}

      {canManage && (
        <Modal
          open={importing}
          onClose={() => setImporting(false)}
          title={`Import ${def.title.toLowerCase()}`}
        >
          <MasterImportForm
            def={def}
            districtId={districtId}
            onDone={() => setImporting(false)}
          />
        </Modal>
      )}

      {canManage && editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={`Edit ${def.singular.toLowerCase()}`}
        >
          <MasterItemForm
            def={def}
            districtId={districtId}
            options={options}
            optionsByParent={optionsByParent}
            row={editing}
            onDone={() => setEditing(null)}
          />
        </Modal>
      )}

      {canManage && deleting && (
        <Modal
          open
          onClose={() => setDeleting(null)}
          title={`Delete ${def.singular.toLowerCase()}?`}
        >
          <MasterDeleteConfirm
            def={def}
            districtId={districtId}
            row={deleting}
            label={String(deleting.name ?? "this item")}
            onCancel={() => setDeleting(null)}
          />
        </Modal>
      )}

      {viewing && (
        <Modal
          open
          onClose={() => setViewing(null)}
          title={String(viewing.name ?? def.singular)}
        >
          <dl className="space-y-2.5">
            {def.fields.map((f) => (
              <div key={f.name} className="flex justify-between gap-6">
                <dt className="text-[13px] text-muted-2">{f.label}</dt>
                <dd className="text-right text-[13px] font-medium text-ink">
                  {cell(viewing, f)}
                </dd>
              </div>
            ))}
            <div className="flex justify-between gap-6 border-t border-line-soft pt-2.5">
              <dt className="text-[13px] text-muted-2">Status</dt>
              <dd>
                {viewing.active ? (
                  <Badge tone="green">Active</Badge>
                ) : (
                  <Badge tone="gray">Inactive</Badge>
                )}
              </dd>
            </div>
          </dl>
        </Modal>
      )}
    </div>
  );
}
