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
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { sidebarCookie } from "@/lib/sidebar-preference";

// Kept in sync with the `lg:` variants below, which are where the sidebar
// stops being a drawer and becomes part of the page flow.
const DESKTOP_QUERY = "(min-width: 1024px)";

interface ShellContextValue {
  open: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  /**
   * The desktop rail. Below `lg` the sidebar is a drawer that is either on-screen or not,
   * so this flag is deliberately ignored there — every collapsed style is `lg:`-gated and
   * the drawer always shows full labels.
   */
  collapsed: boolean;
  toggleCollapsed: () => void;
}

// The no-op default lets SidebarNav render outside a provider.
const ShellContext = createContext<ShellContextValue>({
  open: false,
  openSidebar: () => {},
  closeSidebar: () => {},
  collapsed: false,
  toggleCollapsed: () => {},
});

export function useShell(): ShellContextValue {
  return useContext(ShellContext);
}

export function ShellProvider({
  initialCollapsed = false,
  children,
}: {
  /** Read from the cookie on the server, so the first paint is already the right width. */
  initialCollapsed?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const pathname = usePathname();
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const openSidebar = useCallback(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    setOpen(true);
  }, []);

  const closeSidebar = useCallback(() => setOpen(false), []);

  const toggleCollapsed = useCallback(() => {
    const next = !collapsed;
    setCollapsed(next);
    // Written here rather than in an effect so the preference survives even if the click
    // is the last thing that happens before the tab is closed.
    document.cookie = sidebarCookie(next);
  }, [collapsed]);

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
    <ShellContext.Provider
      value={{ open, openSidebar, closeSidebar, collapsed, toggleCollapsed }}
    >
      {children}
    </ShellContext.Provider>
  );
}

/* ------------------------------------------------------------------ *
 * The collapsed rail's labels-on-hover
 * ------------------------------------------------------------------ */

interface TipPosition {
  top: number;
  left: number;
}

/** Enough of a React event for the measurement; keeps the handlers usable on `a`, `button`, `div`. */
interface TipEvent {
  currentTarget: HTMLElement;
}

interface RailTip {
  handlers: {
    onMouseEnter: (event: TipEvent) => void;
    onMouseLeave: () => void;
    onFocus: (event: TipEvent) => void;
    onBlur: () => void;
  };
  /** Render inside the target. It is a portal, so it does not affect the target's layout. */
  node: ReactNode;
}

/**
 * The label that appears beside a rail icon on hover.
 *
 * Portalled to `<body>` rather than positioned against the item, because the nav is a
 * scroll container (`overflow-y-auto`) and a scroll container clips on BOTH axes — an
 * absolutely-positioned label would be sliced off at the rail's edge. Measuring on hover
 * rather than tracking position is enough: the tip only lives as long as the pointer rests.
 *
 * `hidden lg:block` on the tip, not a viewport check in JS: `collapsed` is a desktop-only
 * idea, and gating in CSS keeps the server and client renders identical.
 */
export function useRailTip(label: string, enabled: boolean): RailTip {
  const [pos, setPos] = useState<TipPosition | null>(null);

  const show = useCallback((event: TipEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    // Anchored to the RAIL's edge, not the item's: the nav is inset by its own padding, so
    // measuring from the item would tuck the tip back underneath the sidebar.
    const rail = event.currentTarget.closest("aside")?.getBoundingClientRect();
    setPos({
      top: rect.top + rect.height / 2,
      left: (rail?.right ?? rect.right) + 10,
    });
  }, []);
  const hide = useCallback(() => setPos(null), []);

  // `pos` is only ever set from an event handler, so `document` is always there by then.
  const node =
    enabled && pos
      ? createPortal(
          <div
            role="tooltip"
            style={{ top: pos.top, left: pos.left }}
            className="pointer-events-none fixed z-[60] hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-[#1b2c45] px-2.5 py-1.5 text-[12.5px] font-medium text-[#e7edf6] shadow-[0_8px_20px_rgba(5,12,24,0.45)] lg:block"
          >
            {label}
          </div>,
          document.body,
        )
      : null;

  return {
    handlers: {
      onMouseEnter: (event) => enabled && show(event),
      onMouseLeave: hide,
      onFocus: (event) => enabled && show(event),
      onBlur: hide,
    },
    node,
  };
}

/* ------------------------------------------------------------------ *
 * Shell chrome
 * ------------------------------------------------------------------ */

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
  const { open, collapsed } = useShell();
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
        // At `lg` the panel is in flow, so it is the width — not the transform — that
        // moves, and the main column reflows into the space the rail gives back.
        "lg:transition-[width] lg:duration-200 lg:ease-out",
        collapsed ? "lg:w-[68px]" : "lg:w-[250px]",
      )}
    >
      {children}
    </aside>
  );
}

