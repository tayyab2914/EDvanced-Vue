import { Prisma } from "@/lib/generated/prisma/client";
import type { TenantDb } from "@/lib/tenant-db";
import { consumption, pace, utilisation, availableBudget, type Variance } from "@/lib/finance/variance";

/**
 * The by-something tables and donuts: revenue by source, spending by function, spending by
 * object, cash by fund, balances by fund.
 *
 * Every one of these is a single grouped aggregate plus one lookup for the names. Nothing
 * here loads detail rows into memory to sum them — Expenditure Detail is fund × function ×
 * object × cost centre × project and runs to tens of thousands of rows per district-month,
 * which is exactly the shape §8.3 forbids pulling into Node.
 *
 * (lib/forecast/engine.ts DOES currently `findMany` every detail row to fold by category.
 * It predates this module. `expenditureByObjectType` below is the grouped replacement.)
 *
 * TWO CONSTRAINTS WORTH KNOWING BEFORE EDITING:
 *
 *   1. `groupBy.by` accepts SCALAR columns only — you cannot group by a relation's field.
 *      So "revenue by RevenueType" cannot be asked for directly: RevenueType hangs off
 *      RevenueSource. It is grouped by revenueSourceId and folded against a ~40-row
 *      lookup, which is one small query rather than a table scan.
 *   2. Filter by `versionId`, never by `(fiscalYear, period)`. See lib/finance/series.ts.
 */

const D = Prisma.Decimal;
const ZERO = new D(0);

export interface BreakdownRow {
  /** The master-data id — the drill-down link's target. */
  id: string;
  code: string;
  name: string;
  budget: Prisma.Decimal;
  actualYtd: Prisma.Decimal;
  actualMtd: Prisma.Decimal;
  encumbrances: Prisma.Decimal;
  /** Budget − spend − encumbrances. Zero for revenue rows, where it is meaningless. */
  available: Prisma.Decimal;
  /** Against the FULL-YEAR budget — the "% of Budget" column. */
  consumption: Variance;
  /** Against the budget expected by now — the column a threshold can be set on. */
  pace: Variance;
  /** Spend + encumbrances against budget. Only meaningful for expenditure rows. */
  utilisation: Variance;
}

export interface Breakdown {
  rows: BreakdownRow[];
  /** The TOTAL row. Computed by summing `rows`, so it can never disagree with them. */
  total: BreakdownRow;
}

/**
 * Builds the total from the rows themselves.
 *
 * Deliberately NOT a separate aggregate query. A total queried independently of the rows
 * it sits under is the classic dashboard bug: one filter drifts, the total stops matching
 * the column above it, and the district stops trusting every number on the page.
 */
function totalOf(rows: BreakdownRow[], periodsElapsed: number, label = "Total"): BreakdownRow {
  const add = (pick: (r: BreakdownRow) => Prisma.Decimal) =>
    rows.reduce((a, r) => a.plus(pick(r)), ZERO);

  const budget = add((r) => r.budget);
  const actualYtd = add((r) => r.actualYtd);
  const actualMtd = add((r) => r.actualMtd);
  const encumbrances = add((r) => r.encumbrances);

  return {
    id: "__total",
    code: "",
    name: label,
    budget,
    actualYtd,
    actualMtd,
    encumbrances,
    available: availableBudget(budget, actualYtd, encumbrances),
    consumption: consumption(actualYtd, budget),
    pace: pace(actualYtd, budget, periodsElapsed),
    utilisation: utilisation(actualYtd, encumbrances, budget),
  };
}

function makeRow(
  id: string,
  code: string,
  name: string,
  sums: {
    budget?: Prisma.Decimal | null;
    actualYtd?: Prisma.Decimal | null;
    actualMtd?: Prisma.Decimal | null;
    encumbrances?: Prisma.Decimal | null;
  },
  periodsElapsed: number,
): BreakdownRow {
  const budget = sums.budget ?? ZERO;
  const actualYtd = sums.actualYtd ?? ZERO;
  const actualMtd = sums.actualMtd ?? ZERO;
  const encumbrances = sums.encumbrances ?? ZERO;

  return {
    id,
    code,
    name,
    budget,
    actualYtd,
    actualMtd,
    encumbrances,
    available: availableBudget(budget, actualYtd, encumbrances),
    consumption: consumption(actualYtd, budget),
    pace: pace(actualYtd, budget, periodsElapsed),
    utilisation: utilisation(actualYtd, encumbrances, budget),
  };
}

