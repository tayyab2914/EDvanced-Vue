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
  /**
   * The classification this row rolls up to — Function Type for a function, Object Type for
   * an object. Null when the district has not classified it.
   *
   * Carried on the row rather than looked up again by the page, because the client's
   * requirement — "make sure Functions are listed based on the Function Type Code" — is an
   * ORDERING requirement, and an ordering the page cannot see is an ordering the page will
   * eventually re-sort away.
   */
  group?: { code: string | null; name: string; sortOrder: number } | null;
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
  group?: BreakdownRow["group"],
): BreakdownRow {
  const budget = sums.budget ?? ZERO;
  const actualYtd = sums.actualYtd ?? ZERO;
  const actualMtd = sums.actualMtd ?? ZERO;
  const encumbrances = sums.encumbrances ?? ZERO;

  return {
    id,
    code,
    name,
    group: group ?? null,
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

/**
 * Chart-of-accounts order — classification first, then account code.
 *
 * The client's request on the Expenditures dashboard: "make sure Functions are listed based
 * on the Function Type Code". A finance officer reads a function table the way the chart of
 * accounts is written — Instruction, then Instructional Support, then General Support —
 * because that is the order the ledger, the state report and the board packet all use.
 * Sorting by size instead reorders the table every month as spending moves, which is fine
 * for a "biggest movers" card and wrong for a reference table.
 *
 * Unclassified rows sort last rather than first: an account nobody has typed yet is a data
 * gap, and putting it above Instruction would be giving it prominence it has not earned.
 */
function byChartOrder(a: BreakdownRow, b: BreakdownRow): number {
  const ga = a.group;
  const gb = b.group;
  if (ga && !gb) return -1;
  if (!ga && gb) return 1;
  if (ga && gb) {
    if (ga.sortOrder !== gb.sortOrder) return ga.sortOrder - gb.sortOrder;
    const ca = ga.code ?? "";
    const cb = gb.code ?? "";
    if (ca !== cb) return ca.localeCompare(cb, "en");
  }
  return a.code.localeCompare(b.code, "en", { numeric: true });
}

/** How a breakdown's rows are ordered. */
export type BreakdownOrder = "size" | "chart";

export interface BreakdownArgs {
  /** The CURRENT version of the relevant monthly dataset. */
  versionId: string;
  fundId?: string;
  /** Drives the pro-rated `pace` figures. */
  periodsElapsed: number;
  /**
   * "size" ranks by budget — the right default for a top-five card. "chart" follows the
   * chart of accounts, which is what a reference table wants.
   */
  order?: BreakdownOrder;
}

function sorter(order: BreakdownOrder | undefined) {
  return order === "chart" ? byChartOrder : bySize;
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
    select: {
      id: true,
      code: true,
      name: true,
      // The Function Type the client asked the table to be ordered by. A left join on a
      // ~10-row lookup, not a second query per row.
      functionType: { select: { code: true, name: true, sortOrder: true } },
    },
  });
  const byId = new Map(functions.map((f) => [f.id, f]));

  const rows = grouped
    .map((g) => {
      const f = byId.get(g.functionId);
      return makeRow(
        g.functionId,
        f?.code ?? "",
        f?.name ?? "Unknown function",
        g._sum,
        args.periodsElapsed,
        f?.functionType ?? null,
      );
    })
    .sort(sorter(args.order));

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
    select: {
      id: true,
      code: true,
      name: true,
      objectType: { select: { code: true, name: true, sortOrder: true } },
    },
  });
  const byId = new Map(objects.map((o) => [o.id, o]));

  const rows = grouped
    .map((g) => {
      const o = byId.get(g.objectId);
      return makeRow(
        g.objectId,
        o?.code ?? "",
        o?.name ?? "Unknown object",
        g._sum,
        args.periodsElapsed,
        o?.objectType ?? null,
      );
    })
    .sort(sorter(args.order));

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
    db.objectType.findMany({ select: { id: true, code: true, name: true, sortOrder: true } }),
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
        // An object TYPE is its own classification, so it groups by itself — which is what
        // lets `order: "chart"` put Salaries before Employee Benefits before Purchased
        // Services, the order the client listed them in.
        t ? { code: t.code, name: t.name, sortOrder: t.sortOrder } : null,
      );
    })
    .sort(sorter(args.order));

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
  /**
   * The fund's opening components, when an opening fund balance was imported.
   *
   * Carried so §6.1's table can name a PRIMARY CLASSIFICATION per fund — the client's
   * question was whether districts should declare one during setup, and the honest answer
   * for now is that they do not have to: the components they already upload say which
   * classification dominates, and deriving it beats asking for a field that would then need
   * to be kept in step with the file.
   *
   * If districts later want to override the derived answer, that becomes a column on Fund
   * and this stays as the fallback.
   */
  components: {
    nonspendable: Prisma.Decimal;
    restricted: Prisma.Decimal;
    committed: Prisma.Decimal;
    assigned: Prisma.Decimal;
    unassigned: Prisma.Decimal;
  } | null;
}

/**
 * Which classification a fund's balance mostly sits in.
 *
 * The largest component names it. A second is added — "Restricted / Committed" — only when
 * it is at least 40% of the largest, because a fund that is 95% restricted with a rounding
 * of committed is a restricted fund, and saying otherwise would make the column noise.
 *
 * Returns null rather than guessing when nothing has been imported. A blank cell is honest;
 * "Unassigned" on a fund nobody has classified is not.
 */
export function primaryClassification(row: FundBreakdownRow): string | null {
  const c = row.components;
  if (!c) return null;

  const parts: { label: string; value: Prisma.Decimal }[] = [
    { label: "Nonspendable", value: c.nonspendable },
    { label: "Restricted", value: c.restricted },
    { label: "Committed", value: c.committed },
    { label: "Assigned", value: c.assigned },
    { label: "Unassigned", value: c.unassigned },
  ].filter((p) => p.value.greaterThan(0));

  if (parts.length === 0) return null;
  parts.sort((a, b) => b.value.comparedTo(a.value));

  const lead = parts[0];
  const second = parts[1];
  if (second && second.value.greaterThanOrEqualTo(lead.value.times(0.4))) {
    return `${lead.label} / ${second.label}`;
  }
  return lead.label;
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
          _sum: {
            begTotal: true,
            begNonspendable: true,
            begRestricted: true,
            begCommitted: true,
            begAssigned: true,
            begUnassigned: true,
          },
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
  const componentsById = new Map(
    opening.map((r) => [
      r.fundId,
      {
        nonspendable: r._sum.begNonspendable ?? ZERO,
        restricted: r._sum.begRestricted ?? ZERO,
        committed: r._sum.begCommitted ?? ZERO,
        assigned: r._sum.begAssigned ?? ZERO,
        unassigned: r._sum.begUnassigned ?? ZERO,
      },
    ]),
  );

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
      components: componentsById.get(f.id) ?? null,
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
