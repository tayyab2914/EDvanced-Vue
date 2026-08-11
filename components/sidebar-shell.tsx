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
  /**
   * True while the main column is waiting on a server render it has already asked for.
   *
   * ---------------------------------------------------------------------------
   * WHY THIS IS A SHELL CONCERN AND NOT A PAGE ONE
   *
   * `app/(district)/loading.tsx` covers a change of ROUTE. It does not fire when only the
   * query string changes, and applying a dashboard filter is exactly that — same segment,
   * new `?funds=…`. So the most expensive navigation in the product was the one with no
   * feedback at all: every figure on screen silently went stale for the length of a
   * `loadCore`, and the only way to tell the click had registered was that it eventually
   * changed something.
   *
   * The control that starts that navigation (the filter bar) sits INSIDE the main column,
   * and the content it invalidates is everything around it. Neither can see the other, so
   * the flag is held here — the nearest place above both — and `ShellMain` dims against it.
   * ---------------------------------------------------------------------------
   */
  busy: boolean;
  /**
   * Reference-COUNTED, not a plain setter: `setBusy(true)` on entering a pending state and
   * `setBusy(false)` on leaving it. Two controls can be mid-navigation at once (the filter
   * bar and the saved-views menu both navigate), and with a boolean the first one to finish
   * would clear the flag while the other was still waiting.
   */
  setBusy: (on: boolean) => void;
}

