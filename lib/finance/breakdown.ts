import { Prisma } from "@/lib/generated/prisma/client";
import type { TenantDb } from "@/lib/tenant-db";
import { consumption, pace, utilisation, availableBudget, type Variance } from "@/lib/finance/variance";
import { listFunds } from "@/lib/finance/funds";
import { detailWhere, fundWhere, fundOnly, type FinanceFilter } from "@/lib/finance/filter";
import { displayName } from "@/lib/text";

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
  /**
   * The fund these figures came from — set ONLY by the fund-grain breakdowns near the
   * bottom of this file, and null on every other row, which is already a district-wide
   * roll-up across funds.
   *
   * A card reads this to decide whether it can name a place: a row with a fund is somewhere
   * to go and look, a row without one is a total.
   */
  fund?: { id: string; code: string; name: string } | null;
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

/**
 * THE ONE PLACE a dimension name becomes display text.
 *
 * Every table row, donut slice, bar label, mover row and exported cell in the application is
 * a `BreakdownRow` built here, so title-casing the name on the way in standardises all of
 * them at once — `PURCHASED SERVICES` from one district's import and `purchased services`
 * from another's both read `Purchased Services`. See lib/text.ts.
 *
 * The classification carried in `group` is formatted too: it labels the section headers the
 * client asked the function table to be ordered by, and a header in a different case to the
 * rows beneath it is the inconsistency this was meant to remove.
 */
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
    name: displayName(name),
    group: group ? { ...group, name: displayName(group.name) } : null,
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
  /**
   * The slice to break down. Every table below groups a detail table, so the WHOLE filter
   * applies — fund and cost centre both — and these rows narrow with the KPI tiles above
   * them rather than drifting away from a total the reader can see.
   */
  filter?: FinanceFilter;
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
    where: { versionId: args.versionId, ...detailWhere(args.filter) },
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
        s?.name ?? "Unknown Source",
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
      where: { versionId: args.versionId, ...detailWhere(args.filter) },
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
    where: { versionId: args.versionId, ...detailWhere(args.filter) },
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
        f?.name ?? "Unknown Function",
        g._sum,
        args.periodsElapsed,
        f?.functionType ?? null,
      );
    })
    .sort(sorter(args.order));

  return { rows, total: totalOf(rows, args.periodsElapsed, "Total expenditures") };
}

/**
 * Spending folded up to FunctionType — the composition card's "View By → Function".
 *
 * The client, on the grouped Expenditures by Object card: "Function — hide Function Number
 * leaving Function Type, sort ascending by Function Number like Objects". A composition card
 * asks "where does the money go", and a district's function list answers that at the wrong
 * altitude: thirty-odd accounts, ranked by size, reshuffling every month. Instruction ·
 * Instructional Support · General Support is the answer, and it is the same shape
 * `expenditureByObjectType` already gives the Object view.
 *
 * The FULL function list is untouched and still sits below the card as the reference table,
 * in Function Type Code order with every account named. This is the summary; that is the
 * detail. Losing one to gain the other was never the ask.
 */
export async function expenditureByFunctionType(
  db: TenantDb,
  args: BreakdownArgs,
): Promise<Breakdown> {
  const [grouped, types] = await Promise.all([
    db.expenditureActual.groupBy({
      by: ["functionId"],
      where: { versionId: args.versionId, ...detailWhere(args.filter) },
      _sum: { budget: true, actualYtd: true, actualMtd: true, encumbrances: true },
    }),
    db.functionType.findMany({ select: { id: true, code: true, name: true, sortOrder: true } }),
  ]);

  const functions = await db.accountFunction.findMany({
    where: { id: { in: grouped.map((g) => g.functionId) } },
    select: { id: true, functionTypeId: true },
  });
  const typeOfFunction = new Map(functions.map((f) => [f.id, f.functionTypeId]));
  const typeById = new Map(types.map((t) => [t.id, t]));

  const folded = foldSums(
    grouped,
    (g) => typeOfFunction.get(g.functionId) ?? UNASSIGNED,
    (g) => g._sum,
  );

  const rows = [...folded.entries()]
    .map(([id, s]) => {
      const t = typeById.get(id);
      return makeRow(
        id,
        t?.code ?? "",
        t?.name ?? "Unclassified",
        s,
        args.periodsElapsed,
        // A function TYPE is its own classification, so it groups by itself — which is what
        // lets `order: "chart"` sort by the type's own order rather than by size. Same
        // argument as `expenditureByObjectType`.
        t ? { code: t.code, name: t.name, sortOrder: t.sortOrder } : null,
      );
    })
    .sort(sorter(args.order));

  return { rows, total: totalOf(rows, args.periodsElapsed, "Total expenditures") };
}

