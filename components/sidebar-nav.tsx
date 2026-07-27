"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/components/icons";
import { useShell } from "@/components/sidebar-shell";
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
  const { closeSidebar } = useShell();
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-3.5">
      {groups.map((group, gi) => (
        <div key={gi} className={gi ? "mt-4" : ""}>
          {group.label && (
            <div className="px-2.5 pb-2 pt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[#5b6b84]">
              {group.label}
            </div>
          )}
          {group.items.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href ||
                pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={withScope(item.href, params)}
                onClick={closeSidebar}
                className={cn(
                  "mb-0.5 flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-[13.5px] font-medium transition-colors",
                  active
                    ? "bg-[#4c7cf6]/[0.18] text-white shadow-[inset_2px_0_0_#4c7cf6]"
                    : "text-[#9aa8bd] hover:bg-white/[0.06] hover:text-[#cdd8e8]",
                )}
              >
                <span className="flex-none">
                  <Icon name={item.icon} size={18} />
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
