"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/icons";

/**
 * The header scope controls — §2.2's fund selector, period selector and export.
 *
 * A CLIENT component, but a very thin one: it only writes URL parameters. The scope itself
 * is resolved on the server (lib/dashboard/scope.ts) and every figure is computed there, so
 * changing the period is a server navigation rather than a client refetch. That is what
 * keeps Prisma.Decimal out of the browser — no figure ever crosses the boundary.
 *
 * One filter row above everything it scopes, never a filter inside a card: all the charts
 * on the page re-render against the same slice, which is the only way a dashboard's cards
 * can be trusted to agree with one another.
 */

export interface ScopeOption {
  value: string;
  label: string;
}

function Select({
  label,
  value,
  options,
  onChange,
  icon,
}: {
  label: string;
  value: string;
  options: ScopeOption[];
  onChange: (v: string) => void;
  icon?: "building" | "reports";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const current = options.find((o) => o.value === value) ?? options[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        className="flex h-9 max-w-[240px] items-center gap-2 rounded-lg border border-line bg-white px-3 text-[12.5px] font-medium text-ink-soft transition-colors hover:border-[#c8d3e4]"
      >
        {icon && (
          <span className="flex-none text-muted-2">
            <Icon name={icon} size={14} />
          </span>
        )}
        <span className="truncate">{current?.label ?? label}</span>
        <span aria-hidden className="flex-none text-[9px] text-muted-2">
          ▼
        </span>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute right-0 z-30 mt-1 max-h-[320px] min-w-[220px] overflow-y-auto rounded-lg border border-line bg-white py-1 shadow-lg"
        >
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={cn(
                  "block w-full px-3 py-1.5 text-left text-[12.5px] transition-colors hover:bg-panel",
                  o.value === value ? "font-semibold text-brand" : "text-ink-muted",
                )}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ScopeBar({
  periods,
  period,
  funds,
  fund,
  exportHref,
}: {
  periods: ScopeOption[];
  /** "<fy>:<period>" */
  period: string;
  funds: ScopeOption[];
  /** "" means All Funds. */
  fund: string;
  exportHref?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const push = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        label="Fund"
        icon="building"
        value={fund}
        options={[{ value: "", label: "All funds" }, ...funds]}
        onChange={(v) => push({ fund: v || null })}
      />
      <Select
        label="Reporting period"
        icon="reports"
        value={period}
        options={periods}
        onChange={(v) => {
          const [fy, p] = v.split(":");
          push({ fy, period: p });
        }}
      />
      {exportHref && (
        <a
          href={exportHref}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-[12.5px] font-medium text-ink-soft transition-colors hover:border-[#c8d3e4]"
        >
          <Icon name="upload" size={14} className="rotate-180" />
          Export
        </a>
      )}
      <button
        type="button"
        onClick={() => window.print()}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-[12.5px] font-medium text-ink-soft transition-colors hover:border-[#c8d3e4] print:hidden"
        title="Print, or save as PDF"
      >
        <Icon name="reports" size={14} />
        PDF
      </button>
    </div>
  );
}
