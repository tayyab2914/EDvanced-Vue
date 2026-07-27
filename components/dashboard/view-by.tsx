"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/cn";
import { VIEW_PARAM, type ViewOption } from "@/lib/dashboard/view";

/**
 * The "View by" control that sits in a card's header — SectionCard's `control` slot.
 *
 * A CLIENT component, and as thin as ScopeBar's selects: it writes one URL parameter and
 * nothing else. The aggregate behind the card is chosen on the server, so switching
 * perspective is a server navigation rather than a client refetch, and the card that comes
 * back is the same server-rendered SVG/HTML that prints.
 *
 * THREE SMALL DECISIONS WORTH THE WORDS
 *
 *   `scroll: false` — the scope bar sits at the top of the page and a jump to the top after
 *   changing it is harmless. This control sits three rows down, and scrolling away from the
 *   card the reader just re-grouped would make the change look like it did something else.
 *
 *   The default option DELETES the parameter instead of writing it. A district that has not
 *   re-grouped anything keeps the URL it has always had, so a bookmark or a pasted link does
 *   not quietly gain a `groupBy` it never asked for.
 *
 *   `print:hidden` — a dropdown in a PDF is a button nobody can press. The card's SUBTITLE
 *   names the active dimension instead (every page that uses this sets it), so the printed
 *   page still says what it is grouped by.
 */
export function ViewBy({
  options,
  value,
  param = VIEW_PARAM,
  label = "View by",
}: {
  options: readonly ViewOption[];
  value: string;
  /** Override only when a page carries more than one of these. */
  param?: string;
  label?: string;
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
    const qp = new URLSearchParams(params.toString());
    if (next === options[0].value) qp.delete(param);
    else qp.set(param, next);
    const qs = qp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div ref={ref} className="relative print:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current.label}`}
        className="flex h-7 max-w-[200px] items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 text-[11.5px] font-medium text-ink-soft transition-colors hover:border-[#c8d3e4]"
      >
        <span className="flex-none text-muted-2">{label}</span>
        <span className="truncate font-semibold text-ink">{current.label}</span>
        <span aria-hidden className="flex-none text-[8px] text-muted-2">
          ▼
        </span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={label}
          className="absolute right-0 z-30 mt-1 min-w-[190px] overflow-hidden rounded-lg border border-line bg-white py-1 shadow-lg"
        >
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                role="option"
                aria-selected={o.value === current.value}
                onClick={() => choose(o.value)}
                className={cn(
                  "block w-full px-3 py-1.5 text-left text-[12.5px] transition-colors hover:bg-panel",
                  o.value === current.value ? "font-semibold text-brand" : "text-ink-muted",
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
