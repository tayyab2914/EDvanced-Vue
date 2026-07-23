import type { DashboardScope } from "@/lib/dashboard/scope";
import { fundLabel } from "@/lib/finance/funds";

/**
 * The scope selectors' options, derived once from a resolved scope.
 *
 * The period is a single `"<fiscalYear>:<period>"` value rather than two selects. A
 * district's periods do not form a grid — FY2026-27 has July and August, FY2025-26 has
 * twelve — so two independent dropdowns would offer combinations that have no data and
 * quietly fall back, which is exactly the silent substitution §8.1 sets out to avoid.
 */
export function scopeOptions(scope: DashboardScope) {
  const periods = scope.available.map((a) => ({
    value: `${a.fiscalYear}:${a.period}`,
    label: `${a.label} · FY ${a.fiscalYear}`,
  }));

  const funds = scope.funds.map((f) => ({ value: f.id, label: fundLabel(f) }));

  const params = new URLSearchParams();
  if (scope.fiscalYear) params.set("fy", scope.fiscalYear);
  if (scope.period) params.set("period", String(scope.period));
  if (scope.fundId) params.set("fund", scope.fundId);
  const qs = params.toString();

  return {
    periods,
    period: `${scope.fiscalYear}:${scope.period}`,
    funds,
    /** Carries the current scope onto an export route, so it exports what is on screen. */
    exportHref: (base: string) => (qs ? `${base}?${qs}` : base),
    query: qs,
  };
}
