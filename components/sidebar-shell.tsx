"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

// Kept in sync with the `lg:` variants below, which are where the sidebar
// stops being a drawer and becomes part of the page flow.
const DESKTOP_QUERY = "(min-width: 1024px)";

interface ShellContextValue {
  open: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
}

// The no-op default lets SidebarNav render outside a provider.
const ShellContext = createContext<ShellContextValue>({
  open: false,
  openSidebar: () => {},
  closeSidebar: () => {},
});

export function useShell(): ShellContextValue {
  return useContext(ShellContext);
}

export function ShellProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const openSidebar = useCallback(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    setOpen(true);
  }, []);

  const closeSidebar = useCallback(() => setOpen(false), []);

  // Reset on navigation (including back/forward) by adjusting state during
  // render rather than in an effect, which would cascade an extra render.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);

    // Crossing into `lg` swaps the drawer for the in-flow sidebar, so the
    // drawer state has to go with it or the scroll lock outlives the overlay.
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const onBreakpointChange = () => {
      if (desktop.matches) setOpen(false);
    };
    desktop.addEventListener("change", onBreakpointChange);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      desktop.removeEventListener("change", onBreakpointChange);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (open) return;
    restoreFocusRef.current?.focus();
    restoreFocusRef.current = null;
  }, [open]);

  return (
    <ShellContext.Provider value={{ open, openSidebar, closeSidebar }}>
      {children}
    </ShellContext.Provider>
  );
}

export function SidebarOverlay() {
  const { open, closeSidebar } = useShell();
  return (
    <div
      aria-hidden="true"
      onClick={closeSidebar}
      className={cn(
        "fixed inset-0 z-40 bg-navy/60 transition-opacity duration-200 lg:hidden",
        open ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    />
  );
}

export function SidebarPanel({ children }: { children: ReactNode }) {
  const { open } = useShell();
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  return (
    <aside
      id="app-sidebar"
      ref={panelRef}
      tabIndex={-1}
      aria-label="Main navigation"
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-[250px] flex-none flex-col bg-navy outline-none",
        "transition-[transform,visibility] duration-200 ease-out",
        // `invisible` (visibility:hidden) keeps the off-canvas panel out of the
        // tab order and the a11y tree without any viewport measurement.
        open ? "visible translate-x-0" : "invisible -translate-x-full",
        "lg:visible lg:sticky lg:top-0 lg:bottom-auto lg:z-auto lg:h-screen lg:translate-x-0",
      )}
    >
      {children}
    </aside>
  );
}

export function SidebarCloseButton() {
  const { closeSidebar } = useShell();
  return (
    <button
      type="button"
      onClick={closeSidebar}
      aria-label="Close navigation"
      className="flex h-8 w-8 flex-none items-center justify-center rounded-md text-[#6f8099] transition-colors hover:bg-white/10 hover:text-[#cfd9e8] lg:hidden"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </svg>
    </button>
  );
}

export function MenuButton() {
  const { open, openSidebar } = useShell();
  return (
    <button
      type="button"
      onClick={openSidebar}
      aria-label="Open navigation"
      aria-controls="app-sidebar"
      aria-expanded={open}
      className="flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-line text-[#5b6a82] transition-colors hover:bg-panel lg:hidden"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 6h18" />
        <path d="M3 12h18" />
        <path d="M3 18h18" />
      </svg>
    </button>
  );
}
