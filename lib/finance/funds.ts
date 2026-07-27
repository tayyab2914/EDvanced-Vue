import type { TenantDb } from "@/lib/tenant-db";
import { masterLists, fundTypeNames } from "@/lib/master-data/lists";
import { memo, dbKey } from "@/lib/request-cache";
import { codeName, DEFAULT_LABEL_MODE, type LabelMode } from "@/lib/text";

/**
 * Which fund is THE General Fund, and which funds a district actually reports on.
 *
 * This exists because a whole family of figures is General-Fund-only and nothing in the
 * codebase currently says so. The workbook is explicit — "multi-year forecasting and the
 * projected unassigned reserve apply only to the General Fund; with All Funds selected the
 * platform shows current and projected balances by fund but does not calculate a single
 * combined reserve percentage" — and the schema comment on FundBalanceProjection repeats
 * it. But `reservePercent()` will happily divide an all-funds unassigned balance by an
 * all-funds budget and hand back a number, and that number is not the KPI. It is not
 * anything.
 *
 * So the reserve figures take a resolved General Fund rather than an optional fundId, and
 * a caller that does not have one gets null rather than a plausible wrong answer.
 */

/**
 * The FundType that marks a district's General Fund.
 *
 * Matched on the platform-managed global list rather than on the fund's own code, because
 * the code is the district's (Florida's Red Book says 1000; another state may not) while
 * the type is ours. `code` is checked first — it is the stable key — with the name as the
 * fallback for a list seeded before codes were filled in.
 */
const GENERAL_FUND_TYPE_CODE = "100";
const GENERAL_FUND_TYPE_NAME = "General";

export interface FundRef {
  id: string;
  code: string;
  name: string;
  /** The global FundType's name — "General", "Special Revenue", "Debt Service"… */
  typeName: string | null;
}

/**
 * The district's General Fund, or null.
 *
 * Null is a real answer, not an error: a district that has not yet classified its funds
 * has no General Fund, and every reserve figure on the dashboards must then read "not
 * available" rather than quietly falling back to all funds.
 *
 * If a district has somehow classified two funds as General, the lower code wins and the
 * caller can carry on — but `generalFundAmbiguous()` lets a screen say so.
 */
export async function generalFund(db: TenantDb): Promise<FundRef | null> {
  const funds = await generalFundCandidates(db);
  return funds[0] ?? null;
}

export async function generalFundAmbiguous(db: TenantDb): Promise<boolean> {
  return (await generalFundCandidates(db)).length > 1;
}

/**
 * Resolved in memory from the shared master-data read, NOT by its own query.
 *
 * It was `db.fund.findMany({ where: { fundType: { code } } })`, which Prisma answers with
 * TWO statements — the funds, then the related types — and both of those tables had already
 * been read by `listFunds` in the same render. Measured, one `resolveScope` read Fund three
 * times and FundType three times. See lib/master-data/lists.ts.
 *
 * The predicate is unchanged: ACTIVE funds whose Fund Type matches, `code` checked first
 * because it is the stable key, with the name as the fallback for a list seeded before codes
 * were filled in. Lower code wins, so the caller can carry on when a district has somehow
 * typed two funds as General.
 */
const generalFundCandidates = memo("generalFundCandidates", dbKey, async (
  db: TenantDb,
): Promise<FundRef[]> => {
  const lists = await masterLists(db);
  const typeById = new Map(lists.fundTypes.map((t) => [t.id, t]));

  return lists.funds
    .filter((f) => {
      if (!f.active || !f.fundTypeId) return false;
      const type = typeById.get(f.fundTypeId);
      return type?.code === GENERAL_FUND_TYPE_CODE || type?.name === GENERAL_FUND_TYPE_NAME;
    })
    .map((f) => ({
      id: f.id,
      code: f.code,
      name: f.name,
      typeName: (f.fundTypeId ? typeById.get(f.fundTypeId)?.name : undefined) ?? null,
    }))
    .sort((a, b) => a.code.localeCompare(b.code, "en"));
});

/**
 * Every fund the district has, for the scope selector and the by-fund tables.
 *
 * Inactive funds are included when they carry history — a fund deactivated in March still
 * has nine months of figures behind it, and dropping it from a by-fund table would make
 * the rows stop adding up to the total. Master data is deactivated, not deleted, precisely
 * so this stays possible (§5.14).
 */
export const listFunds = memo("listFunds", dbKey, async (db: TenantDb): Promise<FundRef[]> => {
  const lists = await masterLists(db);
  const names = fundTypeNames(lists);

  // Already ordered by (sortOrder, code) — the shared read applies the same order this
  // function always used, so the by-fund tables are unchanged row for row.
  return lists.funds.map((f) => ({
    id: f.id,
    code: f.code,
    name: f.name,
    typeName: names.get(f.id) ?? null,
  }));
});

/**
 * "1000 — General Fund". Codes are shown with their names resolved everywhere (§5.19).
 *
 * The name arrives already title-cased from the shared master-data read; `codeName` formats
 * it again anyway because the operation is idempotent and a caller handing this a fund from
 * somewhere else should still get a label that matches the rest of the screen.
 */
export function fundLabel(
  f: Pick<FundRef, "code" | "name">,
  /** The reader's Codes / Names setting. Defaulted so a caller without one is unchanged. */
  mode: LabelMode = DEFAULT_LABEL_MODE,
): string {
  return codeName(f.code, f.name, mode);
}
