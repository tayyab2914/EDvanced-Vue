import { Prisma } from "@/lib/generated/prisma/client";
import type { TenantDb } from "@/lib/tenant-db";
import type { ActivityCodes } from "@/lib/finance/transfers";
import { matches, codesKey } from "@/lib/finance/transfers";
import { currentVersionIds, currentVersionsForYear, adoptedBudget } from "@/lib/finance/versions";
import { memo, dbKey } from "@/lib/request-cache";
import {
  detailWhere,
  fundWhere,
  filterKey,
  type FinanceFilter,
} from "@/lib/finance/filter";

/**
 * The Financial Activity Engine: the numbers the platform works out rather than asking a
 * district to send.
 *
 * Derived at read, not materialised. The aggregates are sums over indexed rows, and the
 * output is a few hundred figures per district-year at the fund grain — cheap enough that
 * a cache would only be a second place for the truth to live.
 *
 * Read-through memoisation is a different thing and this module does use it: within ONE
 * render the same district's same period is asked for five or six times by five or six
 * callers, and repeating the round trip is not "not caching", it is just slow. See
 * lib/request-cache.ts for why the answer cannot go stale.
 *
 * Decimal throughout. 0.1 + 0.2 in a reserve calculation is how a district stops trusting
 * the platform.
 */

const D = Prisma.Decimal;
const ZERO = new D(0);

// Re-exported from their own module so the engine and the trend series can share one
// lookup instead of issuing two queries for the same fact. See lib/finance/versions.ts.
export { currentVersionIds, currentVersionsForYear, adoptedBudget };

/**
 * Every revenue source / object code the district has, by id.
 *
 * The classification is by CODE, but the periodic rows reference master data by id — so
 * the codes are turned into ids once rather than joining and range-matching per row. A
 * district has tens of revenue sources and hundreds of objects; this is two small queries,
 * and memoised because five callers per render want the same two lists.
 */
const masterCodes = memo(
  "masterCodes",
  (db: TenantDb) => dbKey(db),
  async (
    db: TenantDb,
  ): Promise<{
    sources: { id: string; code: string }[];
    objects: { id: string; code: string }[];
  }> => {
    const [sources, objects] = await Promise.all([
      db.revenueSource.findMany({ select: { id: true, code: true } }),
      db.accountObject.findMany({ select: { id: true, code: true } }),
    ]);
    return { sources, objects };
  },
);

/** Which revenue sources / objects carry transfers, as ids. */
export async function transferIds(
  db: TenantDb,
  codes: ActivityCodes,
): Promise<{ transfersIn: string[]; otherFinancing: string[]; transfersOut: string[] }> {
  const { sources, objects } = await masterCodes(db);

  return {
    transfersIn: sources.filter((s) => matches(codes.transfersIn, s.code)).map((s) => s.id),
    otherFinancing: sources
      .filter((s) => matches(codes.otherFinancing, s.code))
      .map((s) => s.id),
    transfersOut: objects.filter((o) => matches(codes.transfersOut, o.code)).map((o) => o.id),
  };
}

export interface PeriodScope {
  fiscalYear: string;
  period: number;
  /**
   * What slice of the ledger to sum. Omit for the whole district.
   *
   * Was `fundId?: string` — one fund or all of them. A finance officer comparing three
   * special revenue funds needs a SET, and a single id cannot express one. See
   * lib/finance/filter.ts, particularly on why an empty selection is not the same as no
   * selection.
   */
  filter?: FinanceFilter;
}

export interface ActivityTotals {
  /** Revenue that is NOT a transfer or other financing source. */
  operatingRevenueYtd: Prisma.Decimal;
  transfersInYtd: Prisma.Decimal;
  otherFinancingYtd: Prisma.Decimal;
  /** Spending that is NOT a transfer out. */
  operatingExpenditureYtd: Prisma.Decimal;
  transfersOutYtd: Prisma.Decimal;
  /** Every revenue row, transfers included. */
  totalRevenueYtd: Prisma.Decimal;
  /** Every expenditure row, transfers included. */
  totalExpenditureYtd: Prisma.Decimal;
  /**
   * THIS MONTH alone.
   *
   * Month-over-month comparisons need these, not the YTD figures: year-to-date only ever
   * rises, so comparing one month's YTD to the last would report growth every month of
   * the year and mean nothing.
   */
  totalRevenueMtd: Prisma.Decimal;
  totalExpenditureMtd: Prisma.Decimal;
}

