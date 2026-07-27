import type { TenantDb } from "@/lib/tenant-db";
import { listFunds, generalFund, type FundRef } from "@/lib/finance/funds";
import { periodLabel, periodToMonth, MONTH_NAMES, parseFiscalYear } from "@/lib/periods/fiscal";
import { PeriodType } from "@/lib/enums";
import { ALL, soleFundId, narrowsCostCenter, type FinanceFilter } from "@/lib/finance/filter";
import {
  parseFilterParams,
  writeFilterParams,
  EMPTY_SELECTION,
  type FilterSearchParams,
} from "@/lib/dashboard/filter-params";
import {
  loadFilterMasterData,
  dataPresence,
  resolveFilters,
  type ResolvedFilters,
} from "@/lib/dashboard/filter-options";
import { DEFAULT_LABEL_MODE, type LabelMode } from "@/lib/text";

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

/**
 * The URL, as the resolver reads it.
 *
 * `fy` and `period` name the reporting period; everything else is a filter and is parsed by
 * lib/dashboard/filter-params.ts. `fund` (singular) is the pre-multi-select parameter, still
 * read so existing bookmarks and export links resolve to the same slice they always did.
 */
export type ScopeParams = FilterSearchParams;

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
  /**
   * The one selected fund, when EXACTLY one is selected. Undefined for All Funds and
   * undefined for several — see `soleFundId` in lib/finance/filter.ts for why "several" must
   * not fall through to the single-fund path.
   *
   * Kept because a page legitimately reads it for prose ("General Fund only") and for the
   * per-fund controls that have no meaning across a set: the fund-balance override corrects
   * one fund's figure, and the forecast projects one fund's balance.
   */
  fundId?: string;
  fund?: FundRef;
  /**
   * The slice every figure on the page is computed over. Hand this to the engines.
   */
  filter: FinanceFilter;
  /** The filter bar's state: option lists, what is applied, and the cascade already run. */
  filters: ResolvedFilters;
  /**
   * True when a cost-centre filter is applied, which the cash and fund-balance tables cannot
   * honour — they carry no cost centre (see lib/finance/filter.ts).
   *
   * The page must SAY so beside those figures rather than let a reader assume the whole
   * screen moved together. `<FundLevelOnly>` in components/dashboard/shared.tsx is the badge;
   * this is the flag that turns it on. Same principle as `substituted` below: the platform
   * does not quietly show one thing while the controls claim another.
   */
  fundLevelOnly: boolean;
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
  /**
   * How much of a dimension this reader wants to see — Codes Only, Names Only, or both.
   *
   * Carried on the scope so that anything already holding one can label a fund without a
   * second parameter of its own: `scopeOptions`, the mover tags, the alert chips. It is not
   * part of "what slice is on screen" like everything above it, but it travels to exactly
   * the same places, and a separate prop threaded beside `scope` through every one of them
   * would be the same value with more chances to be forgotten.
   */
  labelMode: LabelMode;
}

/** The datasets whose presence means "this period has data a dashboard can show". */
const MONTHLY = ["REVENUE_DETAIL", "EXPENDITURE_DETAIL", "CASH_POSITION"] as const;

