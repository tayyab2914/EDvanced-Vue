"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/components/icons";
import { useRailTip, useShell } from "@/components/sidebar-shell";
import { withScope } from "@/lib/dashboard/filter-params";

export interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  exact?: boolean;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

function NavLink({
  item,
  active,
  collapsed,
  onNavigate,
  href,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate: () => void;
  href: string;
}) {
  const tip = useRailTip(item.label, collapsed);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      // The icon alone is not a name, so the accessible name has to come from somewhere
      // other than the (visually hidden) text once the rail is collapsed.
      aria-label={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      {...tip.handlers}
      className={cn(
        "mb-0.5 flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-[13.5px] font-medium transition-colors",
        collapsed && "lg:justify-center lg:gap-0 lg:px-0",
        active
          ? "bg-[#4c7cf6]/[0.18] text-white shadow-[inset_2px_0_0_#4c7cf6]"
          : "text-[#9aa8bd] hover:bg-white/[0.06] hover:text-[#cdd8e8]",
      )}
    >
      <span className="flex-none">
        <Icon name={item.icon} size={18} />
      </span>
      {/* Only `lg:hidden` — the mobile drawer is always full width and keeps its labels. */}
      <span className={cn(collapsed && "lg:hidden")}>{item.label}</span>
      {tip.node}
    </Link>
  );
}

export function SidebarNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  /**
   * The dashboards' scope, carried between them.
   *
   * "Applied filters remaining in place when the user moves between dashboards" — and this
   * is the whole implementation, because the URL is the only copy of the filter (see
   * lib/dashboard/filter-params.ts). There is no store to keep in step and nothing to clear
   * on logout; a nav link just points at the same slice on the next screen.
   *
   * `withScope` leaves every non-dashboard route alone, and the ACTIVE test still runs on
   * the bare pathname — a link that now carries a query string must not stop looking
   * selected because of it.
   */
  const params = useSearchParams();
  // Navigating to the current route fires no pathname change, so the drawer
  // has to be dismissed on the click itself.
  const { closeSidebar, collapsed } = useShell();
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-3.5">
      {groups.map((group, gi) => (
        <div key={gi} className={gi ? "mt-4" : ""}>
          {group.label && (
            <div
              className={cn(
                "px-2.5 pb-2 pt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[#5b6b84]",
                collapsed && "lg:hidden",
              )}
            >
              {group.label}
            </div>
          )}
          {/* A rule stands in for the heading on the rail, so the groups do not run
              together into one undifferentiated column of icons. */}
          {collapsed && gi > 0 && (
            <div
              aria-hidden="true"
              className="mx-2.5 mb-2.5 hidden border-t border-white/[0.09] lg:block"
            />
          )}
          {group.items.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              href={withScope(item.href, params)}
              collapsed={collapsed}
              onNavigate={closeSidebar}
              active={
                item.exact
                  ? pathname === item.href
                  : pathname === item.href ||
                    pathname.startsWith(`${item.href}/`)
              }
            />
          ))}
        </div>
      ))}
    </nav>
  );
}
