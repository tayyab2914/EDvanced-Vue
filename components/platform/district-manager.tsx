"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { Icon } from "@/components/icons";
import { Modal } from "@/components/ui/modal";
import { Menu, MenuItem } from "@/components/ui/menu";
import { CreateDistrictForm } from "@/app/(platform)/platform/districts/create-district-form";
import { setDistrictStatus } from "@/app/actions/districts";
import { US_STATES } from "@/lib/us-states";

export interface DistrictRow {
  id: string;
  name: string;
  code: string;
  state: string;
  status: string;
  users: number;
}

type StatusFilter = "all" | "active" | "inactive";

const STATE_NAME = new Map(US_STATES.map((s) => [s.code, s.name]));

export function DistrictManager({ districts }: { districts: DistrictRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [stateFilter, setStateFilter] = useState("");
  const [adding, setAdding] = useState(false);
  const [, startTransition] = useTransition();

  const statesPresent = [...new Set(districts.map((d) => d.state))].sort();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return districts.filter((d) => {
      if (status === "active" && d.status !== "ACTIVE") return false;
      if (status === "inactive" && d.status === "ACTIVE") return false;
      if (stateFilter && d.state !== stateFilter) return false;
      if (q && !`${d.name} ${d.code}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [districts, query, status, stateFilter]);

  const activeFilters = (status !== "all" ? 1 : 0) + (stateFilter ? 1 : 0);

  function toggleStatus(d: DistrictRow) {
    const fd = new FormData();
    fd.set("districtId", d.id);
    fd.set("status", d.status === "ACTIVE" ? "INACTIVE" : "ACTIVE");
    startTransition(async () => {
      await setDistrictStatus(fd);
    });
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
              placeholder="Search districts…"
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
                      onClick={() => {
                        setStatus("all");
                        setStateFilter("");
                      }}
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
                    onChange={(e) => setStatus(e.target.value as StatusFilter)}
                    className="h-9"
                  >
                    <option value="all">All statuses</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </Select>
                </label>
                <label className="block space-y-1">
                  <span className="text-[12px] font-medium text-ink-soft">State</span>
                  <Select
                    value={stateFilter}
                    onChange={(e) => setStateFilter(e.target.value)}
                    className="h-9"
                  >
                    <option value="">All states</option>
                    {statesPresent.map((s) => (
                      <option key={s} value={s}>
                        {STATE_NAME.get(s) ?? s}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
            )}
          </Menu>
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
          New district
        </Button>
      </div>

      <Table>
        <THead>
          <TR>
            <TH>District</TH>
            <TH>State</TH>
            <TH>Users</TH>
            <TH>Status</TH>
            <TH className="text-right">Actions</TH>
          </TR>
        </THead>
        <TBody>
          {filtered.length === 0 && (
            <EmptyRow colSpan={5}>
              {districts.length === 0
                ? "No districts yet. Create your first with “New district”."
                : "No matches for these filters."}
            </EmptyRow>
          )}
          {filtered.map((d) => (
            <TR key={d.id}>
              <TD className="font-medium">
                <button
                  type="button"
                  onClick={() => router.push(`/platform/districts/${d.id}`)}
                  className="text-left text-ink transition-colors hover:text-brand hover:underline"
                >
                  {d.name}
                </button>
                <span className="ml-2 text-[12px] font-normal text-muted-2">
                  {d.code}
                </span>
              </TD>
              <TD>{STATE_NAME.get(d.state) ?? d.state}</TD>
              <TD>{d.users}</TD>
              <TD>
                {d.status === "ACTIVE" ? (
                  <Badge tone="green">Active</Badge>
                ) : (
                  <Badge tone="gray">Inactive</Badge>
                )}
              </TD>
              <TD>
                <div className="flex justify-end">
                  <Menu
                    align="right"
                    triggerLabel="District actions"
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
                      <div className="min-w-[176px] py-1">
                        <MenuItem
                          icon={<Icon name="eye" size={15} />}
                          onClick={() => {
                            router.push(`/platform/districts/${d.id}`);
                            close();
                          }}
                        >
                          View
                        </MenuItem>
                        <MenuItem
                          icon={<Icon name="users" size={15} />}
                          onClick={() => {
                            router.push(`/platform/districts/${d.id}/users`);
                            close();
                          }}
                        >
                          Manage users
                        </MenuItem>
                        <MenuItem
                          icon={<Icon name="power" size={15} />}
                          onClick={() => {
                            toggleStatus(d);
                            close();
                          }}
                        >
                          {d.status === "ACTIVE" ? "Deactivate" : "Activate"}
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

      <Modal open={adding} onClose={() => setAdding(false)} title="New district">
        <CreateDistrictForm onCancel={() => setAdding(false)} />
      </Modal>
    </div>
  );
}
