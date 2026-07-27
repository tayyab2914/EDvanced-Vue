import { Prisma } from "@/lib/generated/prisma/client";
import type { TenantDb } from "@/lib/tenant-db";
import { memo, dbKey } from "@/lib/request-cache";
import type { DatasetKind, BudgetKind } from "@/lib/enums";

/**
 * The two lookups every financial figure begins with, resolved once per render.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS ITS OWN MODULE
 *
 * `currentVersionIds()` used to live in the engine and `currentVersionsForYear()` in the
 * series builder, and they issued two different queries for the same fact. Worse, every
 * caller re-resolved: one Executive render ran the version lookup FOURTEEN times and the
 * adopted-budget sum five, because `activityTotals`, `endingCash`, `beginningFundBalance`,
 * `currentBudgets`, `daysCash` and `reservePercent` each start by asking again.
 *
 * Both now answer from ONE query per render — the year-wide one, which the partial unique
 * index on DatasetVersion makes sufficient: exactly one version per (dataset, period) is
 * current, so a query with no period filter returns the whole year and every per-period
 * question is a Map lookup rather than a round trip.
 *
 * It sits below both the engine and the series builder because both need it, and putting
 * it in either would have made them import each other.
 * ---------------------------------------------------------------------------
 */

const ZERO = new Prisma.Decimal(0);

/**
 * Current version ids for a whole fiscal year, keyed by dataset and then by period.
 *
 * Deliberately omits `period` from the where clause — that omission is the whole point.
 * Annual datasets come back under period `null`.
 */
export const currentVersionsForYear = memo(
  "versionsForYear",
  (db: TenantDb, fiscalYear: string) => {
    const k = dbKey(db);
    return k === null ? null : `${k}|${fiscalYear}`;
  },
  async (
    db: TenantDb,
    fiscalYear: string,
  ): Promise<Map<DatasetKind, Map<number | null, string>>> => {
    const rows = await db.datasetVersion.findMany({
      where: { fiscalYear, isCurrent: true },
      select: { id: true, dataset: true, period: true },
    });

    const out = new Map<DatasetKind, Map<number | null, string>>();
    for (const r of rows) {
      const kind = r.dataset as DatasetKind;
      let byPeriod = out.get(kind);
      if (!byPeriod) {
        byPeriod = new Map();
        out.set(kind, byPeriod);
      }
      byPeriod.set(r.period, r.id);
    }
    return out;
  },
);

/**
 * Only the CURRENT version of each dataset feeds a figure. "Exactly one version per
 * period is marked current and drives the dashboards" (Spec §5.9) — everything else is
 * history, and summing it would double-count every re-upload a district ever made.
 *
 * Answered from the year-wide lookup above, so this costs no query of its own.
 */
export async function currentVersionIds(
  db: TenantDb,
  args: { fiscalYear: string; period: number | null },
): Promise<Map<DatasetKind, string>> {
  const byDataset = await currentVersionsForYear(db, args.fiscalYear);

  const out = new Map<DatasetKind, string>();
  for (const [kind, byPeriod] of byDataset) {
    const id = byPeriod.get(args.period);
    if (id !== undefined) out.set(kind, id);
  }
  return out;
}

export interface AdoptedBudget {
  versionId: string;
  total: Prisma.Decimal;
}

/**
 * The year's adopted budget for one kind, from the annual import.
 *
 * Null — not zero — when the district has not imported that budget. Four separate callers
 * need this exact figure (the trend series' divisor, days-cash, the reserve percentage and
 * the forecast), and each used to resolve its own version and run its own SUM. They share
 * one now, which is also what stops them drifting apart.
 */
export const adoptedBudget = memo(
  "adoptedBudget",
  (db: TenantDb, args: { fiscalYear: string; kind: BudgetKind; fundId?: string }) => {
    const k = dbKey(db);
    return k === null ? null : `${k}|${args.fiscalYear}|${args.kind}|${args.fundId ?? ""}`;
  },
  async (
    db: TenantDb,
    args: { fiscalYear: string; kind: BudgetKind; fundId?: string },
  ): Promise<AdoptedBudget | null> => {
    const versions = await currentVersionsForYear(db, args.fiscalYear);
    const dataset: DatasetKind =
      args.kind === "EXPENDITURE" ? "EXPENDITURE_BUDGET" : "REVENUE_BUDGET";
    const versionId = versions.get(dataset)?.get(null);
    if (!versionId) return null;

    const agg = await db.budgetLine.aggregate({
      where: {
        versionId,
        kind: args.kind,
        ...(args.fundId ? { fundId: args.fundId } : {}),
      },
      _sum: { amount: true },
    });

    return { versionId, total: agg._sum.amount ?? ZERO };
  },
);