/** Biggest first — a district reads the top of a table and stops. */
function bySize(a: BreakdownRow, b: BreakdownRow): number {
  return b.budget.comparedTo(a.budget) || b.actualYtd.comparedTo(a.actualYtd);
}

export interface BreakdownArgs {
  /** The CURRENT version of the relevant monthly dataset. */
  versionId: string;
  fundId?: string;
  /** Drives the pro-rated `pace` figures. */
  periodsElapsed: number;
}

// ===================== revenue =====================

export async function revenueBySource(db: TenantDb, args: BreakdownArgs): Promise<Breakdown> {
  const grouped = await db.revenueActual.groupBy({
    by: ["revenueSourceId"],
    where: { versionId: args.versionId, ...(args.fundId ? { fundId: args.fundId } : {}) },
    _sum: { budget: true, actualYtd: true, actualMtd: true },
  });

  const sources = await db.revenueSource.findMany({
    where: { id: { in: grouped.map((g) => g.revenueSourceId) } },
    select: { id: true, code: true, name: true, revenueTypeId: true },
  });
  const byId = new Map(sources.map((s) => [s.id, s]));

  const rows = grouped
    .map((g) => {
      const s = byId.get(g.revenueSourceId);
      return makeRow(
        g.revenueSourceId,
        s?.code ?? "",
        s?.name ?? "Unknown source",
        g._sum,
        args.periodsElapsed,
      );
    })
    .sort(bySize);

  return { rows, total: totalOf(rows, args.periodsElapsed, "Total revenues") };
}

/**
 * Revenue folded up to the platform's global RevenueType — the §4.2 donut.
 *
 * The same categories the forecast projects by (lib/forecast/engine.ts groups its
 * assumptions on RevenueType), so a forecast and an actual compare without a translation
 * table between them.
 */
export async function revenueByType(db: TenantDb, args: BreakdownArgs): Promise<Breakdown> {
  const [grouped, types] = await Promise.all([
    db.revenueActual.groupBy({
      by: ["revenueSourceId"],
      where: { versionId: args.versionId, ...(args.fundId ? { fundId: args.fundId } : {}) },
      _sum: { budget: true, actualYtd: true, actualMtd: true },
    }),
    db.revenueType.findMany({ select: { id: true, code: true, name: true } }),
  ]);

  const sources = await db.revenueSource.findMany({
    where: { id: { in: grouped.map((g) => g.revenueSourceId) } },
    select: { id: true, revenueTypeId: true },
  });
  const typeOfSource = new Map(sources.map((s) => [s.id, s.revenueTypeId]));
  const typeById = new Map(types.map((t) => [t.id, t]));

  const folded = new Map<string, { budget: Prisma.Decimal; ytd: Prisma.Decimal; mtd: Prisma.Decimal }>();
  for (const g of grouped) {
    const key = typeOfSource.get(g.revenueSourceId) ?? "__unclassified";
    const acc = folded.get(key) ?? { budget: ZERO, ytd: ZERO, mtd: ZERO };
    folded.set(key, {
      budget: acc.budget.plus(g._sum.budget ?? ZERO),
      ytd: acc.ytd.plus(g._sum.actualYtd ?? ZERO),
      mtd: acc.mtd.plus(g._sum.actualMtd ?? ZERO),
    });
  }

  const rows = [...folded.entries()]
    .map(([id, s]) => {
      const t = typeById.get(id);
      return makeRow(
        id,
        t?.code ?? "",
        t?.name ?? "Unclassified",
        { budget: s.budget, actualYtd: s.ytd, actualMtd: s.mtd },
        args.periodsElapsed,
      );
    })
    .sort(bySize);

  return { rows, total: totalOf(rows, args.periodsElapsed, "Total revenues") };
}

// ===================== expenditure =====================

export async function expenditureByFunction(db: TenantDb, args: BreakdownArgs): Promise<Breakdown> {
  const grouped = await db.expenditureActual.groupBy({
    by: ["functionId"],
    where: { versionId: args.versionId, ...(args.fundId ? { fundId: args.fundId } : {}) },
    _sum: { budget: true, actualYtd: true, actualMtd: true, encumbrances: true },
  });

  const functions = await db.accountFunction.findMany({
    where: { id: { in: grouped.map((g) => g.functionId) } },
    select: { id: true, code: true, name: true },
  });
  const byId = new Map(functions.map((f) => [f.id, f]));

  const rows = grouped
    .map((g) => {
      const f = byId.get(g.functionId);
      return makeRow(g.functionId, f?.code ?? "", f?.name ?? "Unknown function", g._sum, args.periodsElapsed);
    })
    .sort(bySize);

  return { rows, total: totalOf(rows, args.periodsElapsed, "Total expenditures") };
}