/**
 * Sums the period's activity, split by whether it is operating money or a transfer.
 *
 * The split only affects the OPERATING figures — see the note on computeFundBalance about
 * why the balance itself does not care.
 */
export const activityTotals = memo(
  "activityTotals",
  (db: TenantDb, scope: PeriodScope, codes: ActivityCodes) => {
    const k = dbKey(db);
    return k === null
      ? null
      : `${k}|${scope.fiscalYear}|${scope.period}|${filterKey(scope.filter)}|${codesKey(codes)}`;
  },
  async (db: TenantDb, scope: PeriodScope, codes: ActivityCodes): Promise<ActivityTotals> => {
    const [versions, ids] = await Promise.all([
      currentVersionIds(db, { fiscalYear: scope.fiscalYear, period: scope.period }),
      transferIds(db, codes),
    ]);
    const revVersion = versions.get("REVENUE_DETAIL");
    const expVersion = versions.get("EXPENDITURE_DETAIL");

    const slice = detailWhere(scope.filter);

    /**
     * ONE grouped aggregate per file, split in memory — not five filtered SUMs.
     *
     * The totals and the transfer subsets are the same rows read twice, and asking the
     * database to add them up again per class cost three extra round trips for arithmetic
     * that is free here. A version has tens of revenue sources and a few hundred objects,
     * so the grouped result is a small payload, and Decimal addition is exact — the split
     * cannot disagree with the total because the total is the sum of the same rows.
     */
    const [revRows, expRows] = await Promise.all([
      revVersion
        ? db.revenueActual.groupBy({
            by: ["revenueSourceId"],
            where: { versionId: revVersion, ...slice },
            _sum: { actualYtd: true, actualMtd: true },
          })
        : Promise.resolve([]),

      expVersion
        ? db.expenditureActual.groupBy({
            by: ["objectId"],
            where: { versionId: expVersion, ...slice },
            _sum: { actualYtd: true, actualMtd: true },
          })
        : Promise.resolve([]),
    ]);

    const transfersInIds = new Set(ids.transfersIn);
    const otherFinancingIds = new Set(ids.otherFinancing);
    const transfersOutIds = new Set(ids.transfersOut);

    let revenueYtd = ZERO;
    let revenueMtd = ZERO;
    let transfersInYtd = ZERO;
    let otherFinancingYtd = ZERO;
    for (const r of revRows) {
      const ytd = r._sum.actualYtd ?? ZERO;
      revenueYtd = revenueYtd.plus(ytd);
      revenueMtd = revenueMtd.plus(r._sum.actualMtd ?? ZERO);
      if (transfersInIds.has(r.revenueSourceId)) transfersInYtd = transfersInYtd.plus(ytd);
      if (otherFinancingIds.has(r.revenueSourceId)) otherFinancingYtd = otherFinancingYtd.plus(ytd);
    }

    let expenditureYtd = ZERO;
    let expenditureMtd = ZERO;
    let transfersOutYtd = ZERO;
    for (const e of expRows) {
      const ytd = e._sum.actualYtd ?? ZERO;
      expenditureYtd = expenditureYtd.plus(ytd);
      expenditureMtd = expenditureMtd.plus(e._sum.actualMtd ?? ZERO);
      if (transfersOutIds.has(e.objectId)) transfersOutYtd = transfersOutYtd.plus(ytd);
    }

    return {
      totalRevenueYtd: revenueYtd,
      transfersInYtd,
      otherFinancingYtd,
      // Subtracted rather than filtered with NOT IN: same answer, and it cannot drift from
      // the totals above.
      operatingRevenueYtd: revenueYtd.minus(transfersInYtd).minus(otherFinancingYtd),
      totalExpenditureYtd: expenditureYtd,
      transfersOutYtd,
      operatingExpenditureYtd: expenditureYtd.minus(transfersOutYtd),
      totalRevenueMtd: revenueMtd,
      totalExpenditureMtd: expenditureMtd,
    };
  },
);

/**
 * Net Operating Surplus (Deficit) = Revenue YTD − Expenditure YTD, EXCLUDING transfers.
 *
 * This is the figure that genuinely needs the classification. Without it, money a district
 * moved between its own funds reads as though it earned or spent it, and a fund that is
 * simply being topped up looks like it is running a surplus.
 */
export function netOperatingSurplus(t: ActivityTotals): Prisma.Decimal {
  return t.operatingRevenueYtd.minus(t.operatingExpenditureYtd);
}