export async function expenditureByObject(db: TenantDb, args: BreakdownArgs): Promise<Breakdown> {
  const grouped = await db.expenditureActual.groupBy({
    by: ["objectId"],
    where: { versionId: args.versionId, ...detailWhere(args.filter) },
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
        o?.name ?? "Unknown Object",
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
      where: { versionId: args.versionId, ...detailWhere(args.filter) },
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

// ===================== "view by" perspectives =====================

/**
 * The client's M5 request: "every major visualization should have a small View By or Group
 * By selector … the user could switch between Object, Function, Cost Center Type, or
 * Project without requiring a separate report".
 *
 * Every function below returns the SAME `Breakdown` shape the four above return, which is
 * the point — a card that can render `expenditureByObjectType` renders any of them without
 * knowing which it was handed, so a new perspective costs a list entry rather than a card.
 *
 * The two-hop ones (cost centre → cost centre type) fold in Node against a lookup rather
 * than joining, for the reason at the top of this file: `groupBy.by` takes scalar columns
 * only, and the alternative — pulling detail rows to fold them — is what §8.3 forbids.
 */

/** The key a row with no cost centre / no project folds into. */
const UNASSIGNED = "__unassigned";

interface FoldedSums {
  budget: Prisma.Decimal;
  actualYtd: Prisma.Decimal;
  actualMtd: Prisma.Decimal;
  encumbrances: Prisma.Decimal;
}

/**
 * Sums a grouped aggregate into buckets.
 *
 * `keyOf` returns UNASSIGNED for a null dimension rather than dropping the group. Cost
 * centre is an optional column on the expenditure import and project is optional on the
 * budget files, so dropping unkeyed rows would make a re-grouped card total less than the
 * KPI tiles above it — the one failure a "view by" must not have, because the reader
 * changed perspective, not scope.
 */
function foldSums<G>(
  grouped: G[],
  keyOf: (g: G) => string,
  sumsOf: (g: G) => {
    budget?: Prisma.Decimal | null;
    actualYtd?: Prisma.Decimal | null;
    actualMtd?: Prisma.Decimal | null;
    encumbrances?: Prisma.Decimal | null;
  },
): Map<string, FoldedSums> {
  const out = new Map<string, FoldedSums>();
  for (const g of grouped) {
    const key = keyOf(g);
    const acc =
      out.get(key) ?? { budget: ZERO, actualYtd: ZERO, actualMtd: ZERO, encumbrances: ZERO };
    const s = sumsOf(g);
    out.set(key, {
      budget: acc.budget.plus(s.budget ?? ZERO),
      actualYtd: acc.actualYtd.plus(s.actualYtd ?? ZERO),
      actualMtd: acc.actualMtd.plus(s.actualMtd ?? ZERO),
      encumbrances: acc.encumbrances.plus(s.encumbrances ?? ZERO),
    });
  }
  return out;
}

/**
 * Spending folded up to Cost Center Type — School / Department / Operations and the
 * district's own types beneath them.
 *
 * Two hops, both cheap: the fact table groups by `costCenterId`, a cost centre (School)
 * carries `typeId`, and CostCenterType is a shared lookup of a few dozen rows. No query is
 * issued at all when nothing on the page has a cost centre.
 */
export async function expenditureByCostCenterType(
  db: TenantDb,
  args: BreakdownArgs,
): Promise<Breakdown> {
  const [grouped, types] = await Promise.all([
    db.expenditureActual.groupBy({
      by: ["costCenterId"],
      where: { versionId: args.versionId, ...detailWhere(args.filter) },
      _sum: { budget: true, actualYtd: true, actualMtd: true, encumbrances: true },
    }),
    db.costCenterType.findMany({ select: { id: true, code: true, name: true, sortOrder: true } }),
  ]);

  const centreIds = grouped
    .map((g) => g.costCenterId)
    .filter((id): id is string => id !== null);
  const centres = centreIds.length
    ? await db.school.findMany({
        where: { id: { in: centreIds } },
        select: { id: true, typeId: true },
      })
    : [];

  const typeOfCentre = new Map(centres.map((c) => [c.id, c.typeId]));
  const typeById = new Map(types.map((t) => [t.id, t]));

  const folded = foldSums(
    grouped,
    (g) => (g.costCenterId ? (typeOfCentre.get(g.costCenterId) ?? UNASSIGNED) : UNASSIGNED),
    (g) => g._sum,
  );

  const rows = [...folded.entries()]
    .map(([id, s]) => {
      const t = typeById.get(id);
      return makeRow(
        id,
        t?.code ?? "",
        t?.name ?? "No Cost Center Type",
        s,
        args.periodsElapsed,
        // Like an object TYPE, a cost centre type is its own classification, so `order:
        // "chart"` sorts by the type's own sortOrder rather than reshuffling by size.
        t ? { code: t.code, name: t.name, sortOrder: t.sortOrder } : null,
      );
    })
    .sort(sorter(args.order));

  return { rows, total: totalOf(rows, args.periodsElapsed, "Total expenditures") };
}

/**
 * Spending by Project — the expenditure detail's "Project / Grant" column.
 *
 * Ranked by size, always. A project list has no chart-of-accounts order to follow: project
 * numbers are district-assigned and carry no hierarchy, so `order: "chart"` would fall
 * through to a plain code sort that means nothing to a reader. Size does.
 */
export async function expenditureByProject(db: TenantDb, args: BreakdownArgs): Promise<Breakdown> {
  const grouped = await db.expenditureActual.groupBy({
    by: ["projectId"],
    where: { versionId: args.versionId, ...detailWhere(args.filter) },
    _sum: { budget: true, actualYtd: true, actualMtd: true, encumbrances: true },
  });

  const projectIds = grouped.map((g) => g.projectId).filter((id): id is string => id !== null);
  const projects = projectIds.length
    ? await db.project.findMany({
        where: { id: { in: projectIds } },
        select: { id: true, projectNumber: true, name: true },
      })
    : [];
  const byId = new Map(projects.map((p) => [p.id, p]));

  const rows = grouped
    .map((g) => {
      const p = g.projectId ? byId.get(g.projectId) : undefined;
      return makeRow(
        g.projectId ?? UNASSIGNED,
        p?.projectNumber ?? "",
        p?.name ?? (g.projectId ? "Unknown Project" : "No Project"),
        g._sum,
        args.periodsElapsed,
      );
    })
    .sort(bySize);

  return { rows, total: totalOf(rows, args.periodsElapsed, "Total expenditures") };
}

/**
 * Revenue by Project — the client's "View By → Grant" on the Revenue dashboard.
 *
 * The Grants Activity module is dormant until V2, and this is not a stand-in for it: grant
 * revenue genuinely arrives here. "Project / Grant" is a REQUIRED column on the revenue
 * detail import (lib/datasets/registry.ts), every row resolves to one Project in the
 * district's unified master, and that is where a district's grant revenue is recorded
 * today. Grouping on it answers the question. Calling the result "Grant" without saying so
 * would not, which is why the page labels it "Project / Grant".
 */
export async function revenueByProject(db: TenantDb, args: BreakdownArgs): Promise<Breakdown> {
  const grouped = await db.revenueActual.groupBy({
    by: ["projectId"],
    where: { versionId: args.versionId, ...detailWhere(args.filter) },
    _sum: { budget: true, actualYtd: true, actualMtd: true },
  });

  const projectIds = grouped.map((g) => g.projectId).filter((id): id is string => id !== null);
  const projects = projectIds.length
    ? await db.project.findMany({
        where: { id: { in: projectIds } },
        select: { id: true, projectNumber: true, name: true },
      })
    : [];
  const byId = new Map(projects.map((p) => [p.id, p]));

  const rows = grouped
    .map((g) => {
      const p = g.projectId ? byId.get(g.projectId) : undefined;
      return makeRow(
        g.projectId ?? UNASSIGNED,
        p?.projectNumber ?? "",
        p?.name ?? (g.projectId ? "Unknown Project" : "No Project"),
        g._sum,
        args.periodsElapsed,
      );
    })
    .sort(bySize);

  return { rows, total: totalOf(rows, args.periodsElapsed, "Total revenues") };
}

// ===================== by fund =====================

export interface FundBreakdownRow {
  fundId: string;
  code: string;
  name: string;
  typeName: string | null;
  revenueYtd: Prisma.Decimal;
  expenditureYtd: Prisma.Decimal;
  /**
   * The AMENDED budget for this fund — the Budget column on the same monthly detail rows the
   * actuals above come from, so it costs no query of its own.
   *
   * Carried so §6.1's by-fund table can print the ACTUAL and the BUDGETED ending balance
   * side by side. The district's question was "why does the ending balance keep moving when
   * we haven't amended anything?", and the honest answer is that the table was showing the
   * actual balance under a name that reads as the projection. Two columns, each named for
   * what it is, is the fix — one number cannot be both.
   */
  revenueBudget: Prisma.Decimal;
  expenditureBudget: Prisma.Decimal;
  /** Opening balance + revenue − expenditure. Null when the year has no opening import. */
  fundBalance: Prisma.Decimal | null;
  /**
   * Opening balance + amended revenue budget − amended expenditure budget.
   *
   * The projection the board voted for. It moves ONLY when the board amends the budget —
   * unlike `fundBalance` beside it, which moves every month as actuals land. See
   * lib/finance/fund-balance.ts for why those are deliberately two different figures.
   */
  budgetedFundBalance: Prisma.Decimal | null;
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
    filter?: FinanceFilter;
  },
): Promise<FundBreakdownRow[]> {
  /**
   * FUND-LEVEL THROUGHOUT, cost-centre half of the filter dropped.
   *
   * This table's whole purpose is that its rows are funds and its `fundBalance` column adds
   * up — `opening + revenue − expenditure` per fund. Narrowing revenue and expenditure by
   * cost centre while `opening` and `endingCash` physically cannot be narrowed would make
   * every balance in the column wrong in the same invisible way. The fund filter is honoured
   * in full; the page badges the rest. Same argument as lib/finance/fund-balance.ts.
   */
  const slice = fundOnly(args.filter);
  const funds_ = fundWhere(slice);

  const [revenue, spending, cash, opening, funds] = await Promise.all([
    args.revenueVersionId
      ? db.revenueActual.groupBy({
          by: ["fundId"],
          where: { versionId: args.revenueVersionId, ...funds_ },
          // `budget` rides along in the SUM the actuals were already paying for — the
          // budgeted ending balance per fund costs nothing but a column.
          _sum: { actualYtd: true, budget: true },
        })
      : Promise.resolve([]),
    args.expenditureVersionId
      ? db.expenditureActual.groupBy({
          by: ["fundId"],
          where: { versionId: args.expenditureVersionId, ...funds_ },
          _sum: { actualYtd: true, budget: true },
        })
      : Promise.resolve([]),
    args.cashVersionId
      ? db.cashPosition.groupBy({
          by: ["fundId"],
          where: { versionId: args.cashVersionId, ...funds_ },
          _sum: { endingCash: true },
        })
      : Promise.resolve([]),
    args.openingVersionId
      ? db.openingFundBalance.groupBy({
          by: ["fundId"],
          where: { versionId: args.openingVersionId, ...funds_ },
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
      where: slice.fundIds === undefined ? {} : { id: { in: slice.fundIds } },
      select: { id: true, code: true, name: true, fundType: { select: { name: true } } },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    }),
  ]);

  const revById = new Map(revenue.map((r) => [r.fundId, r._sum.actualYtd ?? ZERO]));
  const expById = new Map(spending.map((r) => [r.fundId, r._sum.actualYtd ?? ZERO]));
  const revBudgetById = new Map(revenue.map((r) => [r.fundId, r._sum.budget ?? ZERO]));
  const expBudgetById = new Map(spending.map((r) => [r.fundId, r._sum.budget ?? ZERO]));
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
    const revenueBudget = revBudgetById.get(f.id) ?? ZERO;
    const expenditureBudget = expBudgetById.get(f.id) ?? ZERO;
    const endingCash = cashById.get(f.id) ?? null;
    const openingTotal = openById.get(f.id) ?? null;

    const touched =
      revById.has(f.id) || expById.has(f.id) || cashById.has(f.id) || openById.has(f.id);
    if (!touched) continue;

    out.push({
      fundId: f.id,
      code: f.code,
      // Its own query rather than the shared master-data read (it carries the fund filter as
      // a `where`), so the names are raw here and formatted on the way out — same convention
      // as `makeRow`, so §6.1's by-fund table matches the tables above it.
      name: displayName(f.name),
      typeName: f.fundType ? displayName(f.fundType.name) : null,
      revenueYtd,
      expenditureYtd,
      revenueBudget,
      expenditureBudget,
      fundBalance: openingTotal === null ? null : openingTotal.plus(revenueYtd).minus(expenditureYtd),
      // Null on the same condition as `fundBalance`, and for the same reason: without an
      // opening balance this is the budgeted net CHANGE, not a budgeted balance.
      budgetedFundBalance:
        openingTotal === null ? null : openingTotal.plus(revenueBudget).minus(expenditureBudget),
      endingCash,
      components: componentsById.get(f.id) ?? null,
    });
  }
  return out;
}

// ===================== fund × account, for the mover cards =====================

/**
 * The same breakdowns, one row per FUND × account instead of one row per account.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 *
 * The client's question about Top Positive / Negative Variances: "how are these widgets
 * intended to work when the dashboard is displaying All Funds — are they showing the top
 * district-wide items across all funds, or are they aggregated by account/object?"
 *
 * They were aggregated by account. `revenueBySource` and `expenditureByFunction` group by
 * the account alone, so with All Funds selected a mover row reading "3200 — State
 * Categorical · ($1.2M)" was that source summed across every fund the district runs. The
 * card named a variance and named nowhere to go and look at it — and if two funds moved in
 * opposite directions it netted them off and showed neither.
 *
 * Ranking at fund × account grain instead makes every row a PLACE: "3200 — State
 * Categorical", tagged General Fund, linking to this dashboard scoped to that fund.
 *
 * WHEN IT RUNS
 *
 * On All Funds only. With a single fund selected the account-grain breakdown the page has
 * already loaded IS this, with a column that would repeat the same fund on every row — so
 * the page reuses it and this issues no query. That is the client's "this behavior should
 * automatically adjust when a single fund is selected through the global filters", and it
 * costs the single-fund case nothing.
 *
 * The funds come from `listFunds`, which the scope resolver has already read and memoised
 * for this render, so naming the fund is free rather than a second lookup.
 * ---------------------------------------------------------------------------
 */

/** Fund-grain rows are keyed by both halves — one source appears once per fund it moved in. */
const fundRowId = (fundId: string, accountId: string) => `${fundId}:${accountId}`;

export async function revenueBySourceAndFund(
  db: TenantDb,
  args: BreakdownArgs,
): Promise<Breakdown> {
  const [grouped, funds] = await Promise.all([
    db.revenueActual.groupBy({
      by: ["revenueSourceId", "fundId"],
      where: { versionId: args.versionId, ...detailWhere(args.filter) },
      _sum: { budget: true, actualYtd: true, actualMtd: true },
    }),
    listFunds(db),
  ]);

  const sources = await db.revenueSource.findMany({
    where: { id: { in: [...new Set(grouped.map((g) => g.revenueSourceId))] } },
    select: { id: true, code: true, name: true },
  });
  const byId = new Map(sources.map((s) => [s.id, s]));
  const fundById = new Map(funds.map((f) => [f.id, f]));

  const rows = grouped
    .map((g) => {
      const s = byId.get(g.revenueSourceId);
      const f = fundById.get(g.fundId);
      return {
        ...makeRow(
          fundRowId(g.fundId, g.revenueSourceId),
          s?.code ?? "",
          s?.name ?? "Unknown Source",
          g._sum,
          args.periodsElapsed,
        ),
        fund: f ? { id: f.id, code: f.code, name: f.name } : null,
      };
    })
    .sort(bySize);

  return { rows, total: totalOf(rows, args.periodsElapsed, "Total revenues") };
}

export async function expenditureByFunctionAndFund(
  db: TenantDb,
  args: BreakdownArgs,
): Promise<Breakdown> {
  const [grouped, funds] = await Promise.all([
    db.expenditureActual.groupBy({
      by: ["functionId", "fundId"],
      where: { versionId: args.versionId, ...detailWhere(args.filter) },
      _sum: { budget: true, actualYtd: true, actualMtd: true, encumbrances: true },
    }),
    listFunds(db),
  ]);

  const functions = await db.accountFunction.findMany({
    where: { id: { in: [...new Set(grouped.map((g) => g.functionId))] } },
    select: {
      id: true,
      code: true,
      name: true,
      functionType: { select: { code: true, name: true, sortOrder: true } },
    },
  });
  const byId = new Map(functions.map((f) => [f.id, f]));
  const fundById = new Map(funds.map((f) => [f.id, f]));

  const rows = grouped
    .map((g) => {
      const fn = byId.get(g.functionId);
      const f = fundById.get(g.fundId);
      return {
        ...makeRow(
          fundRowId(g.fundId, g.functionId),
          fn?.code ?? "",
          fn?.name ?? "Unknown Function",
          g._sum,
          args.periodsElapsed,
          fn?.functionType ?? null,
        ),
        fund: f ? { id: f.id, code: f.code, name: f.name } : null,
      };
    })
    .sort(bySize);

  return { rows, total: totalOf(rows, args.periodsElapsed, "Total expenditures") };
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
 * Re-ranks a breakdown biggest-first without re-querying it.
 *
 * The one thing a page cannot do for itself, because `bySize` is private and a page that
 * re-sorted by hand would be a second definition of "biggest" to keep in step with this one.
 *
 * It exists for `foldTail`'s sake. Folding the tail of a CHART-ORDERED breakdown folds
 * whatever the chart of accounts happens to list last — General Support, say — which is not
 * "the small ones" and would put a large category into "Other". Rank first, then fold.
 */
export function rankBySize(breakdown: Breakdown): Breakdown {
  return { rows: [...breakdown.rows].sort(bySize), total: breakdown.total };
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

/**
 * Re-orders a breakdown by chart of accounts, AFTER its tail has been folded.
 *
 * The client's rule for the grouped composition card — "sort ascending by Project Number
 * like Objects" — applied to a dimension that also has to be capped. Ranking picks WHICH
 * rows the card shows (the biggest, so "Other" is genuinely the small ones); this decides
 * what order it shows them in, which the reader is the one who cares about. Doing it the
 * other way round — chart order, then fold — would fold whatever the numbering happens to
 * list last, which is not "the small ones". Rank, fold, then order.
 *
 * "Other" is a fold rather than a dimension value, so it never competes for a place in the
 * sequence and always sits at the end. A row whose dimension was left blank on the import
 * ("No Project") has no number to sort by, so it follows the numbered rows rather than
 * leading them — same reasoning as `byChartOrder` putting unclassified rows last.
 */
export function inChartOrder(breakdown: Breakdown): Breakdown {
  const tier = (r: BreakdownRow) => (r.id === "__other" ? 2 : r.code ? 0 : 1);
  const rows = [...breakdown.rows].sort((a, b) => tier(a) - tier(b) || byChartOrder(a, b));
  return { rows, total: breakdown.total };
}
