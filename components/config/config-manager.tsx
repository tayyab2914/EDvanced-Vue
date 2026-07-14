"use client";

import { useMemo, useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import {
  CONFIG_KINDS,
  CONFIG_RESOURCES,
  type ConfigKind,
  type ConfigRow,
} from "@/lib/config/registry";
import { Modal } from "@/components/ui/modal";
import { Menu, MenuItem } from "@/components/ui/menu";
import { NewConfigItemForm } from "@/components/config/new-item-form";
import { EditConfigForm } from "@/components/config/edit-config-form";
import { ConfigImportForm } from "@/components/config/config-import-form";
import { DeleteConfigConfirm } from "@/components/config/delete-confirm";
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
import { Input } from "@/components/ui/input";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { SortTH, useSort } from "@/components/ui/sortable";
import { csvFilename, downloadCsv, toCsv } from "@/lib/csv-export";
import { Icon } from "@/components/icons";
import { toggleConfigItem } from "@/app/actions/config";

export function ConfigManager({
  lists,
}: {
  lists: Record<ConfigKind, ConfigRow[]>;
}) {
  const [active, setActive] = useState<ConfigKind>("fund-types");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<ConfigRow | null>(null);
  const [viewing, setViewing] = useState<ConfigRow | null>(null);
  const [deleting, setDeleting] = useState<ConfigRow | null>(null);
  const [, startTransition] = useTransition();

  const def = CONFIG_RESOURCES[active];
  const rows = lists[active];
  const categoryField = def.categoryField;
  const categoryLabel = (value?: string | null) =>
    categoryField?.options.find((o) => o.value === value)?.label ?? "—";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? rows.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            (r.code ?? "").toLowerCase().includes(q),
        )
      : rows;
  }, [rows, query]);

  const { sorted, sort, toggle } = useSort<ConfigRow>(filtered, (r, key) => {
    switch (key) {
      case "code":
        return r.code;
      case "name":
        return r.name;
      case "category":
        return r.category ? categoryLabel(r.category) : null;
      case "status":
        return r.active ? "Active" : "Inactive";
      default:
        return null;
    }
  });

  // Sort first, then paginate, so the order runs across the whole list — not just this page.
  const pg = usePagination(sorted);

  /**
   * Exports the list you're looking at, in the shape the importer reads back: Code, Name and
   * (for Cost Center Types) the Category LABEL it resolves by. Status rides along for
   * information — the importer ignores unknown columns, so it round-trips cleanly.
   */
  function exportCsv() {
    const headers = [
      "Code",
      "Name",
      ...(categoryField ? [categoryField.label] : []),
      "Status",
    ];
    const body = sorted.map((r) => [
      r.code ?? "",
      r.name,
      ...(categoryField ? [r.category ? categoryLabel(r.category) : ""] : []),
      r.active ? "Active" : "Inactive",
    ]);
    downloadCsv(csvFilename(def.title), toCsv(headers, body));
  }

  function switchTab(k: ConfigKind) {
    setActive(k);
    setQuery("");
    setAdding(false);
    setImporting(false);
    setEditing(null);
    setViewing(null);
    setDeleting(null);
    pg.reset();
  }

  function toggleRow(r: ConfigRow) {
    const fd = new FormData();
    fd.set("kind", def.kind);
    fd.set("id", r.id);
    fd.set("active", r.active ? "false" : "true");
    startTransition(async () => {
      await toggleConfigItem(fd);
    });
  }

  return (
    <div>
      <div className="border-b border-line">
        <div className="-mb-px flex gap-1 overflow-x-auto">
          {CONFIG_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => switchTab(k)}
              aria-current={k === active ? "page" : undefined}
              className={cn(
                "whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors",
                k === active
                  ? "border-brand text-brand"
                  : "border-transparent text-muted-2 hover:border-line hover:text-ink-soft",
              )}
            >
              {CONFIG_RESOURCES[k].title}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6 mt-6">
        <h1 className="text-[19px] font-semibold tracking-[-0.01em] text-ink">
          {def.title}
        </h1>
        <p className="mt-1 text-[13px] text-muted-2">{def.description}</p>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-sm sm:w-80">
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

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={exportCsv}
              disabled={sorted.length === 0}
              title={
                sorted.length === 0
                  ? "Nothing to export"
                  : `Export ${sorted.length} row${sorted.length === 1 ? "" : "s"} as CSV`
              }
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
                <path d="M12 3v12" />
                <path d="m7 10 5 5 5-5" />
                <path d="M5 21h14" />
              </svg>
              Export
            </Button>
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
        </div>

        <Table>
          <THead>
            <TR>
              <SortTH sortKey="code" sort={sort} onSort={toggle}>
                Code
              </SortTH>
              <SortTH sortKey="name" sort={sort} onSort={toggle}>
                Name
              </SortTH>
              {categoryField && (
                <SortTH sortKey="category" sort={sort} onSort={toggle}>
                  {categoryField.label}
                </SortTH>
              )}
              <SortTH sortKey="status" sort={sort} onSort={toggle}>
                Status
              </SortTH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {sorted.length === 0 && (
              <EmptyRow colSpan={categoryField ? 5 : 4}>
                No {def.title.toLowerCase()}{" "}
                {query ? "match your search." : "yet. Add one above."}
              </EmptyRow>
            )}
            {pg.pageItems.map((r) => (
              <TR key={r.id}>
                <TD className="font-medium">
                  <button
                    type="button"
                    onClick={() => setViewing(r)}
                    className="text-left text-ink transition-colors hover:text-brand hover:underline"
                  >
                    {r.code || "—"}
                  </button>
                </TD>
                <TD className="text-ink">{r.name}</TD>
                {categoryField && (
                  <TD className="text-ink-soft">{categoryLabel(r.category)}</TD>
                )}
                <TD>
                  {r.active ? (
                    <Badge tone="green">Active</Badge>
                  ) : (
                    <Badge tone="gray">Inactive</Badge>
                  )}
                </TD>
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
              </TR>
            ))}
          </TBody>
        </Table>

        <Pagination
          page={pg.page}
          pageCount={pg.pageCount}
          pageSize={pg.pageSize}
          onPageSize={pg.setPageSize}
          total={pg.total}
          from={pg.from}
          to={pg.to}
          onPage={pg.setPage}
          noun={def.title.toLowerCase()}
        />
      </div>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title={`New ${def.singular}`}
      >
        <NewConfigItemForm
          kind={def.kind}
          singular={def.singular}
          onDone={() => setAdding(false)}
        />
      </Modal>

      <Modal
        open={importing}
        onClose={() => setImporting(false)}
        title={`Import ${def.title.toLowerCase()}`}
      >
        <ConfigImportForm
          kind={def.kind}
          title={def.title}
          onDone={() => setImporting(false)}
        />
      </Modal>

      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={`Edit ${def.singular.toLowerCase()}`}
        >
          <EditConfigForm
            kind={def.kind}
            singular={def.singular}
            row={editing}
            onDone={() => setEditing(null)}
          />
        </Modal>
      )}

      {viewing && (
        <Modal open onClose={() => setViewing(null)} title={viewing.name}>
          <dl className="space-y-2.5">
            <div className="flex justify-between gap-6">
              <dt className="text-[13px] text-muted-2">Code</dt>
              <dd className="text-right text-[13px] font-medium text-ink">
                {viewing.code || "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-6">
              <dt className="text-[13px] text-muted-2">{def.singular} name</dt>
              <dd className="text-right text-[13px] font-medium text-ink">
                {viewing.name}
              </dd>
            </div>
            {categoryField && (
              <div className="flex justify-between gap-6">
                <dt className="text-[13px] text-muted-2">
                  {categoryField.label}
                </dt>
                <dd className="text-right text-[13px] font-medium text-ink">
                  {categoryLabel(viewing.category)}
                </dd>
              </div>
            )}
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

      {deleting && (
        <Modal
          open
          onClose={() => setDeleting(null)}
          title={`Delete ${def.singular.toLowerCase()}?`}
        >
          <DeleteConfigConfirm
            kind={def.kind}
            row={deleting}
            onDone={() => setDeleting(null)}
          />
        </Modal>
      )}
    </div>
  );
}
