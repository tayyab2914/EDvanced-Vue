"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The small ⓘ beside a card title, and the sentence it holds.
 *
 * It used to be a `<span title="…">`. A native `title` is a hover-only affordance: it waits
 * about a second, it never fires on a touch screen, and — the actual complaint — it does
 * nothing at all on click, so the one gesture a reader tries first is the one gesture that
 * has no effect. On an iPad, which is what a superintendent reads these dashboards on, the
 * dot was decoration.
 *
 * So it is a real button now. Click or tap toggles the panel, hover and keyboard focus open
 * it, Escape and an outside click close it. Same 15px circle as before — the affordance was
 * never the problem.
 */
export function InfoDot({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);

  // Bound while open only: a listener per info dot on every dashboard, permanently, to
  // serve a panel that is almost never showing, is a cost with no reader on the other end.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span
      ref={wrap}
      className="relative flex-none"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-label={text}
        onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="flex size-[15px] items-center justify-center rounded-full bg-black/[0.07] text-[10px] font-bold text-[#060606] outline-none transition-colors hover:bg-black/[0.14] focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          // Left-anchored and clamped to the viewport width: the dot sits at the START of a
          // card title, so a right-anchored panel would hang off the left edge of the first
          // column instead of over the card it explains.
          className="pointer-events-none absolute left-0 top-[21px] z-30 w-[240px] max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-white p-2.5 text-[11px] font-normal leading-snug text-[#060606] shadow-[0_10px_24px_rgba(9,20,38,0.14)]"
        >
          {text}
        </span>
      )}
    </span>
  );
}
