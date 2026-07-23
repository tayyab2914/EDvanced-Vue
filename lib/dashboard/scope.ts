import type { TenantDb } from "@/lib/tenant-db";
import { listFunds, generalFund, type FundRef } from "@/lib/finance/funds";
import { periodLabel, periodToMonth, MONTH_NAMES, parseFiscalYear } from "@/lib/periods/fiscal";
import { PeriodType } from "@/lib/enums";

/**
 * What fiscal year, period and fund a dashboard is looking at.
 *
 * One resolver, read by every dashboard, because otherwise five pages each invent their
 * own idea of "the latest period" and the Executive summary quietly disagrees with the
 * Revenue detail it links to.
 *
 * THE FALLBACK IS DELIBERATELY LOUD. The data-browse page silently substitutes a different
 * period when the URL names one with no data, which is fine for a data browser. On an
 * executive dashboard it is a trust problem: a superintendent who bookmarked "March" and
 * is shown May without being told has been misled. So a substitution is recorded in
 * `substituted` and the page says so.
 */

export interface ScopeParams {
  fy?: string;
  period?: string;
  fund?: string;
}

export interface AvailablePeriod {
  fiscalYear: string;
  period: number;
  /** "May 2026" — the calendar month, which is how a district talks about it. */
  label: string;
  /** "May (Period 11)" — the product's own phrasing, matching the upload screen. */
  longLabel: string;
}

export interface DashboardScope {
  fiscalYear: string;
  period: number;
  /** Undefined means All Funds. */
  fundId?: string;
  fund?: FundRef;
  /** The district's General Fund, for the reserve figures that are General-Fund-only. */
  generalFund: FundRef | null;

  startMonth: number;
  /** "May 2026 (FY 2025-26)" — the period selector's own label. */
  label: string;
  /** The last day of the scoped period — the "Data as of" line. */
  dataAsOf: Date | null;

  /** Every period with committed monthly data, newest first. The period picker. */
  available: AvailablePeriod[];
  fiscalYears: string[];
  funds: FundRef[];

  /** True when the district has committed nothing at all — the page shows an empty state. */
  empty: boolean;
  /**
   * Set when the URL asked for a period that has no data and a different one was shown.
   * The page must surface this rather than swapping silently.
   */
  substituted: { asked: string; showing: string } | null;
}

/** The datasets whose presence means "this period has data a dashboard can show". */
const MONTHLY = ["REVENUE_DETAIL", "EXPENDITURE_DETAIL", "CASH_POSITION"] as const;

export async function resolveScope(
  db: TenantDb,
  districtId: string,
  params: ScopeParams,
): Promise<DashboardScope> {
  const [district, versions, funds, general] = await Promise.all([
    db.district.findFirst({
      where: { id: districtId },
      select: { fiscalYearStartMonth: true },
    }),
    // Every committed monthly period, in one query. No period filter — see
    // lib/finance/series.ts for why that omission is the point.
    db.datasetVersion.findMany({
      where: { isCurrent: true, dataset: { in: [...MONTHLY] }, period: { not: null } },
      select: { fiscalYear: true, period: true },
      orderBy: [{ fiscalYear: "desc" }, { period: "desc" }],
    }),
    listFunds(db),
    generalFund(db),
  ]);

  const startMonth = district?.fiscalYearStartMonth ?? 7;

  // Distinct (fy, period), newest first. Three datasets can each contribute the same
  // period, and the picker must not show May three times.
  const seen = new Set<string>();
  const available: AvailablePeriod[] = [];
  for (const v of versions) {
    if (v.period === null) continue;
    const key = `${v.fiscalYear}:${v.period}`;
    if (seen.has(key)) continue;
    seen.add(key);
    available.push({
      fiscalYear: v.fiscalYear,
      period: v.period,
      label: calendarLabel(v.fiscalYear, v.period, startMonth),
      longLabel: periodLabel(PeriodType.MONTHLY, v.period, startMonth),
    });
  }

  const fiscalYears = [...new Set(available.map((a) => a.fiscalYear))];

  const fund = params.fund ? funds.find((f) => f.id === params.fund) : undefined;

  if (available.length === 0) {
    // Nothing committed. The page shows an empty state pointing at the upload screen —
    // never a grid of zeros, which reads as "your district has no money".
    return {
      fiscalYear: params.fy ?? "",
      period: 0,
      fundId: fund?.id,
      fund,
      generalFund: general,
      startMonth,
      label: "No data",
      dataAsOf: null,
      available,
      fiscalYears,
      funds,
      empty: true,
      substituted: null,
    };
  }

  // What the URL asked for, if anything.
  const askedFy = params.fy;
  const askedPeriod = params.period ? Number(params.period) : undefined;

  const exact =
    askedFy && askedPeriod
      ? available.find((a) => a.fiscalYear === askedFy && a.period === askedPeriod)
      : undefined;

  // Falling back one level at a time: the exact period, then the latest in the year they
  // asked for, then the latest overall.
  const chosen =
    exact ?? (askedFy ? available.find((a) => a.fiscalYear === askedFy) : undefined) ?? available[0];

  const askedSomething = Boolean(askedFy || askedPeriod);
  const substituted =
    askedSomething && !exact
      ? {
          asked:
            askedFy && askedPeriod
              ? `${calendarLabel(askedFy, askedPeriod, startMonth)}`
              : (askedFy ?? ""),
          showing: chosen.label,
        }
      : null;

  return {
    fiscalYear: chosen.fiscalYear,
    period: chosen.period,
    fundId: fund?.id,
    fund,
    generalFund: general,
    startMonth,
    label: `${chosen.label} (FY ${chosen.fiscalYear})`,
    dataAsOf: endOfPeriod(chosen.fiscalYear, chosen.period, startMonth),
    available,
    fiscalYears,
    funds,
    empty: false,
    substituted,
  };
}

/** "May 2026" — the calendar month a period lands on, with its real calendar year. */
function calendarLabel(fiscalYear: string, period: number, startMonth: number): string {
  const fy = parseFiscalYear(fiscalYear);
  const month = periodToMonth(period, startMonth);
  if (!fy) return `${MONTH_NAMES[month - 1]}`;
  const year = month >= startMonth ? fy.startYear : fy.endYear;
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/**
 * The last day of the scoped period — what "Data as of" means.
 *
 * Not `committedAt`. A district that uploads April's figures in June is looking at April's
 * position, and stamping the page with the upload date would date the numbers wrongly.
 */
function endOfPeriod(fiscalYear: string, period: number, startMonth: number): Date | null {
  const fy = parseFiscalYear(fiscalYear);
  if (!fy) return null;
  const month = periodToMonth(period, startMonth);
  const year = month >= startMonth ? fy.startYear : fy.endYear;
  // Day 0 of the next month is the last day of this one, leap years included.
  return new Date(Date.UTC(year, month, 0));
}

/** Rebuilds the query string for a scope change, preserving what the user did not touch. */
export function scopeHref(
  base: string,
  scope: DashboardScope,
  change: Partial<{ fy: string; period: number; fund: string | null }>,
): string {
  const p = new URLSearchParams();
  const fy = change.fy ?? scope.fiscalYear;
  const period = change.period ?? scope.period;
  const fund = change.fund === null ? undefined : (change.fund ?? scope.fundId);

  if (fy) p.set("fy", fy);
  if (period) p.set("period", String(period));
  if (fund) p.set("fund", fund);

  const qs = p.toString();
  return qs ? `${base}?${qs}` : base;
}
