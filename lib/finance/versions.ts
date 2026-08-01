import { Prisma } from "@/lib/generated/prisma/client";
import type { TenantDb } from "@/lib/tenant-db";
import { memo, dbKey } from "@/lib/request-cache";
import { detailWhere, filterKey, type FinanceFilter } from "@/lib/finance/filter";
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
  (db: TenantDb, args: { fiscalYear: string; kind: BudgetKind; filter?: FinanceFilter }) => {
    const k = dbKey(db);
    return k === null ? null : `${k}|${args.fiscalYear}|${args.kind}|${filterKey(args.filter)}`;
  },
  async (
    db: TenantDb,
    args: { fiscalYear: string; kind: BudgetKind; filter?: FinanceFilter },
  ): Promise<AdoptedBudget | null> => {
    const versions = await currentVersionsForYear(db, args.fiscalYear);
    const dataset: DatasetKind =
      args.kind === "EXPENDITURE" ? "EXPENDITURE_BUDGET" : "REVENUE_BUDGET";
    const versionId = versions.get(dataset)?.get(null);
    if (!versionId) return null;

    // `detailWhere`, not `fundWhere`: a budget line carries a cost centre, so a budget
    // filtered to one department is a real figure. The callers that must NOT narrow it —
    // days-cash and the reserve percentage, whose numerators are fund-grain — pass
    // `fundOnly(...)` and get the fund-level divisor those ratios need.
    const agg = await db.budgetLine.aggregate({
      where: { versionId, kind: args.kind, ...detailWhere(args.filter) },
      _sum: { amount: true },
    });

    return { versionId, total: agg._sum.amount ?? ZERO };
  },
);

export interface CurrentBudgets {
  revenue: Prisma.Decimal;
  expenditure: Prisma.Decimal;
  encumbrances: Prisma.Decimal;
}

/**
 * The AMENDED budget for a period — the Budget column on the monthly detail files.
 *
 * ---------------------------------------------------------------------------
 * ADOPTED versus AMENDED, AND WHY THE RESERVE NEEDS THIS ONE
 *
 * `adoptedBudget` above reads the two ANNUAL files: what the board approved in July and
 * never touches again. This reads what the board has approved AS OF THIS MONTH, because
 * the monthly detail files carry a Budget column that is the revised figure, tagged
 * `BudgetType.CURRENT` on ingest (see the enum's note in prisma/schema.prisma).
 *
 * That distinction is the whole of the projected ending fund balance. A district that
 * budgets $513M of revenue in July and amends to $514M in October has a projected ending
 * balance that moves by $1M on the October upload — and reads the adopted file forever if
 * this figure is taken from the wrong place. The amendment is the ONLY thing that moves
 * the projection, so taking it from the annual file would leave the number frozen all year.
 *
 * ---------------------------------------------------------------------------
 * WHY IT LIVES HERE AND NOT IN THE ALERT ENGINE
 *
 * It was private to lib/alerts/engine.ts, which was fine while the alerts were its only
 * caller. The reserve percentage needs the same figure now, and a second copy would be a
 * second round trip per render for a sum the first one already has — the exact regression
 * `verify:queries` exists to catch. One memo, two callers, one query.
 * ---------------------------------------------------------------------------
 *
 * Zero rather than null when a file is absent: a month with no detail import has no budget
 * to state, and every caller already guards `isZero()` before dividing.
 */
export const currentBudgets = memo(
  "currentBudgets",
  (db: TenantDb, scope: { fiscalYear: string; period: number; filter?: FinanceFilter }) => {
    const k = dbKey(db);
    return k === null ? null : `${k}|${scope.fiscalYear}|${scope.period}|${filterKey(scope.filter)}`;
  },
  async (
    db: TenantDb,
    scope: { fiscalYear: string; period: number; filter?: FinanceFilter },
  ): Promise<CurrentBudgets> => {
    const versions = await currentVersionIds(db, {
      fiscalYear: scope.fiscalYear,
      period: scope.period,
    });
    const slice = detailWhere(scope.filter);

    const revVersion = versions.get("REVENUE_DETAIL");
    const expVersion = versions.get("EXPENDITURE_DETAIL");

    const [rev, exp] = await Promise.all([
      revVersion
        ? db.revenueActual.aggregate({
            where: { versionId: revVersion, ...slice },
            _sum: { budget: true },
          })
        : null,
      expVersion
        ? db.expenditureActual.aggregate({
            where: { versionId: expVersion, ...slice },
            _sum: { budget: true, encumbrances: true },
          })
        : null,
    ]);

    return {
      revenue: rev?._sum.budget ?? ZERO,
      expenditure: exp?._sum.budget ?? ZERO,
      encumbrances: exp?._sum.encumbrances ?? ZERO,
    };
  },
);
