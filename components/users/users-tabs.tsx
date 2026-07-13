import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * Server-rendered tab bar. Driven by the `?tab=` searchParam rather than client state, so the
 * tabs are linkable — which is what lets the header bell and the request emails deep-link
 * straight to the pending requests.
 */
export function UsersTabs({
  active,
  internalCount,
  pendingCount,
}: {
  active: "internal" | "external";
  internalCount: number;
  pendingCount: number;
}) {
  const tabs = [
    { key: "internal" as const, label: "District users", href: "/users", count: internalCount },
    {
      key: "external" as const,
      label: "External users",
      href: "/users?tab=external",
      count: null,
    },
  ];

  return (
    <div className="mb-5 flex items-center gap-1 border-b border-line">
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            className={cn(
              "-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-[13.5px] font-medium transition-colors",
              isActive
                ? "border-brand text-brand"
                : "border-transparent text-muted-2 hover:text-ink-soft",
            )}
          >
            {t.label}
            {t.count !== null && (
              <span className="text-[12px] text-muted-2">{t.count}</span>
            )}
            {/* The pending badge rides on the External tab wherever you are, so a request
                can't sit unnoticed just because you're looking at the other tab. */}
            {t.key === "external" && pendingCount > 0 && (
              <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#e0553d] px-1 text-[10.5px] font-bold leading-none text-white">
                {pendingCount}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
