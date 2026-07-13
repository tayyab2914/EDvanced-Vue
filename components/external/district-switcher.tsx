"use client";

import { switchDistrict } from "@/app/actions/external-access";
import { Menu } from "@/components/ui/menu";
import { ACCESS_LEVEL_LABELS } from "@/lib/external-access";
import type { ExternalAccessLevel } from "@/lib/enums";
import { EXTERNAL_HOME } from "@/lib/auth/routes";

export interface SwitcherGrant {
  districtId: string;
  districtName: string;
  level: ExternalAccessLevel | null;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase() || "?";
}

/**
 * Replaces the sidebar's static workspace card for external users. Every entry submits
 * `switchDistrict`, which re-checks the grant is still live before letting them in — the
 * list rendered here is a convenience, never the authority.
 */
export function DistrictSwitcher({
  activeDistrictId,
  activeDistrictName,
  grants,
}: {
  activeDistrictId: string;
  activeDistrictName: string;
  grants: SwitcherGrant[];
}) {
  const active = grants.find((g) => g.districtId === activeDistrictId);
  const sub = active?.level
    ? `External · ${ACCESS_LEVEL_LABELS[active.level]}`
    : "External access";

  return (
    <Menu
      align="left"
      triggerLabel="Switch district"
      triggerClassName="w-full"
      trigger={
        <div className="flex w-full items-center gap-2.5 rounded-[9px] bg-white/[0.05] px-2.5 py-2 text-left transition-colors hover:bg-white/[0.09]">
          <div className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-md bg-[#20406b] text-[11px] font-semibold text-[#9cc0ff]">
            {initials(activeDistrictName)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-[#e7edf6]">
              {activeDistrictName}
            </div>
            <div className="truncate text-[11px] text-[#6f8099]">{sub}</div>
          </div>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="flex-none text-[#6f8099]"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      }
    >
      {(close) => (
        <div className="w-60">
          <div className="px-3 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-2">
            My districts
          </div>
          {grants.map((g) => {
            const isActive = g.districtId === activeDistrictId;
            return (
              <form key={g.districtId} action={switchDistrict} onSubmit={close}>
                <input type="hidden" name="districtId" value={g.districtId} />
                <button
                  type="submit"
                  disabled={isActive}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-ink-soft transition-colors hover:bg-panel disabled:cursor-default disabled:bg-panel"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">
                      {g.districtName}
                    </span>
                    {g.level && (
                      <span className="block truncate text-[11px] text-muted-2">
                        {ACCESS_LEVEL_LABELS[g.level]}
                      </span>
                    )}
                  </span>
                  {isActive && (
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="flex-none text-brand"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </button>
              </form>
            );
          })}
          <a
            href={EXTERNAL_HOME}
            onClick={close}
            className="mt-1 block border-t border-line px-3 py-2 text-[13px] font-medium text-brand transition-colors hover:bg-panel"
          >
            All districts &amp; requests →
          </a>
        </div>
      )}
    </Menu>
  );
}
