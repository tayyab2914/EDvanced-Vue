import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";
import type { TenantDb } from "@/lib/tenant-db";
import { prisma } from "@/lib/db";
import { loadActivityCodes, type ActivityCodes } from "@/lib/finance/transfers";
import { loadPolicy } from "@/lib/policies/load";
import type { PolicyValues } from "@/lib/policies/registry";
import { yearSeries, pointAt, previousPoint, type YearSeries, type PeriodPoint } from "@/lib/finance/series";
import { evaluateAlerts, type AlertReport } from "@/lib/alerts/engine";
import { generalFund, type FundRef } from "@/lib/finance/funds";
import { reservePercent } from "@/lib/finance/fund-balance";
import type { DashboardScope } from "@/lib/dashboard/scope";
import type { DatasetKind } from "@/lib/enums";

/**
 * What every dashboard needs, loaded once.
 *
 * Each page is a Server Component issuing parallel queries, and without a shared core the
 * Executive dashboard alone re-resolves the same version ids and re-reads the same policy a
 * dozen times. Composed naively it issues 80–100 queries; this brings it under twenty, and
 * almost all of them run concurrently.
 *
 * React's `cache()` is NOT the mechanism, deliberately. `tenantDb()` builds a NEW extended
 * client on every call, so a cache keyed on the db argument never hits — the standard
 * Next.js request-dedup trick silently does nothing here. The core is threaded explicitly
 * instead, which is more typing and actually works.
 */

const D = Prisma.Decimal;
const ZERO = new D(0);

export interface DashboardCore {
  scope: DashboardScope;
  series: YearSeries;
  /** The scoped period, or null when it reported nothing. */
  point: PeriodPoint | null;
  /** The most recent earlier period WITH data — not simply `period - 1`. */
  previous: PeriodPoint | null;
  policy: PolicyValues;
  codes: ActivityCodes;
  alerts: AlertReport | null;
  generalFund: FundRef | null;
  /**
   * The reserve, ALWAYS computed against the General Fund — never the page's scope.
   *
   * The workbook is explicit and the schema comment repeats it: "multi-year forecasting
   * and the projected unassigned reserve apply only to the General Fund. When All Funds is
   * selected, the dashboard shows current and projected balances by fund but does not
   * calculate a single combined reserve percentage."
   *
   * Nothing enforced that. With All Funds selected, `reservePercent()` happily divided an
   * all-funds unassigned balance by an all-funds budget and returned a number — which read
   * 5.71% and "Strong" on the Executive dashboard while the General Fund's own reserve was
   * 4.8% and below target. A KPI that flips from Strong to Acceptable depending on a fund
   * selector is worse than no KPI.
   *
   * Null when the district has no fund typed General, which the tile renders as N/A.
   */
  reserve: { percent: Prisma.Decimal | null; unassigned: Prisma.Decimal; budget: Prisma.Decimal } | null;
  /** Current version ids for the scoped period, by dataset. */
  versions: Map<DatasetKind, string>;
}

export async function loadCore(
  db: TenantDb,
  districtId: string,
  scope: DashboardScope,
): Promise<DashboardCore> {
  if (scope.empty) {
    return {
      scope,
      series: {
        fiscalYear: scope.fiscalYear,
        points: [],
        opening: null,
        adoptedExpenditureBudget: ZERO,
        adoptedRevenueBudget: ZERO,
      },
      point: null,
      previous: null,
      policy: await loadPolicy(db, districtId),
      // The activity codes live on the BASE client — they are a platform-managed global
      // list, not district data, so a tenant client would find nothing.
      codes: await loadActivityCodes(prisma),
      alerts: null,
      generalFund: null,
      reserve: null,
      versions: new Map(),
    };
  }

  const [series, policy, codes, gf, versionRows] = await Promise.all([
    yearSeries(db, {
      fiscalYear: scope.fiscalYear,
      fundId: scope.fundId,
      throughPeriod: scope.period,
    }),
    loadPolicy(db, districtId),
    loadActivityCodes(prisma),
    generalFund(db),
    db.datasetVersion.findMany({
      where: { fiscalYear: scope.fiscalYear, isCurrent: true },
      select: { id: true, dataset: true, period: true },
    }),
  ]);

  const versions = new Map<DatasetKind, string>();
  for (const v of versionRows) {
    // Monthly datasets take the scoped period; annual ones carry no period at all.
    if (v.period === scope.period || v.period === null) {
      versions.set(v.dataset as DatasetKind, v.id);
    }
  }

  // Alerts are evaluated last: they need the policy, and they are the one part of the core
  // a page can legitimately do without if it never shows one.
  const alerts = await evaluateAlerts(
    db,
    { districtId, fiscalYear: scope.fiscalYear, period: scope.period, fundId: scope.fundId },
    codes,
  ).catch(() => null);

  // General Fund only, whatever the page is scoped to. See the note on `reserve` above.
  const reserve = gf
    ? await reservePercent(
        db,
        { fiscalYear: scope.fiscalYear, period: scope.period, fundId: gf.id },
        codes,
      )
    : null;

  return {
    scope,
    series,
    point: pointAt(series, scope.period),
    previous: previousPoint(series, scope.period),
    policy,
    codes,
    alerts,
    generalFund: gf,
    reserve,
    versions,
  };
}

// ===================== thresholds, in the shape the ladder wants =====================

/**
 * The district's own thresholds, translated once into the ladder's vocabulary.
 *
 * Every status badge, gauge band and benchmark strip on these dashboards reads one of
 * these. Translating in one place is what stops a screen inventing its own direction — and
 * getting it backwards, which for days-of-cash would paint an empty treasury green.
 */
export function reserveThresholds(policy: PolicyValues) {
  return {
    target: Number(policy.fundBalance.target),
    warning: Number(policy.fundBalance.warning),
    critical: Number(policy.fundBalance.critical),
    direction: "falling" as const,
  };
}

export function forecastReserveThresholds(policy: PolicyValues) {
  return {
    target: Number(policy.fundBalance.target),
    warning: Number(policy.fundBalance.forecastWarning),
    critical: Number(policy.fundBalance.forecastCritical),
    direction: "falling" as const,
  };
}

export function daysCashThresholds(policy: PolicyValues) {
  return {
    warning: Number(policy.cash.daysCashWarning),
    critical: Number(policy.cash.daysCashCritical),
    direction: "falling" as const,
  };
}

export function utilisationThresholds(policy: PolicyValues) {
  return {
    warning: Number(policy.expenditure.utilizationWarning),
    critical: Number(policy.expenditure.utilizationCritical),
    direction: "rising" as const,
  };
}

export function revenueVarianceThresholds(policy: PolicyValues) {
  return {
    warning: Number(policy.revenue.varianceWarning),
    critical: Number(policy.revenue.varianceCritical),
    direction: "rising" as const,
  };
}

export function expenditureForecastThresholds(policy: PolicyValues) {
  return {
    warning: Number(policy.expenditure.forecastVarianceWarning),
    critical: Number(policy.expenditure.forecastVarianceCritical),
    direction: "rising" as const,
  };
}

// ===================== period labels =====================

/** "Jul", "Aug"… for a chart's x-axis, counted from the district's own fiscal start. */
export function periodAxisLabels(scope: DashboardScope, count: number): string[] {
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return Array.from({ length: count }, (_, i) => {
    const month = ((scope.startMonth - 1 + i) % 12) + 1;
    return MONTHS[month - 1];
  });
}
