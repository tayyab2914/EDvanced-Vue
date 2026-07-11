"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Input, Select } from "@/components/ui/input";
import { Icon } from "@/components/icons";
import { Menu } from "@/components/ui/menu";
import { AuditTable, type AuditRow } from "@/components/audit-table";
import type { AuditFilterOptions } from "@/lib/audit";

const DATE_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "0", label: "All time" },
];

function humanizeAction(action: string): string {
  const s = action.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function AuditView({
  rows,
  options,
  showDistrict,
  current,
}: {
  rows: AuditRow[];
  options: AuditFilterOptions;
  showDistrict: boolean;
  current: {
    q: string;
    days: string;
    districtId: string;
    actorUserId: string;
    action: string;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(current.q);

  function setParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (!v) params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const activeFilters =
    [current.districtId, current.actorUserId, current.action].filter(Boolean)
      .length + (current.days && current.days !== "30" ? 1 : 0);

  const exportHref = `${pathname}/export?${searchParams.toString()}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setParams({ q: q.trim() || null });
            }}
            className="relative w-full max-w-xs sm:w-72"
          >
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2">
              <Icon name="search" size={16} />
            </span>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search action or entity…"
              autoComplete="off"
              className="h-9 w-full pl-9"
            />
          </form>

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
                      onClick={() =>
                        setParams({
                          days: null,
                          district: null,
                          user: null,
                          action: null,
                        })
                      }
                      className="text-[12px] font-medium text-brand hover:text-brand-dark"
                    >
                      Clear all
                    </button>
                  )}
                </div>

                <label className="block space-y-1">
                  <span className="text-[12px] font-medium text-ink-soft">Date</span>
                  <Select
                    value={current.days || "30"}
                    onChange={(e) => setParams({ days: e.target.value })}
                    className="h-9"
                  >
                    {DATE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </label>

                {showDistrict && (
                  <label className="block space-y-1">
                    <span className="text-[12px] font-medium text-ink-soft">
                      District
                    </span>
                    <Select
                      value={current.districtId}
                      onChange={(e) => setParams({ district: e.target.value || null })}
                      className="h-9"
                    >
                      <option value="">All districts</option>
                      {options.districts.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                )}

                <label className="block space-y-1">
                  <span className="text-[12px] font-medium text-ink-soft">User</span>
                  <Select
                    value={current.actorUserId}
                    onChange={(e) => setParams({ user: e.target.value || null })}
                    className="h-9"
                  >
                    <option value="">All users</option>
                    {options.actors.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </Select>
                </label>

                <label className="block space-y-1">
                  <span className="text-[12px] font-medium text-ink-soft">Action</span>
                  <Select
                    value={current.action}
                    onChange={(e) => setParams({ action: e.target.value || null })}
                    className="h-9"
                  >
                    <option value="">All actions</option>
                    {options.actions.map((a) => (
                      <option key={a} value={a}>
                        {humanizeAction(a)}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
            )}
          </Menu>
        </div>

        <a
          href={exportHref}
          className="inline-flex h-[38px] items-center justify-center gap-2 rounded-lg bg-white px-4 text-[13.5px] font-semibold text-ink-soft ring-1 ring-inset ring-[#d3dae5] transition-colors hover:bg-panel"
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
          Export CSV
        </a>
      </div>

      <AuditTable rows={rows} showDistrict={showDistrict} />
    </div>
  );
}
