import { scopeHref, type DashboardScope } from "@/lib/dashboard/scope";
import { fundLabel } from "@/lib/finance/funds";
import { writeFilterParams, withScope } from "@/lib/dashboard/filter-params";

/**
 * The scope selectors' options, derived once from a resolved scope.
 *
 * The period is a single `"<fiscalYear>:<period>"` value rather than two selects. A
 * district's periods do not form a grid — FY2026-27 has July and August, FY2025-26 has
 * twelve — so two independent dropdowns would offer combinations that have no data and
 * quietly fall back, which is exactly the silent substitution §8.1 sets out to avoid.
 *
 * `query` is the whole scope — period AND filters — and it is what makes two of the client's
 * requirements fall out of one line rather than needing machinery. An export link carrying
 * it downloads the slice on screen; a nav link carrying it lands the next dashboard on the
 * same slice, which is "applied filters remain in place when the user moves between
 * dashboards".
 *
 * `link` is that second one, for the links INSIDE a page — the KPI tile whose whole card is
 * a "Go to Dashboard", the card footers, the alert group cards. The sidebar has carried the
 * scope since it was built (components/sidebar-nav.tsx), but a reader who has filtered the
 * Executive dashboard to two funds and clicks the Revenues tile is asking the same question
 * of the same slice, and a bare `/revenues` answered it for the whole district instead. Same
 * `withScope` the sidebar uses, so the two cannot drift.
 */
export function scopeOptions(scope: DashboardScope) {
  const periods = scope.available.map((a) => ({
    value: `${a.fiscalYear}:${a.period}`,
    label: `${a.label} · FY ${a.fiscalYear}`,
  }));

  const funds = scope.funds.map((f) => ({ value: f.id, label: fundLabel(f, scope.labelMode) }));

  const params = new URLSearchParams();
  if (scope.fiscalYear) params.set("fy", scope.fiscalYear);
  if (scope.period) params.set("period", String(scope.period));
  // The PRUNED selection, not the raw URL: a link that carries a fund the cascade has
  // already dropped would resurrect it on the next page.
  writeFilterParams(params, scope.filters.selection);
  const qs = params.toString();

  return {
    periods,
    period: `${scope.fiscalYear}:${scope.period}`,
    funds,
    /** Carries the current scope onto an export route, so it exports what is on screen. */
    exportHref: (base: string) => (qs ? `${base}?${qs}` : base),
    /**
     * Carries the current scope onto an in-page link to another dashboard.
     *
     * A no-op on anything that is not a filtered route, so it is safe to wrap a link whose
     * destination is a settings or upload page — and it leaves a parameter the href sets
     * ITSELF alone, so a deep-link that has deliberately chosen a period keeps it.
     */
    link: (href: string) => withScope(href, params),
    query: qs,
  };
}

/**
 * The applied slice, in one line — "Fund Type: General · Fund Code: 1000 — General Fund".
 *
 * Used on the print header and inside the exported workbook, both of which leave the screen
 * that explains them. A PDF in a board packet that says only "May 2026 (FY 2025-26)" while
 * the figures are three special revenue funds is a document nobody can check, and the person
 * reading it in six months will not have the URL.
 */
export function scopeDescription(scope: DashboardScope): string {
  if (!scope.filters.active) return "All funds";
  return scope.filters.chips.map((c) => `${c.dimension}: ${c.values.join(", ")}`).join(" · ");
}

// ===================== naming the fund, on the All Funds view =====================

/**
 * The client, on the All Funds dashboards: "I recommend displaying the Fund Code/Name so
 * users know where the variance originated and can quickly determine where to drill down …
 * This behavior should automatically adjust when a single fund is selected."
 *
 * Both helpers below return `undefined` / `[]` on a single-fund page, so the second half of
 * that request is honoured by construction rather than by each card remembering to check.
 * The link is always to the CURRENT page with the fund selector moved — the drill-down a
 * reader expects is the same screen, narrowed, not a different one.
 */

/** The fund tag on a Top Positive / Negative Variances row. */
export function moverFund(
  scope: DashboardScope,
  base: string,
  fund: { id: string; code: string; name: string } | null | undefined,
): { label: string; href: string } | undefined {
  if (!fund || scope.fundId) return undefined;
  return { label: fundLabel(fund, scope.labelMode), href: scopeHref(base, scope, { fund: fund.id }) };
}

/** The "where to look" chips under an alert. */
export function alertFunds(
  scope: DashboardScope,
  base: string,
  funds: { id: string; code: string; name: string; detail: string }[] | undefined,
): { id: string; code: string; name: string; detail: string; href: string }[] {
  if (!funds || scope.fundId) return [];
  return funds.map((f) => ({ ...f, href: scopeHref(base, scope, { fund: f.id }) }));
}
