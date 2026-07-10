"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/components/icons";

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
                href={item.href}
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