export async function expenditureByObject(db: TenantDb, args: BreakdownArgs): Promise<Breakdown> {
  const grouped = await db.expenditureActual.groupBy({
    by: ["objectId"],
    where: { versionId: args.versionId, ...(args.fundId ? { fundId: args.fundId } : {}) },
    _sum: { budget: true, actualYtd: true, actualMtd: true, encumbrances: true },
  });

  const objects = await db.accountObject.findMany({
    where: { id: { in: grouped.map((g) => g.objectId) } },
    select: { id: true, code: true, name: true },
  });
  const byId = new Map(objects.map((o) => [o.id, o]));

  const rows = grouped
    .map((g) => {
      const o = byId.get(g.objectId);
      return makeRow(g.objectId, o?.code ?? "", o?.name ?? "Unknown object", g._sum, args.periodsElapsed);
    })
    .sort(bySize);

  return { rows, total: totalOf(rows, args.periodsElapsed, "Total expenditures") };
}

/** Spending folded up to ObjectType — the §5.2 donut, and the forecast's own categories. */
export async function expenditureByObjectType(db: TenantDb, args: BreakdownArgs): Promise<Breakdown> {
  const [grouped, types] = await Promise.all([
    db.expenditureActual.groupBy({
      by: ["objectId"],
      where: { versionId: args.versionId, ...(args.fundId ? { fundId: args.fundId } : {}) },
      _sum: { budget: true, actualYtd: true, actualMtd: true, encumbrances: true },
    }),
    db.objectType.findMany({ select: { id: true, code: true, name: true } }),
  ]);

  const objects = await db.accountObject.findMany({
    where: { id: { in: grouped.map((g) => g.objectId) } },
    select: { id: true, objectTypeId: true },
  });
  const typeOfObject = new Map(objects.map((o) => [o.id, o.objectTypeId]));
  const typeById = new Map(types.map((t) => [t.id, t]));

  const folded = new Map<
    string,
    { budget: Prisma.Decimal; ytd: Prisma.Decimal; mtd: Prisma.Decimal; enc: Prisma.Decimal }
  >();
  for (const g of grouped) {
    const key = typeOfObject.get(g.objectId) ?? "__unclassified";
    const acc = folded.get(key) ?? { budget: ZERO, ytd: ZERO, mtd: ZERO, enc: ZERO };
    folded.set(key, {
      budget: acc.budget.plus(g._sum.budget ?? ZERO),
      ytd: acc.ytd.plus(g._sum.actualYtd ?? ZERO),
      mtd: acc.mtd.plus(g._sum.actualMtd ?? ZERO),
      enc: acc.enc.plus(g._sum.encumbrances ?? ZERO),
    });
  }

  const rows = [...folded.entries()]
    .map(([id, s]) => {
      const t = typeById.get(id);
      return makeRow(
        id,
        t?.code ?? "",
        t?.name ?? "Unclassified",
        { budget: s.budget, actualYtd: s.ytd, actualMtd: s.mtd, encumbrances: s.enc },
        args.periodsElapsed,
      );
    })
    .sort(bySize);

  return { rows, total: totalOf(rows, args.periodsElapsed, "Total expenditures") };
}

// ===================== by fund =====================

export interface FundBreakdownRow {
  fundId: string;
  code: string;
  name: string;
  typeName: string | null;
  revenueYtd: Prisma.Decimal;
  expenditureYtd: Prisma.Decimal;
  /** Opening balance + revenue − expenditure. Null when the year has no opening import. */
  fundBalance: Prisma.Decimal | null;
  endingCash: Prisma.Decimal | null;
}

/**
 * One row per fund — §6.1's Fund Balance by Fund and §7.2's Cash Balance by Fund.
 *
 * Funds with no financial rows at all are dropped rather than shown as zeros. A district's
 * chart of accounts carries funds it has not used this year, and a table listing them at
 * $0 reads as though the money went missing.
 */
