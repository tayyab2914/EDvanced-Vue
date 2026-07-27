/**
 * The sidebar's collapsed/expanded preference.
 *
 * A cookie rather than localStorage — and the difference is visible, not academic. The
 * sidebar is rendered on the server, so a cookie arrives with the request and the very
 * first paint is already the right width. The localStorage equivalent (see
 * components/ui/pagination.tsx, where it is the right call for a select's value) can only
 * be read after hydration, which across a 250px → 68px band means the layout visibly
 * snaps on every single page load.
 *
 * Written client-side on toggle rather than through a Server Function: the preference is
 * not a secret, nothing on the server branches on it beyond this width, and a round-trip
 * would put a network delay in front of a button that should feel instant.
 */
export const SIDEBAR_COOKIE = "edv.sidebar";

const COLLAPSED = "collapsed";
const EXPANDED = "expanded";

/** A year. "When they return" is not "for this session". */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Anything other than the collapsed marker — absent, stale, junk — means expanded. */
export function isCollapsedPreference(value: string | undefined): boolean {
  return value === COLLAPSED;
}

/** Serialises the preference for `document.cookie`. Client-side only. */
export function sidebarCookie(collapsed: boolean): string {
  const secure =
    typeof location !== "undefined" && location.protocol === "https:"
      ? "; secure"
      : "";
  return `${SIDEBAR_COOKIE}=${collapsed ? COLLAPSED : EXPANDED}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax${secure}`;
}
