"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { VIEW_PARAM, type ViewOption } from "@/lib/dashboard/view";

/**
 * The Revenue category card's segmented switcher — Figma 46:3226: a #f7f7f7 capsule with
 * the active segment lifted on white — TOGETHER WITH the card body it regroups.
 *
 * One client component rather than a bare tab row, because the two need to share a pending
 * state: choosing a perspective is a server navigation (the same `groupBy` URL-parameter
 * bargain components/dashboard/view-by.tsx documents), and while the server regroups, THIS
 * card — and only this card — shows a skeleton of itself. When the new rows stream in they
 * are remounted under a fresh key with the `.rev-swap-in` entrance (globals.css), so the
 * bars grow into their new lengths the way they did on first reveal.
 *
 * The entrance class is armed only after the first click (a ref, not state — the
 * navigation's own re-render reads it): the initial page load keeps its scroll-triggered
 * reveal, which would otherwise double-animate.
 */
export function RevenueCategorySwitcher({
  options,
  value,
  param = VIEW_PARAM,
  label = "View by",
  children,
}: {
  /** Short labels — the design's "Type" / "Code & Name" / "Project/Grant". */
  options: readonly ViewOption[];
  value: string;
  param?: string;
  label?: string;
  /** The server-rendered share rows and stat strip for the CURRENT view. */
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  /**
   * The tab the reader just chose — highlighted at once, while the server regroups. Also
   * doubles as the "has ever swapped" flag that arms the entrance animation: null until
   * the first click, so the initial page load keeps its scroll-triggered reveal.
   */
  const [target, setTarget] = useState<string | null>(null);

  const active = pending && target ? target : value;

  const choose = (next: string) => {
    if (next === active) return;
    setTarget(next);
    const qp = new URLSearchParams(params.toString());
    if (next === options[0].value) qp.delete(param);
    else qp.set(param, next);
    const qs = qp.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  };

  return (
    <>
      <div className="mt-[12px] flex justify-center">
        <div
          role="tablist"
          aria-label={label}
          className="flex h-[33px] w-fit max-w-full items-center rounded-[38px] bg-[#f7f7f7] p-px print:hidden"
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="tab"
              aria-selected={o.value === active}
              onClick={() => choose(o.value)}
              className={cn(
                "flex h-[31px] items-center whitespace-nowrap rounded-[38px] px-[18px] text-[10px] font-bold leading-[2] tracking-[0.1px] text-[#060606] transition-colors",
                o.value === active
                  ? "bg-white shadow-[0_1px_2px_rgba(0,6,6,0.06)]"
                  : "hover:bg-white/60",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {pending ? (
        <CategorySkeleton />
      ) : (
        /* A real box, not `display: contents` — the swap entrance animates opacity and
           transform, and a boxless wrapper has neither. It carries the card body's flex
           column so the stat strip's mt-auto still finds its floor. */
        <div
          key={value}
          className={cn("flex min-h-0 flex-1 flex-col", target !== null && "rev-swap-in")}
        >
          {children}
        </div>
      )}
    </>
  );
}

/**
 * The card's own shape as placeholder — three share rows and the stat capsule, pulsing.
 * Sized to the real thing so the card does not jump when the rows land.
 */
function CategorySkeleton() {
  return (
    <div role="status" aria-live="polite" className="flex-1 animate-pulse">
      <span className="sr-only">Regrouping…</span>
      <ul aria-hidden className="mt-[14px] flex flex-col gap-[10px]">
        {[0, 1, 2].map((i) => (
          <li key={i}>
            <div className="flex items-center justify-between gap-[10px] py-[9px]">
              <div className="h-[12px] w-3/5 rounded-full bg-[#060606]/[0.08]" />
              <div className="h-[10px] w-[76px] flex-none rounded-full bg-[#060606]/[0.08]" />
            </div>
            <div className="h-[13px] w-full rounded-full bg-[#060606]/[0.06]" />
          </li>
        ))}
      </ul>
      <div
        aria-hidden
        className="mt-[16px] flex items-stretch rounded-[24px] border border-[#e7e7e7] bg-white/[0.56] px-[14px] py-[12px]"
      >
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-1 flex-col gap-[6px] px-[9px]">
            <div className="h-[9px] w-[64px] rounded-full bg-[#060606]/[0.08]" />
            <div className="h-[13px] w-[72px] rounded-full bg-[#060606]/[0.10]" />
          </div>
        ))}
      </div>
    </div>
  );
}