export async function byFund(
  db: TenantDb,
  args: {
    revenueVersionId?: string;
    expenditureVersionId?: string;
    cashVersionId?: string;
    openingVersionId?: string;
  },
): Promise<FundBreakdownRow[]> {
  const [revenue, spending, cash, opening, funds] = await Promise.all([
    args.revenueVersionId
      ? db.revenueActual.groupBy({
          by: ["fundId"],
          where: { versionId: args.revenueVersionId },
          _sum: { actualYtd: true },
        })
      : Promise.resolve([]),
    args.expenditureVersionId
      ? db.expenditureActual.groupBy({
          by: ["fundId"],
          where: { versionId: args.expenditureVersionId },
          _sum: { actualYtd: true },
        })
      : Promise.resolve([]),
    args.cashVersionId
      ? db.cashPosition.groupBy({
          by: ["fundId"],
          where: { versionId: args.cashVersionId },
          _sum: { endingCash: true },
        })
      : Promise.resolve([]),
    args.openingVersionId
      ? db.openingFundBalance.groupBy({
          by: ["fundId"],
          where: { versionId: args.openingVersionId },
          _sum: { begTotal: true },
        })
      : Promise.resolve([]),
    db.fund.findMany({
      select: { id: true, code: true, name: true, fundType: { select: { name: true } } },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    }),
  ]);

  const revById = new Map(revenue.map((r) => [r.fundId, r._sum.actualYtd ?? ZERO]));
  const expById = new Map(spending.map((r) => [r.fundId, r._sum.actualYtd ?? ZERO]));
  const cashById = new Map(cash.map((r) => [r.fundId, r._sum.endingCash]));
  const openById = new Map(opening.map((r) => [r.fundId, r._sum.begTotal]));

  const out: FundBreakdownRow[] = [];
  for (const f of funds) {
    const revenueYtd = revById.get(f.id) ?? ZERO;
    const expenditureYtd = expById.get(f.id) ?? ZERO;
    const endingCash = cashById.get(f.id) ?? null;
    const openingTotal = openById.get(f.id) ?? null;

    const touched =
      revById.has(f.id) || expById.has(f.id) || cashById.has(f.id) || openById.has(f.id);
    if (!touched) continue;

    out.push({
      fundId: f.id,
      code: f.code,
      name: f.name,
      typeName: f.fundType?.name ?? null,
      revenueYtd,
      expenditureYtd,
      fundBalance: openingTotal === null ? null : openingTotal.plus(revenueYtd).minus(expenditureYtd),
      endingCash,
    });
  }
  return out;
}

// ===================== top movers =====================

/**
 * The biggest overs and unders — §4.2 and §5.2's Top Positive / Negative Variances cards.
 *
 * Ranked on the DOLLAR variance rather than the percentage, deliberately. A tiny line item
 * 400% over budget is noise; a large one 3% over is the one a finance officer needs to see,
 * and ranking by percentage would bury it under rounding on petty cash.
 *
 * Ranked on `pace` (against the budget expected by now), because ranking on consumption in
 * month two returns "everything, in size order" and says nothing.
 */
export function topMovers(
  breakdown: Breakdown,
  n = 5,
): { positive: BreakdownRow[]; negative: BreakdownRow[] } {
  const ranked = [...breakdown.rows].filter((r) => !r.pace.amount.isZero());

  const positive = ranked
    .filter((r) => r.pace.amount.isPositive())
    .sort((a, b) => b.pace.amount.comparedTo(a.pace.amount))
    .slice(0, n);

  const negative = ranked
    .filter((r) => r.pace.amount.isNegative())
    .sort((a, b) => a.pace.amount.comparedTo(b.pace.amount))
    .slice(0, n);

  return { positive, negative };
}

/**
 * Caps a breakdown at N rows and folds the tail into "Other".
 *
 * The colour rule: a categorical palette has six slots and a seventh category never gets a
 * generated hue. It folds. This is what does the folding, and it keeps the total intact so
 * the donut still sums to the figure in its centre.
 */
export function foldTail(breakdown: Breakdown, periodsElapsed: number, keep = 5): Breakdown {
  if (breakdown.rows.length <= keep) return breakdown;

  const head = breakdown.rows.slice(0, keep);
  const tail = breakdown.rows.slice(keep);

  const add = (pick: (r: BreakdownRow) => Prisma.Decimal) =>
    tail.reduce((a, r) => a.plus(pick(r)), ZERO);

  // periodsElapsed must be the caller's, not a default: the folded row's `pace` is
  // pro-rated, and pro-rating the tail to a different month than the rows above it would
  // make the column stop adding up.
  const other = makeRow(
    "__other",
    "",
    `Other (${tail.length})`,
    {
      budget: add((r) => r.budget),
      actualYtd: add((r) => r.actualYtd),
      actualMtd: add((r) => r.actualMtd),
      encumbrances: add((r) => r.encumbrances),
    },
    periodsElapsed,
  );

  return { rows: [...head, other], total: breakdown.total };
}
