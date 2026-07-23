import type { TenantDb } from "@/lib/tenant-db";

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

async function generalFundCandidates(db: TenantDb): Promise<FundRef[]> {
  const rows = await db.fund.findMany({
    where: {
      active: true,
      OR: [
        { fundType: { code: GENERAL_FUND_TYPE_CODE } },
        { fundType: { name: GENERAL_FUND_TYPE_NAME } },
      ],
    },
    select: { id: true, code: true, name: true, fundType: { select: { name: true } } },
    orderBy: { code: "asc" },
  });

  return rows.map((f) => ({
    id: f.id,
    code: f.code,
    name: f.name,
    typeName: f.fundType?.name ?? null,
  }));
}

/**
 * Every fund the district has, for the scope selector and the by-fund tables.
 *
 * Inactive funds are included when they carry history — a fund deactivated in March still
 * has nine months of figures behind it, and dropping it from a by-fund table would make
 * the rows stop adding up to the total. Master data is deactivated, not deleted, precisely
 * so this stays possible (§5.14).
 */
export async function listFunds(db: TenantDb): Promise<FundRef[]> {
  const rows = await db.fund.findMany({
    select: { id: true, code: true, name: true, fundType: { select: { name: true } } },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });

  return rows.map((f) => ({
    id: f.id,
    code: f.code,
    name: f.name,
    typeName: f.fundType?.name ?? null,
  }));
}

/** "1000 — General Fund". Codes are shown with their names resolved everywhere (§5.19). */
export function fundLabel(f: Pick<FundRef, "code" | "name">): string {
  return `${f.code} — ${f.name}`;
}
