"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/components/icons";
import { useRailTip, useShell } from "@/components/sidebar-shell";
import { withScope } from "@/lib/dashboard/filter-params";

export interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  exact?: boolean;
  /**
   * Second-level destinations, revealed only while this branch is the one being read.
   *
   * Deliberately one level deep and deliberately not collapsible by hand: the rail is a
   * map of where you are, and a tree the reader has to curate is a second thing to manage
   * on the way to the thing they wanted. See `branchActive` for what "being read" means.
   */
  children?: NavItem[];
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

/** Does this item's own route match? Sub-routes count unless the item asked for `exact`. */
function isActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * The active-row glow.
 *
 * A blurred green ellipse bled across the row behind its content — the redesign's one piece
 * of decoration, and the thing that marks the current page at a glance from the far side of
 * a desk. It is `aria-hidden` and sits under the label: `aria-current="page"` on the link is
 * what actually carries "you are here" to a reader who cannot see it.
 *
 * Clipped by the row's own `overflow-hidden`, which is why the row rounds its corners rather
 * than the glow trying to.
 */
function ActiveGlow() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 h-[56px] w-[293px] -translate-x-1/2 -translate-y-1/2 opacity-[0.48] blur-[20px]"
      style={{
        background:
          "radial-gradient(closest-side, rgba(139,204,162,1) 0%, rgba(99,184,115,0.5) 50%, rgba(59,163,67,0) 100%)",
      }}
    />
  );
}

function NavLink({
  item,
  active,
  expandable,
  collapsed,
  onNavigate,
  href,
}: {
  item: NavItem;
  active: boolean;
  /** Draws the disclosure chevron — this branch has children and they are on screen. */
  expandable: boolean;
  collapsed: boolean;
  onNavigate: () => void;
  href: string;
}) {
  const tip = useRailTip(item.label, collapsed);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      // The icon alone is not a name, so the accessible name has to come from somewhere
      // other than the (visually hidden) text once the rail is collapsed.
      aria-label={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      {...tip.handlers}
      className={cn(
        "relative flex items-center gap-4 overflow-hidden rounded-xl px-5 py-4 text-[14px] transition-colors",
        collapsed && "lg:justify-center lg:gap-0 lg:px-0",
        active
          ? "border-[0.5px] border-[rgba(235,245,238,0.16)] bg-white/4 text-white"
          : "text-white/56 hover:bg-white/6 hover:text-white",
      )}
    >
      {active && <ActiveGlow />}
      <span className="relative flex-none">
        <Icon name={item.icon} size={22} />
      </span>
      {/* Only `lg:hidden` — the mobile drawer is always full width and keeps its labels. */}
      <span className={cn("relative min-w-0 flex-1 truncate", collapsed && "lg:hidden")}>
        {item.label}
      </span>
      {expandable && !collapsed && (
        <svg
          aria-hidden
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="relative flex-none opacity-70"
        >
          <path d="m18 15-6-6-6 6" />
        </svg>
      )}
      {tip.node}
    </Link>
  );
}

/**
 * The second level, drawn as a tree hanging off its parent's icon.
 *
 * The spine is CSS rather than the exported bracket from the design: the asset is a fixed
 * 110px tall for exactly three children, and this list is built from permissions — a user
 * who cannot see Financial Policies gets two. A drawn rule that stops `18px` short of the
 * bottom lands on the last row's centre for any count, which a fixed-height SVG cannot.
 *
 * That 18px is half a row (`py-2` + a 20px line box), so it moves if the row padding does.
 */
function NavChildren({
  items,
  pathname,
  params,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  params: ReadonlyURLSearchParams;
  onNavigate: () => void;
}) {
  return (
    <div className="relative ml-[31px] flex flex-col gap-2 py-1 pl-[15px]">
      <span
        aria-hidden
        className="absolute bottom-[18px] left-0 top-0 w-px bg-white/18"
      />
      {items.map((child) => {
        const active = isActive(child, pathname);
        return (
          <Link
            key={child.href}
            href={withScope(child.href, params)}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative rounded-md px-3.5 py-2 text-[12px] leading-5 transition-colors",
              "before:absolute before:-left-[15px] before:top-1/2 before:h-px before:w-[11px] before:bg-white/18 before:content-['']",
              active
                ? "bg-white/6 text-white"
                : "text-white/56 hover:bg-white/4 hover:text-white",
            )}
          >
            {child.label}
          </Link>
        );
      })}
    </div>
  );
}

export function SidebarNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  /**
   * The dashboards' scope, carried between them.
   *
   * "Applied filters remaining in place when the user moves between dashboards" — and this
   * is the whole implementation, because the URL is the only copy of the filter (see
   * lib/dashboard/filter-params.ts). There is no store to keep in step and nothing to clear
   * on logout; a nav link just points at the same slice on the next screen.
   *
   * `withScope` leaves every non-dashboard route alone, and the ACTIVE test still runs on
   * the bare pathname — a link that now carries a query string must not stop looking
   * selected because of it.
   */
  const params = useSearchParams();
  // Navigating to the current route fires no pathname change, so the drawer
  // has to be dismissed on the click itself.
  const { closeSidebar, collapsed } = useShell();
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-3.5">
      {groups.map((group, gi) => (
        <div key={gi} className={gi ? "mt-4" : ""}>
          {group.label && (
            <div
              className={cn(
                "px-5 pb-1 pt-1.5 text-[11px] uppercase leading-[22px] tracking-[0.4px] text-white/40",
                collapsed && "lg:hidden",
              )}
            >
              {group.label}
            </div>
          )}
          {/* A rule stands in for the heading on the rail, so the groups do not run
              together into one undifferentiated column of icons. */}
          {collapsed && gi > 0 && (
            <div
              aria-hidden="true"
              className="mx-2.5 mb-2.5 hidden border-t border-white/9 lg:block"
            />
          )}
          {group.items.map((item) => {
            const active = isActive(item, pathname);
            /**
             * The branch opens when you are anywhere inside it — on the parent route or on
             * any child's. Testing the children separately matters for a parent marked
             * `exact`: `/fund-balance` would otherwise close its own tree the moment you
             * followed one of its links.
             */
            const branchActive =
              !!item.children?.length &&
              (active || item.children.some((c) => isActive(c, pathname)));
            return (
              <div key={item.href} className="mb-0.5">
                <NavLink
                  item={item}
                  href={withScope(item.href, params)}
                  collapsed={collapsed}
                  onNavigate={closeSidebar}
                  active={active}
                  expandable={branchActive}
                />
                {/* Never on the rail: 12px labels indented 46px into a 68px column are not
                    a readable tree, and the parent icon is still there to click. */}
                {branchActive && !collapsed && (
                  <NavChildren
                    items={item.children!}
                    pathname={pathname}
                    params={params}
                    onNavigate={closeSidebar}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