// The no-op default lets SidebarNav render outside a provider.
const ShellContext = createContext<ShellContextValue>({
  open: false,
  openSidebar: () => {},
  closeSidebar: () => {},
  collapsed: false,
  toggleCollapsed: () => {},
  busy: false,
  setBusy: () => {},
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
  const [busyCount, setBusyCount] = useState(0);
  const pathname = usePathname();
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Clamped at zero so an extra release — a component unmounting mid-navigation after its
  // transition already settled — cannot drive the count negative and wedge the shell busy.
  const setBusy = useCallback(
    (on: boolean) => setBusyCount((n) => Math.max(0, n + (on ? 1 : -1))),
    [],
  );

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

  const busy = busyCount > 0;

  return (
    <ShellContext.Provider
      value={{ open, openSidebar, closeSidebar, collapsed, toggleCollapsed, busy, setBusy }}
    >
      {children}
      {/* Outside the main column, so the one element that says "working" is the one element
          that does not dim while it says it. */}
      <BusyBar show={busy} />
    </ShellContext.Provider>
  );
}

/**
 * The progress strip across the top of the window, and the only announcement of the wait.
 *
 * FIXED TO THE VIEWPORT, not to the top of the page. A reader who has scrolled down to the
 * expenditure tables and unticks a fund is looking at the bottom of the document; a bar
 * drawn at the top of it would be feedback they never see.
 *
 * Always rendered, opacity-toggled, so the browser is not asked to insert an animating
 * element at the exact moment the main thread is busiest — it fades rather than appearing
 * mid-stutter. It is `aria-hidden`: the announcement belongs to `ShellMain`'s `aria-busy`,
 * and a live region here would say the same thing a second time.
 */
function BusyBar({ show }: { show: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-[60] h-[2.5px] overflow-hidden transition-opacity duration-150 print:hidden",
        show ? "opacity-100" : "opacity-0",
      )}
    >
      {show && <span className="animate-busy-sweep absolute inset-y-0 bg-brand" />}
    </div>
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
        "fixed inset-y-0 left-0 z-50 flex w-[256px] flex-none flex-col bg-sidebar outline-none",
        "transition-[transform,visibility] duration-200 ease-out",
        // `invisible` (visibility:hidden) keeps the off-canvas panel out of the
        // tab order and the a11y tree without any viewport measurement.
        open ? "visible translate-x-0" : "invisible -translate-x-full",
        "lg:visible lg:sticky lg:bottom-auto lg:z-auto lg:translate-x-0",
        /**
         * FLUSH TO THE VIEWPORT'S LEFT EDGE, full height.
         *
         * The Figma frame draws the rail as a rounded card inset from the window, but that
         * inset is a presentation device for the mockup — in the running app it costs 12px
         * of the content column on the left and the same again in gutters, which is what
         * pushed the fourth Overview tile onto a second row at 1440px. Flush also matches
         * how the client views it. Keep it flush: the tile row is sized against exactly the
         * width this gives back.
         */
        "lg:top-0 lg:h-screen",
        "lg:shadow-[0_24px_64px_-32px_rgba(0,32,102,0.45)]",
        // At `lg` the panel is in flow, so it is the width — not the transform — that
        // moves, and the main column reflows into the space the rail gives back.
        "lg:transition-[width] lg:duration-200 lg:ease-out",
        collapsed ? "lg:w-[68px]" : "lg:w-[256px]",
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
  const { collapsed, busy } = useShell();
  return (
    <main
      /**
       * DIMMED, NOT REPLACED, while a filter is applying.
       *
       * Everything in here is the PREVIOUS slice until the server answers — including the
       * filter chips, which still name the filter being replaced. Fading it says so. Swapping
       * in a skeleton would be worse: the figures are still true of the period, the reader
       * may well be mid-sentence reading one, and throwing the page away to redraw the same
       * layout a moment later is the jump `loading.tsx` was written to avoid.
       *
       * `aria-busy` is the same statement for a screen reader, which cannot see the fade.
       * Pointer events are deliberately LEFT ON: a transition is interruptible, and a reader
       * who picked the wrong fund should be able to say so without waiting out the wait.
       */
      aria-busy={busy || undefined}
      className={cn(
        "mx-auto w-full max-w-[1200px] flex-1 px-4 py-5 transition-[max-width,opacity] duration-200 ease-out sm:px-6 sm:py-6 lg:px-7 lg:py-7",
        collapsed && "lg:max-w-[1440px]",
        busy && "opacity-55",
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

/**
 * The hairline between the sidebar's bands.
 *
 * A gradient rather than a flat `border-white/[0.07]`: on a panel this dark a uniform rule
 * runs all the way into the rounded corners and reads as a seam across the card. The
 * redesign fades it out at both ends, so it separates the bands in the middle — where the
 * content is — and disappears before it reaches the edge.
 */
function SidebarRule() {
  return (
    <div
      aria-hidden
      className="h-px w-full flex-none bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.24)_50%,transparent_100%)]"
    />
  );
}

/** The sidebar's top band. Loses its generous side padding once it is only a rail wide. */
export function SidebarHeader({ children }: { children: ReactNode }) {
  const { collapsed } = useShell();
  return (
    <>
      <div className={cn("px-6 pb-5 pt-6", collapsed && "lg:px-3")}>
        {children}
      </div>
      <SidebarRule />
    </>
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
    /**
     * PINNED TO THE PANEL'S RIGHT EDGE, half on the card and half on the canvas.
     *
     * The redesign moves this off the sidebar's floor, where it used to be a full-width row
     * competing with the nav, and onto the seam as a 28px disc beside the wordmark. Two
     * consequences worth keeping in mind if this moves again: it resolves against the
     * `<aside>` — which is a containing block already, being `fixed` below `lg` and `sticky`
     * above it, so it needs no `relative` of its own — and it must NOT be clipped, so the
     * panel cannot take `overflow-hidden` to round its corners.
     *
     * Still desktop-only. Below `lg` the drawer's own close button does this job, and a
     * control that hangs off the panel edge would sit on top of the page content.
     */
    <button
      type="button"
      onClick={toggleCollapsed}
      aria-controls="app-sidebar"
      aria-expanded={!collapsed}
      aria-label={label}
      title={label}
      {...tip.handlers}
      className={cn(
        "absolute -right-[14px] top-[62px] z-10 hidden h-7 w-7 items-center justify-center rounded-full",
        "border-[0.5px] border-[rgba(235,238,245,0.4)] bg-[#12304f] text-[#c9d6e8]",
        "shadow-[0_4px_10px_rgba(0,32,102,0.35)] transition-colors hover:bg-[#1b3f66] hover:text-white lg:flex",
      )}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="flex-none"
      >
        <path d={collapsed ? "m9 18 6-6-6-6" : "m15 18-6-6 6-6"} />
      </svg>
      {tip.node}
    </button>
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
