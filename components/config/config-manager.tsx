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

  function switchTab(k: ConfigKind) {
    setActive(k);
    setQuery("");
    setAdding(false);
    setImporting(false);
    setEditing(null);
    setViewing(null);
    setDeleting(null);
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
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${def.title.toLowerCase()}…`}
              autoComplete="off"
              className="h-9 w-full pl-9"
            />
          </div>

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
        </div>

        <Table>
          <THead>
            <TR>
              <TH>Code</TH>
              <TH>Name</TH>
              <TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.length === 0 && (
              <EmptyRow colSpan={4}>
                No {def.title.toLowerCase()}{" "}
                {query ? "match your search." : "yet. Add one above."}
              </EmptyRow>
            )}
            {filtered.map((r) => (
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
