"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import {
  CONFIG_KINDS,
  CONFIG_RESOURCES,
  type ConfigKind,
  type ConfigRow,
} from "@/lib/config/registry";
import { Modal } from "@/components/ui/modal";
import { NewConfigItemForm } from "@/components/config/new-item-form";
import { EditConfigRow } from "@/components/config/edit-config-row";
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<ConfigRow | null>(null);

  const def = CONFIG_RESOURCES[active];
  const rows = lists[active];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  function switchTab(k: ConfigKind) {
    setActive(k);
    setQuery("");
    setEditingId(null);
    setAdding(false);
    setDeleting(null);
  }

  return (
    <div>
      {/* Tab bar — client state, no navigation */}
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
          <div className="relative w-full max-w-lg flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2">
              <Icon name="search" size={16} />
            </span>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${def.title.toLowerCase()}…`}
              autoComplete="off"
              className="h-10 w-full pl-9 pr-9"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-2 transition-colors hover:bg-panel hover:text-ink"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            )}
          </div>

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

        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.length === 0 && (
              <EmptyRow colSpan={3}>
                No {def.title.toLowerCase()}{" "}
                {query ? "match your search." : "yet. Add one above."}
              </EmptyRow>
            )}
            {filtered.map((r) =>
              r.id === editingId ? (
                <EditConfigRow
                  key={r.id}
                  kind={def.kind}
                  row={r}
                  onDone={() => setEditingId(null)}
                />
              ) : (
                <TR key={r.id}>
                  <TD className="font-medium text-ink">{r.name}</TD>
                  <TD>
                    {r.active ? (
                      <Badge tone="green">Active</Badge>
                    ) : (
                      <Badge tone="gray">Inactive</Badge>
                    )}
                  </TD>
                  <TD>
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingId(r.id)}
                      >
                        <Icon name="pencil" size={14} />
                        Edit
                      </Button>
                      <form action={toggleConfigItem}>
                        <input type="hidden" name="kind" value={def.kind} />
                        <input type="hidden" name="id" value={r.id} />
                        <input
                          type="hidden"
                          name="active"
                          value={r.active ? "false" : "true"}
                        />
                        <Button type="submit" variant="ghost" size="sm">
                          <Icon name="power" size={14} />
                          {r.active ? "Deactivate" : "Activate"}
                        </Button>
                      </form>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleting(r)}
                      >
                        <Icon name="trash" size={14} className="text-bad" />
                        Delete
                      </Button>
                    </div>
                  </TD>
                </TR>
              ),
            )}
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
