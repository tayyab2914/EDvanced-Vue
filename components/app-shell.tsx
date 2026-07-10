import type { ReactNode } from "react";
import { LogoutButton } from "@/components/logout-button";
import { SidebarNav, type NavGroup } from "@/components/sidebar-nav";
import {
  MenuButton,
  ShellProvider,
  SidebarCloseButton,
  SidebarOverlay,
  SidebarPanel,
} from "@/components/sidebar-shell";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase() || "?";
}

export function AppShell({
  brand,
  workspaceName,
  workspaceSub,
  contextTag,
  nav,
  user,
  children,
}: {
  brand: string;
  workspaceName: string;
  workspaceSub: string;
  contextTag?: string;
  nav: NavGroup[];
  user: { name: string; roleLabel: string };
  children: ReactNode;
}) {
  return (
    <ShellProvider>
      <div className="flex min-h-screen">
        <SidebarOverlay />

        {/* SIDEBAR */}
        <SidebarPanel>
          <div className="border-b border-white/[0.07] px-5 pb-4 pt-5">
            <div className="mb-4 flex items-center gap-2.5">
              <div className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[7px] bg-brand text-[14px] font-bold text-white">
                {brand.trim()[0]}
              </div>
              <span className="min-w-0 flex-1 truncate text-[15.5px] font-semibold text-white">
                {brand}
              </span>
              <SidebarCloseButton />
            </div>
            <div className="flex items-center gap-2.5 rounded-[9px] bg-white/[0.05] px-2.5 py-2">
              <div className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-md bg-[#20406b] text-[11px] font-semibold text-[#9cc0ff]">
                {initials(workspaceName)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-[#e7edf6]">
                  {workspaceName}
                </div>
                <div className="truncate text-[11px] text-[#6f8099]">
                  {workspaceSub}
                </div>
              </div>
            </div>
          </div>

          <SidebarNav groups={nav} />

          <div className="border-t border-white/[0.07] p-3">
            <div className="flex items-center gap-2.5 rounded-[9px] px-2.5 py-2">
              <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#3a5680] text-[12.5px] font-semibold text-white">
                {initials(user.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-semibold text-[#e7edf6]">
                  {user.name}
                </div>
                <div className="truncate text-[11px] text-[#6f8099]">
                  {user.roleLabel}
                </div>
              </div>
              <LogoutButton />
            </div>
          </div>
        </SidebarPanel>

        {/* MAIN */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-[62px] flex-none items-center gap-3 border-b border-line bg-white px-4 sm:gap-4 sm:px-6">
            <MenuButton />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold leading-tight text-ink">
                {workspaceName}
              </div>
              <div className="truncate text-[12px] text-muted-2">
                {workspaceSub}
              </div>
            </div>
            {contextTag && (
              <div className="hidden h-9 flex-none items-center gap-2 rounded-lg border border-line bg-panel px-3 text-[13px] font-medium text-ink-soft sm:flex">
                <span className="text-[12px] text-muted-2">Fiscal Year</span>
                <strong className="font-semibold">{contextTag}</strong>
              </div>
            )}
            <div className="relative flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-line text-[#5b6a82]">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.7 21a2 2 0 0 1-3.4 0" />
              </svg>
              <span className="absolute right-2 top-2 h-[7px] w-[7px] rounded-full border-[1.5px] border-white bg-[#e0553d]"></span>
            </div>
          </header>

          <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-7 lg:py-7">
            {children}
          </main>
        </div>
      </div>
    </ShellProvider>
  );
}