/** Beginning fund balance for the year — the annual Opening Fund Balance import. */
export const beginningFundBalance = memo(
  "beginningFundBalance",
  (db: TenantDb, args: { fiscalYear: string; filter?: FinanceFilter }) => {
    const k = dbKey(db);
    return k === null ? null : `${k}|${args.fiscalYear}|${filterKey(args.filter)}`;
  },
  async (
    db: TenantDb,
    args: { fiscalYear: string; filter?: FinanceFilter },
  ): Promise<{ total: Prisma.Decimal; unassigned: Prisma.Decimal; found: boolean }> => {
    const versions = await currentVersionIds(db, {
      fiscalYear: args.fiscalYear,
      period: null, // annual
    });
    const versionId = versions.get("OPENING_FUND_BALANCE");
    if (!versionId) return { total: ZERO, unassigned: ZERO, found: false };

    const r = await db.openingFundBalance.aggregate({
      // Fund grain only — an opening fund balance has no cost centre to narrow by.
      where: { versionId, ...fundWhere(args.filter) },
      _sum: { begTotal: true, begUnassigned: true },
    });

    return {
      total: r._sum.begTotal ?? ZERO,
      unassigned: r._sum.begUnassigned ?? ZERO,
      found: r._sum.begTotal !== null,
    };
  },
);

/**
 * The year's opening fund balance broken into its four designated components.
 *
 * `beginningFundBalance` returns the total and the unassigned share, which is all the
 * reserve KPI needs. The Forecasting & Planning screen needs the components themselves —
 * they are what the multi-year table subtracts, and what the district sets a forecast
 * method against per component.
 *
 * Zeroes rather than nulls when a component column was left empty on the import: the four
 * are optional on the file precisely because many districts report only unassigned, and a
 * blank column there means "nothing designated", not "unknown".
 */
export const beginningComponents = memo(
  "beginningComponents",
  (db: TenantDb, args: { fiscalYear: string; filter?: FinanceFilter }) => {
    const k = dbKey(db);
    return k === null ? null : `${k}|${args.fiscalYear}|${filterKey(args.filter)}`;
  },
  async (
    db: TenantDb,
    args: { fiscalYear: string; filter?: FinanceFilter },
  ): Promise<{
    nonspendable: Prisma.Decimal;
    restricted: Prisma.Decimal;
    committed: Prisma.Decimal;
    assigned: Prisma.Decimal;
    unassigned: Prisma.Decimal;
    total: Prisma.Decimal;
    found: boolean;
  }> => {
    const versions = await currentVersionIds(db, { fiscalYear: args.fiscalYear, period: null });
    const versionId = versions.get("OPENING_FUND_BALANCE");
    const empty = {
      nonspendable: ZERO,
      restricted: ZERO,
      committed: ZERO,
      assigned: ZERO,
      unassigned: ZERO,
      total: ZERO,
      found: false,
    };
    if (!versionId) return empty;

    const r = await db.openingFundBalance.aggregate({
      where: { versionId, ...fundWhere(args.filter) },
      _sum: {
        begNonspendable: true,
        begRestricted: true,
        begCommitted: true,
        begAssigned: true,
        begUnassigned: true,
        begTotal: true,
      },
    });

    if (r._sum.begTotal === null) return empty;

    return {
      nonspendable: r._sum.begNonspendable ?? ZERO,
      restricted: r._sum.begRestricted ?? ZERO,
      committed: r._sum.begCommitted ?? ZERO,
      assigned: r._sum.begAssigned ?? ZERO,
      unassigned: r._sum.begUnassigned ?? ZERO,
      total: r._sum.begTotal,
      found: true,
    };
  },
);

/** Ending cash for the period, from the Cash Position import. */
export const endingCash = memo(
  "endingCash",
  (db: TenantDb, scope: PeriodScope) => {
    const k = dbKey(db);
    return k === null ? null : `${k}|${scope.fiscalYear}|${scope.period}|${filterKey(scope.filter)}`;
  },
  async (db: TenantDb, scope: PeriodScope): Promise<{ total: Prisma.Decimal; found: boolean }> => {
    const versions = await currentVersionIds(db, {
      fiscalYear: scope.fiscalYear,
      period: scope.period,
    });
    const versionId = versions.get("CASH_POSITION");
    if (!versionId) return { total: ZERO, found: false };

    const r = await db.cashPosition.aggregate({
      // Cash is tracked per fund and nothing finer; a cost-centre narrowing is dropped
      // here and the page says so with <FundLevelOnly>.
      where: { versionId, ...fundWhere(scope.filter) },
      _sum: { endingCash: true },
    });
    return { total: r._sum.endingCash ?? ZERO, found: r._sum.endingCash !== null };
  },
);
