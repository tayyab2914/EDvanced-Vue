"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

/**
 * A minimal popover menu. The panel is `position: fixed` and measured after open
 * so it stays on-screen and escapes ancestor `overflow` clipping (e.g. inside a
 * horizontally-scrolling table).
 */
export function Menu({
  trigger,
  triggerLabel,
  triggerClassName,
  align = "right",
  children,
}: {
  trigger: ReactNode;
  triggerLabel: string;
  triggerClassName?: string;
  align?: "left" | "right";
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = () => setOpen(false);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const btn = btnRef.current?.getBoundingClientRect();
      const panel = panelRef.current?.getBoundingClientRect();
      if (!btn) return;
      const w = panel?.width ?? 180;
      const h = panel?.height ?? 200;
      let top = btn.bottom + 4;
      let left = align === "right" ? btn.right - w : btn.left;
      if (top + h > window.innerHeight - 8) top = Math.max(8, btn.top - h - 4);
      left = Math.min(Math.max(8, left), window.innerWidth - w - 8);
      setPos({ top, left });
    };
    place();

    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, align]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={panelRef}
          role="menu"
          style={{
            position: "fixed",
            top: pos?.top ?? -9999,
            left: pos?.left ?? -9999,
            visibility: pos ? "visible" : "hidden",
          }}
          className="z-50 overflow-hidden rounded-lg border border-line bg-white shadow-[0_10px_30px_rgba(15,32,56,0.14)]"
        >
          {children(close)}
        </div>
      )}
    </>
  );
}

export function MenuItem({
  onClick,
  icon,
  danger,
  children,
}: {
  onClick: () => void;
  icon?: ReactNode;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] font-medium transition-colors hover:bg-panel",
        danger ? "text-bad hover:bg-bad-bg" : "text-ink-soft",
      )}
    >
      {icon && <span className="flex-none text-muted-2">{icon}</span>}
      {children}
    </button>
  );
}
