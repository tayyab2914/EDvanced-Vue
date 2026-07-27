import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { resolveLabelMode, type LabelMode } from "@/lib/text";

/**
 * Which half of a dimension a reader wants to see — Codes Only, Names Only, or both.
 *
 * ---------------------------------------------------------------------------
 * WHY A COOKIE, AND NOT THE THREE OTHER PLACES THIS COULD HAVE LIVED
 *
 * A URL PARAMETER. Every other display decision on these dashboards is one — the period,
 * the fund, the filters, the "view by" — because each of those changes WHICH FIGURES are on
 * screen, so a link has to carry them or it means something different to whoever opens it.
 * This changes no figure. Putting it in the URL would attach one person's reading
 * preference to every link they paste, every saved view, and every export, and would
 * silently reformat a colleague's screen.
 *
 * THE USER ROW. It would need a migration, a write on every toggle, and a query on every
 * render of every page — and the memory of what a person likes to read is exactly what a
 * browser is for. It also has to work before the first paint, which a database read does
 * not: see below.
 *
 * LOCALSTORAGE. Read only in the browser, so the server would render Codes + Names and the
 * client would rewrite it — a flash of the wrong label on every navigation, on every table
 * and chart at once. Worse, these pages are server-rendered so they can be printed to PDF
 * (see the note in lib/dashboard/view.ts), and a preference the server cannot see would not
 * reach the paper.
 *
 * A cookie is read on the server, before anything renders, and it survives the print.
 * ---------------------------------------------------------------------------
 *
 * Memoized per request via React.cache, matching lib/auth/dal.ts. It costs no query, and
 * every page reads it once however many tables and charts it draws.
 */

export const LABEL_MODE_COOKIE = "labels";

/** A year. Long enough that a district is never asked to set it twice. */
export const LABEL_MODE_MAX_AGE = 365 * 24 * 60 * 60;

/**
 * The reader's setting, or the client's recommended default when they have never touched it.
 *
 * Never throws and never falls back silently in a way that matters: an unrecognised value is
 * Codes + Names, which is what an unset cookie gives too.
 */
export const labelMode = cache(async (): Promise<LabelMode> => {
  const store = await cookies();
  return resolveLabelMode(store.get(LABEL_MODE_COOKIE)?.value);
});