/**
 * The main column, whose ceiling lifts when the rail gives the space back. Without this the
 * collapse would buy nothing on a wide screen: `max-w-[1200px]` would simply re-centre the
 * same 1200px of content 90px further left.
 */
export function ShellMain({ children }: { children: ReactNode }) {
  const { collapsed } = useShell();
  return (
    <main
      className={cn(
        "mx-auto w-full max-w-[1200px] flex-1 px-4 py-5 transition-[max-width] duration-200 ease-out sm:px-6 sm:py-6 lg:px-7 lg:py-7",
        collapsed && "lg:max-w-[1440px]",
      )}
    >
      {children}
    </main>
  );
}

/**
 * Swaps a piece of sidebar chrome for its rail-sized form.
 *
 * `expanded` is kept for the mobile drawer even when the rail is collapsed — the drawer is
 * always full width, so an icon-only workspace tile there would just be a mystery.
 */
export function RailSwap({
  expanded,
  collapsed: collapsedNode,
}: {
  expanded: ReactNode;
  collapsed: ReactNode;
}) {
  const { collapsed } = useShell();
  if (!collapsed) return <>{expanded}</>;
  return (
    <>
      <div className="lg:hidden">{expanded}</div>
      <div className="hidden lg:block">{collapsedNode}</div>
    </>
  );
}

/** The sidebar's top band. Loses its generous side padding once it is only a rail wide. */
export function SidebarHeader({ children }: { children: ReactNode }) {
  const { collapsed } = useShell();
  return (
    <div
      className={cn(
        "border-b border-white/[0.07] px-5 pb-4 pt-5",
        collapsed && "lg:px-3",
      )}
    >
      {children}
    </div>
  );
}

/** The logo row: mark always, wordmark only when there is a sidebar to write it across. */
export function SidebarBrand({ children }: { children: ReactNode }) {
  const { collapsed } = useShell();
  return (
    <div
      className={cn(
        "mb-4 flex items-center gap-2.5",
        collapsed && "lg:mb-0 lg:justify-center lg:gap-0",
      )}
    >
      {children}
    </div>
  );
}

/** Hidden in the collapsed rail, kept in the mobile drawer. */
export function ExpandedOnly({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const { collapsed } = useShell();
  return (
    <div className={cn(className, collapsed && "lg:hidden")}>{children}</div>
  );
}

/** The district / workspace initials tile, standing in for the whole card on the rail. */
export function RailWorkspaceTile({
  initials,
  label,
}: {
  initials: string;
  label: string;
}) {
  const { collapsed } = useShell();
  const tip = useRailTip(label, collapsed);
  return (
    <div className="flex justify-center">
      <div
        {...tip.handlers}
        className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-md bg-[#20406b] text-[11px] font-semibold text-[#9cc0ff]"
      >
        {initials}
        {tip.node}
      </div>
    </div>
  );
}

/** The account avatar on the rail — same destination as the expanded user card. */
export function RailAccountLink({
  initials,
  label,
}: {
  initials: string;
  label: string;
}) {
  const { collapsed } = useShell();
  const tip = useRailTip(label, collapsed);
  return (
    <Link
      href="/account"
      aria-label={label}
      {...tip.handlers}
      className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#3a5680] text-[12.5px] font-semibold text-white transition-opacity hover:opacity-80"
    >
      {initials}
      {tip.node}
    </Link>
  );
}

/**
 * Collapse / expand, pinned to the bottom of the sidebar.
 *
 * One control, not a separate collapse and pin: the state it sets IS the pinned state —
 * it is written to a cookie and read back on the next visit, so whichever width you leave
 * is the width you come back to. Desktop only; below `lg` the drawer's own close button
 * does this job.
 */
export function SidebarCollapseToggle() {
  const { collapsed, toggleCollapsed } = useShell();
  const label = collapsed ? "Expand sidebar" : "Collapse sidebar";
  const tip = useRailTip(label, collapsed);

  return (
    <div className="hidden border-t border-white/[0.07] p-3 lg:block">
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-controls="app-sidebar"
        aria-expanded={!collapsed}
        aria-label={label}
        title={label}
        {...tip.handlers}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-[13px] font-medium text-[#9aa8bd] transition-colors hover:bg-white/[0.06] hover:text-[#cdd8e8]",
          collapsed && "justify-center gap-0 px-0",
        )}
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
          className="flex-none"
        >
          {collapsed ? (
            <>
              <path d="m13 17 5-5-5-5" />
              <path d="m6 17 5-5-5-5" />
            </>
          ) : (
            <>
              <path d="m11 17-5-5 5-5" />
              <path d="m18 17-5-5 5-5" />
            </>
          )}
        </svg>
        {!collapsed && <span>Collapse</span>}
        {tip.node}
      </button>
    </div>
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