export async function resolveScope(
  db: TenantDb,
  districtId: string,
  params: ScopeParams,
  /**
   * The reader's Codes / Names setting, from lib/dashboard/label-mode.ts.
   *
   * A PARAMETER, not a cookie read in here. This function is called by the verify scripts
   * too (scripts/verify-dashboard.mts, scripts/verify-queries.mts), which run outside a
   * request where `cookies()` throws — and a display preference is not worth making the
   * whole scope resolver unusable off a request.
   */
  mode: LabelMode = DEFAULT_LABEL_MODE,
): Promise<DashboardScope> {
  const [district, versions, funds, general, master] = await Promise.all([
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
    // The filter bar's option lists. In this wave rather than after the period is
    // resolved, because none of them depends on the period — only their `hasData` marks
    // do, and those come from `dataPresence` below.
    loadFilterMasterData(db),
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
  const raw = parseFilterParams(params);

  if (available.length === 0) {
    // Nothing committed. The page shows an empty state pointing at the upload screen —
    // never a grid of zeros, which reads as "your district has no money".
    //
    // The filter bar still resolves, against empty presence sets: with no data every option
    // is greyed, which is a truer empty state than a bar with no controls in it.
    const filters = resolveFilters(
      master,
      { funds: new Set<string>(), costCenters: new Set<string>() },
      EMPTY_SELECTION,
      mode,
    );
    return {
      fiscalYear: params.fy ? String(params.fy) : "",
      period: 0,
      fundId: undefined,
      fund: undefined,
      filter: ALL,
      filters,
      fundLevelOnly: false,
      generalFund: general,
      startMonth,
      label: "No data",
      dataAsOf: null,
      available,
      fiscalYears,
      funds,
      empty: true,
      substituted: null,
      labelMode: mode,
    };
  }

  // What the URL asked for, if anything.
  const askedFy = params.fy ? String(params.fy) : undefined;
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

  /**
   * The filter resolves against the period that was CHOSEN, not the one that was asked for.
   *
   * It has to be this way round: `hasData` marks which funds the period on screen actually
   * reported, and marking them against a period the user was silently moved off would grey
   * the wrong half of the list. It costs one extra round trip after the period is settled,
   * which is why `dataPresence` answers both dimensions in three queries rather than five.
   */
  const presence = await dataPresence(db, chosen.fiscalYear, chosen.period);
  const filters = resolveFilters(master, presence, raw, mode);

  const sole = soleFundId(filters.filter);
  const fund = sole ? funds.find((f) => f.id === sole) : undefined;

  return {
    fiscalYear: chosen.fiscalYear,
    period: chosen.period,
    // Only when the selection resolves to one fund AND that fund is one the district has.
    // A URL naming another district's fund id resolves to nothing here rather than to a
    // fund-scoped page with no fund behind it.
    fundId: fund?.id,
    fund,
    filter: filters.filter,
    filters,
    fundLevelOnly: narrowsCostCenter(filters.filter),
    generalFund: general,
    startMonth,
    label: `${chosen.label} (FY ${chosen.fiscalYear})`,
    dataAsOf: endOfPeriod(chosen.fiscalYear, chosen.period, startMonth),
    available,
    fiscalYears,
    funds,
    empty: false,
    substituted,
    labelMode: mode,
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

/**
 * Rebuilds the query string for a scope change, preserving what the user did not touch.
 *
 * WHAT A FUND DRILL-DOWN CLEARS, AND WHY. Passing `{ fund: id }` sets the fund selection to
 * that one fund AND clears the Fund Type selection. It has to clear it: drilling from a
 * mover row into fund 1000 while "Special Revenue" is ticked would hand the cascade a fund
 * its own type filter excludes, and the cascade — correctly — would prune the drill-down
 * away and land the reader back on the list they clicked out of.
 *
 * Cost-centre selections are kept. Narrowing to one fund inside a department is a narrowing
 * a reader asked for twice, and dropping half of it on a drill-down would be answering a
 * question they did not ask.
 */
export function scopeHref(
  base: string,
  scope: DashboardScope,
  change: Partial<{ fy: string; period: number; fund: string | null }>,
): string {
  const p = new URLSearchParams();
  const fy = change.fy ?? scope.fiscalYear;
  const period = change.period ?? scope.period;

  if (fy) p.set("fy", fy);
  if (period) p.set("period", String(period));

  const selection = scope.filters.selection;
  const drilled = change.fund !== undefined;
  const drilledTo = change.fund ? [change.fund] : [];

  writeFilterParams(p, {
    ...selection,
    fundTypeIds: drilled ? [] : selection.fundTypeIds,
    fundIds: drilled ? drilledTo : selection.fundIds,
  });

  const qs = p.toString();
  return qs ? `${base}?${qs}` : base;
}
