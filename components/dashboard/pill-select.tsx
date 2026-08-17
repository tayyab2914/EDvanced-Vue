"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { PILL_INTERACTIVE, PILL_MENU, PillChevron } from "@/components/dashboard/pill";
import { VIEW_PARAM, type ViewOption } from "@/lib/dashboard/view";

/**
 * The redesign's in-card dropdown — the white capsule reading "Basis: Actual ⌄" on the
 * by-fund table (Figma 55:3829) and its 20px little sibling on the composition card
 * (55:4162 / 55:4166). The same contract as the old bordered `ViewBy` it replaces on the
 * Fund Balance band: a client component that writes ONE URL parameter and nothing else —
 * the aggregate behind the card is regrouped on the server.
 *
 * The default option DELETES the parameter rather than writing it, `scroll: false` keeps
 * the card the reader just re-based under their pointer, and the whole control is
 * `print:hidden` — the card's subtitle names the active choice on paper.
 *
 * The `sm` size letters at the mockup's own 9px; unlike the band's other tiny labels it is
 * not normalised up, because the pill's height (20px) is the design's too and 10px text
 * centres badly inside it.
 */
export function PillSelect({
  options,
  value,
  param = VIEW_PARAM,
  label = "View by",
  size = "md",
}: {
  options: readonly ViewOption[];
  value: string;
  /** Override only when a page carries more than one of these. */
  param?: string;
  label?: string;
  /** md — the table header's 34px capsule; sm — the composition card's 20px one. */
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
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

  const choose = (next: string) => {
    setOpen(false);
    if (next === current.value) return;
    const qp = new URLSearchParams(params.toString());
    if (next === options[0].value) qp.delete(param);
    else qp.set(param, next);
    const qs = qp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div ref={ref} className="relative flex-none print:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current.label}`}
        className={cn(
          "flex flex-none items-center whitespace-nowrap rounded-full bg-white font-semibold text-[#060606]",
          size === "md"
            ? "h-[34px] gap-[12px] px-[14px] text-[14px] leading-normal tracking-[0.14px]"
            : "h-[20px] gap-[6px] px-[10px] text-[10px] leading-none tracking-[0.09px]",
          PILL_INTERACTIVE,
        )}
      >
        <span>
          <span className="font-normal text-[#060606]">{label}: </span>
          {current.label}
        </span>
        <PillChevron open={open} className={size === "sm" ? "size-[10px]" : undefined} />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={label}
          className={cn(
            PILL_MENU,
            "absolute right-0 top-[calc(100%+6px)] z-30 min-w-[150px] p-[6px]",
          )}
        >
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                role="option"
                aria-selected={o.value === current.value}
                onClick={() => choose(o.value)}
                className={cn(
                  "block w-full rounded-[11px] px-[10px] py-[7px] text-left text-[13px] font-semibold leading-[17px] tracking-[0.13px] transition-colors",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#301a93]",
                  o.value === current.value
                    ? "bg-[rgba(0,6,6,0.06)] text-[#060606]"
                    : "text-[#060606] hover:bg-[rgba(0,6,6,0.04)]",
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
