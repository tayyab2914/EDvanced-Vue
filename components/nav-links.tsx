"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export interface NavItem {
  label: string;
  href: string;
}

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <div className="-mb-px flex gap-1 overflow-x-auto">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors",
              active
                ? "border-brand text-brand"
                : "border-transparent text-muted-2 hover:border-line hover:text-ink-soft",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
