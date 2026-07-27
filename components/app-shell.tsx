import type { ReactNode } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { LogoMark, LogoWordmark } from "@/components/logo";
import { LogoutButton } from "@/components/logout-button";
import { SidebarNav, type NavGroup } from "@/components/sidebar-nav";
import {
  ExpandedOnly,
  MenuButton,
  RailAccountLink,
  RailSwap,
  RailWorkspaceTile,
  ShellMain,
  ShellProvider,
  SidebarBrand,
  SidebarCloseButton,
  SidebarCollapseToggle,
  SidebarHeader,
  SidebarOverlay,
  SidebarPanel,
} from "@/components/sidebar-shell";
import { SIDEBAR_COOKIE, isCollapsedPreference } from "@/lib/sidebar-preference";

/** A thing needing the user's attention, surfaced on the header bell. */
export interface ShellAlert {
  href: string;
  count: number;
  /** Singular noun phrase, e.g. "pending access request" — pluralized for you. */
  label: string;
}

/**
 * The header bell. Only shows the red dot when something is actually waiting — an
 * always-lit dot teaches people to ignore it. Renders as a plain div (not a link) when
 * there is nothing to see, so it can't be clicked into a dead end.
 */
function Bell({ alert }: { alert?: ShellAlert }) {
  const icon = (
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
  );
  const shell =
    "relative flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-line text-[#5b6a82]";

  if (!alert) return <div className={shell}>{icon}</div>;

  const description = `${alert.count} ${alert.label}${alert.count === 1 ? "" : "s"}`;

  return (
    <Link
      href={alert.href}
      title={description}
      aria-label={description}
      className={`${shell} transition-colors hover:border-brand hover:text-brand`}
    >
      {icon}
      <span className="absolute -right-1 -top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full border-[1.5px] border-white bg-[#e0553d] px-1 text-[10px] font-bold leading-none text-white">
        {alert.count > 9 ? "9+" : alert.count}
      </span>
    </Link>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase() || "?";
}

export async function AppShell({
  workspaceName,
  workspaceSub,
  contextTag,
  nav,
  user,
  switcher,
  alerts,
  hideHeader = false,
  children,
}: {
  workspaceName: string;
  workspaceSub: string;
  contextTag?: string;
  nav: NavGroup[];
  user: { name: string; roleLabel: string };
  /** Replaces the static workspace card when the user can work in more than one district. */
  switcher?: ReactNode;
  /** Lights up the header bell. Omit it and the bell renders dark (nothing pending). */
  alerts?: ShellAlert;
  /**
   * Drops the sticky top header entirely (workspace title, fiscal-year chip, bell). A
   * floating menu button takes over on mobile so the sidebar drawer is still reachable.
   */
  hideHeader?: boolean;
  children: ReactNode;
}) {
  // The remembered rail width. Read here rather than in each layout so all three shells
  // (district, platform, external) get it without repeating themselves — and read on the
  // server so the sidebar is already the right width in the first paint.
  const collapsed = isCollapsedPreference(
    (await cookies()).get(SIDEBAR_COOKIE)?.value,
  );

  return (
    <ShellProvider initialCollapsed={collapsed}>
      <div className="flex min-h-screen">
        <SidebarOverlay />

        {/* SIDEBAR */}
        <SidebarPanel>
          <SidebarHeader>
            <SidebarBrand>
              <LogoMark size={30} onDark />
              <ExpandedOnly className="min-w-0 flex-1">
                <LogoWordmark onDark className="block truncate text-[15.5px]" />
              </ExpandedOnly>
              <SidebarCloseButton />
            </SidebarBrand>
            <RailSwap
              expanded={
                switcher ?? (
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
                )
              }
              // The district name is the only "where am I" cue in this shell when the page
              // header is hidden, so the rail keeps the tile even though it drops the card.
              // Switching districts (external users) needs the sidebar expanded.
              collapsed={
                <div className="mt-3">
                  <RailWorkspaceTile
                    initials={initials(workspaceName)}
                    label={workspaceName}
                  />
                </div>
              }
            />
          </SidebarHeader>

          <SidebarNav groups={nav} />

          <div className="border-t border-white/[0.07] p-3">
            <RailSwap
              expanded={
                <div className="flex items-center gap-2.5 rounded-[9px] px-2.5 py-2">
                  {/* The user's own card is where people look for "my account" — a nav item
                      would put it beside the district's data, which is not what it is. */}
                  <Link
                    href="/account"
                    className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[7px] transition-opacity hover:opacity-80"
                  >
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
                  </Link>
                  <LogoutButton />
                </div>
              }
              collapsed={
                <div className="flex flex-col items-center gap-1.5 py-1">
                  <RailAccountLink
                    initials={initials(user.name)}
                    label={`${user.name} · ${user.roleLabel}`}
                  />
                  <LogoutButton />
                </div>
              }
            />
          </div>

          <SidebarCollapseToggle />
        </SidebarPanel>

        {/* MAIN */}
        <div className="flex min-w-0 flex-1 flex-col">
          {hideHeader ? (
            // Header removed for this area. The sidebar is always visible on `lg`, but
            // below it the drawer needs a trigger — this floating button is the only one
            // left, so it stays mobile-only (`lg:hidden`).
            //
            // `print:hidden` as well, and NOT because it is redundant with `lg:hidden`.
            // Breakpoint variants are not reliable in a print layout, and this 60px strip
            // is the first thing on the page: it pushed the one-page summary sheet down by
            // its own height, and `break-inside: avoid` then moved the entire sheet to page
            // two rather than splitting it. Chrome that cannot be clicked must not print.
            <div className="sticky top-0 z-20 flex justify-start p-3 lg:hidden print:hidden">
              <MenuButton />
            </div>
          ) : (
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
              <Bell alert={alerts} />
            </header>
          )}

          <ShellMain>{children}</ShellMain>
        </div>
      </div>
    </ShellProvider>
  );
}
