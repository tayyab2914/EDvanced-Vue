import { Prisma } from "@/lib/generated/prisma/client";
import type { TenantDb } from "@/lib/tenant-db";
import type { ActivityCodes } from "@/lib/finance/transfers";
import { matches } from "@/lib/finance/transfers";
import type { DatasetKind } from "@/lib/enums";

/**
 * The Financial Activity Engine: the numbers the platform works out rather than asking a
 * district to send.
 *
 * Derived at read, not materialised. The aggregates are sums over indexed rows, and the
 * output is a few hundred figures per district-year at the fund grain — cheap enough that
 * a cache would only be a second place for the truth to live.
 *
 * Decimal throughout. 0.1 + 0.2 in a reserve calculation is how a district stops trusting
 * the platform.
 */

const D = Prisma.Decimal;
const ZERO = new D(0);

/**
 * Only the CURRENT version of each dataset feeds a figure. "Exactly one version per
 * period is marked current and drives the dashboards" (Spec §5.9) — everything else is
 * history, and summing it would double-count every re-upload a district ever made.
 */
export async function currentVersionIds(
  db: TenantDb,
  args: { fiscalYear: string; period: number | null },
): Promise<Map<DatasetKind, string>> {
  const rows = await db.datasetVersion.findMany({
    where: { fiscalYear: args.fiscalYear, period: args.period, isCurrent: true },
    select: { id: true, dataset: true },
  });
  return new Map(rows.map((r) => [r.dataset as DatasetKind, r.id]));
}

/**
 * Which revenue sources / objects carry transfers, as ids.
 *
 * The classification is by CODE, but the periodic rows reference master data by id — so
 * the codes are turned into ids once, here, rather than joining and range-matching per
 * row. A district has tens of revenue sources and hundreds of objects; this is two small
 * queries.
 */
export async function transferIds(
  db: TenantDb,
  codes: ActivityCodes,
): Promise<{ transfersIn: string[]; otherFinancing: string[]; transfersOut: string[] }> {
  const [sources, objects] = await Promise.all([
    db.revenueSource.findMany({ select: { id: true, code: true } }),
    db.accountObject.findMany({ select: { id: true, code: true } }),
  ]);

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
  /** Omit for every fund. */
  fundId?: string;
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
export async function activityTotals(
  db: TenantDb,
  scope: PeriodScope,
  codes: ActivityCodes,
): Promise<ActivityTotals> {
  const versions = await currentVersionIds(db, {
    fiscalYear: scope.fiscalYear,
    period: scope.period,
  });
  const revVersion = versions.get("REVENUE_DETAIL");
  const expVersion = versions.get("EXPENDITURE_DETAIL");
  const ids = await transferIds(db, codes);

  const fund = scope.fundId ? { fundId: scope.fundId } : {};

  const sum = async (
    model: "revenueActual" | "expenditureActual",
    versionId: string | undefined,
    where: Record<string, unknown>,
  ): Promise<{ ytd: Prisma.Decimal; mtd: Prisma.Decimal }> => {
    if (!versionId) return { ytd: ZERO, mtd: ZERO };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await (db as any)[model].aggregate({
      where: { versionId, ...fund, ...where },
      _sum: { actualYtd: true, actualMtd: true },
    });
    return { ytd: r._sum.actualYtd ?? ZERO, mtd: r._sum.actualMtd ?? ZERO };
  };

  const [revenue, transfersIn, otherFinancing, expenditure, transfersOut] = await Promise.all([
    sum("revenueActual", revVersion, {}),
    sum("revenueActual", revVersion, { revenueSourceId: { in: ids.transfersIn } }),
    sum("revenueActual", revVersion, { revenueSourceId: { in: ids.otherFinancing } }),
    sum("expenditureActual", expVersion, {}),
    sum("expenditureActual", expVersion, { objectId: { in: ids.transfersOut } }),
  ]);

  return {
    totalRevenueYtd: revenue.ytd,
    transfersInYtd: transfersIn.ytd,
    otherFinancingYtd: otherFinancing.ytd,
    // Subtracted rather than queried with NOT IN: same answer, two fewer round trips, and
    // it cannot drift from the totals above.
    operatingRevenueYtd: revenue.ytd.minus(transfersIn.ytd).minus(otherFinancing.ytd),
    totalExpenditureYtd: expenditure.ytd,
    transfersOutYtd: transfersOut.ytd,
    operatingExpenditureYtd: expenditure.ytd.minus(transfersOut.ytd),
    totalRevenueMtd: revenue.mtd,
    totalExpenditureMtd: expenditure.mtd,
  };
}

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
export async function beginningFundBalance(
  db: TenantDb,
  args: { fiscalYear: string; fundId?: string },
): Promise<{ total: Prisma.Decimal; unassigned: Prisma.Decimal; found: boolean }> {
  const versions = await currentVersionIds(db, {
    fiscalYear: args.fiscalYear,
    period: null, // annual
  });
  const versionId = versions.get("OPENING_FUND_BALANCE");
  if (!versionId) return { total: ZERO, unassigned: ZERO, found: false };

  const r = await db.openingFundBalance.aggregate({
    where: { versionId, ...(args.fundId ? { fundId: args.fundId } : {}) },
    _sum: { begTotal: true, begUnassigned: true },
  });

  return {
    total: r._sum.begTotal ?? ZERO,
    unassigned: r._sum.begUnassigned ?? ZERO,
    found: r._sum.begTotal !== null,
  };
}

/** Ending cash for the period, from the Cash Position import. */
export async function endingCash(
  db: TenantDb,
  scope: PeriodScope,
): Promise<{ total: Prisma.Decimal; found: boolean }> {
  const versions = await currentVersionIds(db, {
    fiscalYear: scope.fiscalYear,
    period: scope.period,
  });
  const versionId = versions.get("CASH_POSITION");
  if (!versionId) return { total: ZERO, found: false };

  const r = await db.cashPosition.aggregate({
    where: { versionId, ...(scope.fundId ? { fundId: scope.fundId } : {}) },
    _sum: { endingCash: true },
  });
  return { total: r._sum.endingCash ?? ZERO, found: r._sum.endingCash !== null };
}
