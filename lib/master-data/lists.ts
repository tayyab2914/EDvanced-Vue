import type { TenantDb } from "@/lib/tenant-db";
import { memo, dbKey } from "@/lib/request-cache";
import { displayName } from "@/lib/text";

/**
 * The district's whole chart of funds and cost centres, read ONCE per render.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS MODULE EXISTS
 *
 * Three callers wanted these lists and each ran its own query for them: `listFunds` (the
 * by-fund tables), `generalFund` (the reserve KPI, which is General-Fund-only), and the
 * filter bar's option lists. Measured with scripts/verify-queries.mts, one `resolveScope`
 * read the Fund table THREE times and FundType three times — six round trips for two small
 * tables that had not changed between them.
 *
 * They are not expensive queries. That is not the unit that matters: this runs before
 * `loadCore` on every dashboard, so it is latency on the critical path, and against a
 * pooler on another continent each redundant read is 70–200ms of a page that is otherwise
 * carefully batched. See the header of scripts/verify-queries.mts.
 *
 * It sits in lib/master-data rather than in lib/finance or lib/dashboard because both of
 * those need it, and putting it in either would have made them import each other.
 * ---------------------------------------------------------------------------
 *
 * NOTHING IS FILTERED HERE. Inactive funds and cost centres come back too, and the callers
 * narrow. A fund deactivated in March still has nine months of figures behind it, so the
 * by-fund tables and the filter bar both need it — while `generalFund` genuinely does want
 * only active ones. Filtering in the shared read would mean the strictest caller decided
 * for everyone.
 *
 * NAMES ARE FORMATTED HERE, once, because this is the only read of them on the dashboards.
 * Every fund and cost-centre label on every screen — the scope selector, the filter menu,
 * the filter chips, the by-fund tables, the mover fund tags, the alert attribution chips,
 * the exported workbook — resolves through this module, so `general fund` and `GENERAL FUND`
 * become `General Fund` before any of them can disagree about it. See lib/text.ts. The
 * master-data EDITING screens deliberately do not come through here: they read the district's
 * own rows and must keep showing the district's own text.
 */

export interface FundRow {
  id: string;
  code: string;
  name: string;
  fundTypeId: string | null;
  active: boolean;
}

export interface CostCenterRow {
  id: string;
  schoolNumber: string;
  name: string;
  /** School · Department · Operations · Other. See lib/master-data/cost-center.ts. */
  category: string | null;
  typeId: string | null;
}

export interface TypeRow {
  id: string;
  code: string | null;
  name: string;
  sortOrder: number;
  /** Cost-centre types only — a Fund Type belongs to no category. */
  category?: string;
}

export interface MasterLists {
  /** Platform-managed global lookup, shared across districts. */
  fundTypes: TypeRow[];
  funds: FundRow[];
  /** Platform-managed global lookup, one category per row. */
  costCenterTypes: TypeRow[];
  /** The district's cost centres — stored as `School`, relabelled in the UI. */
  costCenters: CostCenterRow[];
}

/**
 * Four queries, flat.
 *
 * Deliberately NOT a nested `fundType: { select: … }` relation load, which is how the old
 * `listFunds` and `generalFund` each turned one query into two: Prisma issues a second
 * statement for the related rows, and both callers were fetching the same forty-row lookup.
 * The Fund Type is joined in memory instead, against a list this module already holds.
 */
export const masterLists = memo(
  "masterLists",
  (db: TenantDb) => dbKey(db),
  async (db: TenantDb): Promise<MasterLists> => {
    const [fundTypes, funds, costCenterTypes, costCenters] = await Promise.all([
      db.fundType.findMany({
        select: { id: true, code: true, name: true, sortOrder: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      db.fund.findMany({
        select: { id: true, code: true, name: true, fundTypeId: true, active: true },
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      }),
      db.costCenterType.findMany({
        select: { id: true, code: true, name: true, sortOrder: true, category: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      db.school.findMany({
        select: { id: true, schoolNumber: true, name: true, category: true, typeId: true },
        orderBy: [{ schoolNumber: "asc" }],
      }),
    ]);

    // Codes are untouched — a code is the district's key into their own chart of accounts.
    const named = <T extends { name: string }>(rows: T[]): T[] =>
      rows.map((r) => ({ ...r, name: displayName(r.name) }));

    return {
      fundTypes: named(fundTypes),
      funds: named(funds),
      costCenterTypes: named(costCenterTypes),
      costCenters: named(costCenters),
    };
  },
);

/** The Fund Type name for each fund, resolved in memory rather than by a second query. */
export function fundTypeNames(lists: MasterLists): Map<string, string> {
  const byId = new Map(lists.fundTypes.map((t) => [t.id, t.name]));
  const out = new Map<string, string>();
  for (const f of lists.funds) {
    const name = f.fundTypeId ? byId.get(f.fundTypeId) : undefined;
    if (name) out.set(f.id, name);
  }
  return out;
}
