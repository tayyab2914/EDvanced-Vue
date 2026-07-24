"use server";

import { revalidatePath } from "next/cache";
import { resolveTenantDb, userCan } from "@/lib/auth/dal";
import { writeAudit } from "@/lib/audit";
import type { FormState } from "@/lib/forms";
import type { TenantDb } from "@/lib/tenant-db";
import {
  FUND_BALANCE_COMPONENT_VALUES,
  FUND_BALANCE_COMPONENT_LABELS,
  isForecastMethod,
  type FundBalanceComponent,
  type ForecastMethod,
} from "@/lib/enums";

/**
 * Saving the district's forecast assumptions (Spec §6.2 card 1).
 *
 * Two rates for the whole district — revenue growth and expenditure growth — stored as the
 * ForecastAssumption rows that name NO category. The compound unique on that table is
 * `(districtId, fiscalYear, kind, revenueTypeId, objectTypeId)`, and a row with both
 * category columns null is a legal member of it, so the district-level rate needs no schema
 * change and the per-category rows keep meaning exactly what they always meant.
 *
 * Note the write shape: `updateMany` then `create`, never `upsert`. The tenant extension
 * refuses upsert on a scoped model so district scoping stays enforceable, and
 * ForecastAssumption became scoped when it was found to be leaking across districts.
 */

const MAX_GROWTH = 100;
const MIN_GROWTH = -100;

function parseRate(raw: FormDataEntryValue | null, label: string): { value: number | null; error?: string } {
  const s = String(raw ?? "").trim();
  if (s === "") return { value: null };
  const n = Number(s);
  if (!Number.isFinite(n)) return { value: null, error: `${label} must be a number.` };
  if (n < MIN_GROWTH || n > MAX_GROWTH) {
    return { value: null, error: `${label} must be between ${MIN_GROWTH}% and ${MAX_GROWTH}%.` };
  }
  return { value: n };
}

/** A dollar amount, tolerant of "$1,200,000" because that is what people paste. */
function parseAmount(
  raw: FormDataEntryValue | null,
  label: string,
): { value: number | null; error?: string } {
  const s = String(raw ?? "").trim();
  if (s === "") return { value: null };
  const n = Number(s.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n)) return { value: null, error: `${label} must be an amount.` };
  return { value: n };
}

export async function saveForecastAssumptions(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const fiscalYear = String(formData.get("fiscalYear") ?? "").trim();
  if (!fiscalYear) return { error: "A fiscal year is required." };

  const { db, user, districtId } = await resolveTenantDb(
    String(formData.get("districtId") ?? "") || undefined,
  );

  if (!userCan(user, "edit_forecast_assumptions")) {
    return { error: "You do not have permission to change forecast assumptions." };
  }

  const revenue = parseRate(formData.get("revenueGrowth"), "Revenue growth");
  const expenditure = parseRate(formData.get("expenditureGrowth"), "Expenditure growth");
  const recurringRevenue = parseAmount(
    formData.get("recurringRevenueAdjustment"),
    "Recurring revenue adjustment",
  );
  const oneTimeRevenue = parseAmount(
    formData.get("oneTimeRevenueAdjustment"),
    "One-time revenue adjustment",
  );
  const recurringExpenditure = parseAmount(
    formData.get("recurringExpenditureAdjustment"),
    "Recurring expenditure adjustment",
  );
  const oneTimeExpenditure = parseAmount(
    formData.get("oneTimeExpenditure"),
    "One-time and carryforward expenditures",
  );

  const fieldErrors: Record<string, string[]> = {};
  if (revenue.error) fieldErrors.revenueGrowth = [revenue.error];
  if (expenditure.error) fieldErrors.expenditureGrowth = [expenditure.error];
  if (recurringRevenue.error) fieldErrors.recurringRevenueAdjustment = [recurringRevenue.error];
  if (oneTimeRevenue.error) fieldErrors.oneTimeRevenueAdjustment = [oneTimeRevenue.error];
  if (recurringExpenditure.error) {
    fieldErrors.recurringExpenditureAdjustment = [recurringExpenditure.error];
  }
  if (oneTimeExpenditure.error) fieldErrors.oneTimeExpenditure = [oneTimeExpenditure.error];
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Please fix the errors below.", fieldErrors };
  }

  await Promise.all([
    writeRate(db, fiscalYear, "REVENUE", {
      growthPercent: revenue.value,
      recurringAdjustment: recurringRevenue.value,
      oneTimeAdjustment: oneTimeRevenue.value,
    }),
    writeRate(db, fiscalYear, "EXPENDITURE", {
      growthPercent: expenditure.value,
      recurringAdjustment: recurringExpenditure.value,
      oneTimeAdjustment: oneTimeExpenditure.value,
    }),
  ]);

  await writeAudit({
    action: "FORECAST_ASSUMPTIONS_UPDATED",
    actorUserId: user.id,
    districtId,
    entityType: "Forecast assumption",
    entityId: fiscalYear,
    metadata: {
      fiscalYear,
      revenueGrowthPercent: revenue.value,
      expenditureGrowthPercent: expenditure.value,
      recurringRevenueAdjustment: recurringRevenue.value,
      oneTimeRevenueAdjustment: oneTimeRevenue.value,
      recurringExpenditureAdjustment: recurringExpenditure.value,
      oneTimeExpenditure: oneTimeExpenditure.value,
    },
  });

  revalidatePath("/fund-balance/forecast");
  revalidatePath("/fund-balance");
  return { success: "Forecast assumptions saved." };
}

interface RateFields {
  growthPercent: number | null;
  recurringAdjustment: number | null;
  oneTimeAdjustment: number | null;
}

async function writeRate(
  db: TenantDb,
  fiscalYear: string,
  kind: "REVENUE" | "EXPENDITURE",
  data: RateFields,
): Promise<void> {
  const where = { fiscalYear, kind, revenueTypeId: null, objectTypeId: null };

  const updated = await db.forecastAssumption.updateMany({ where, data });
  if (updated.count > 0) return;

  try {
    await db.forecastAssumption.create({
      // districtId is injected by the tenant extension, so it is absent from the literal
      // and Prisma's create input type does not know that.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { fiscalYear, kind, monitored: true, ...data } as any,
    });
  } catch {
    // Lost a race against another save for the same district and year — the unique index
    // is what stops both winning, and this turns the loser into an update.
    await db.forecastAssumption.updateMany({ where, data });
  }
}

/**
 * Saving HOW each fund balance component is projected — the client's "assumptions … should
 * be configurable rather than hard-coded".
 *
 * One form submit writes all four components, because they are read together and a partial
 * save would leave the calculation flow half under the old rules.
 */
export async function saveComponentAssumptions(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const fiscalYear = String(formData.get("fiscalYear") ?? "").trim();
  const fundId = String(formData.get("fundId") ?? "").trim();
  if (!fiscalYear || !fundId) return { error: "A fiscal year and fund are required." };

  const { db, user, districtId } = await resolveTenantDb(
    String(formData.get("districtId") ?? "") || undefined,
  );
  if (!userCan(user, "edit_forecast_assumptions")) {
    return { error: "You do not have permission to change forecast assumptions." };
  }

  const fieldErrors: Record<string, string[]> = {};
  const writes: { component: FundBalanceComponent; method: ForecastMethod; rate: number | null }[] = [];

  for (const component of FUND_BALANCE_COMPONENT_VALUES) {
    const rawMethod = String(formData.get(`method_${component}`) ?? "").trim();
    const method: ForecastMethod = isForecastMethod(rawMethod) ? rawMethod : "CARRY_FORWARD";

    let rate: number | null = null;
    if (method === "INCREASE_BY_PERCENT") {
      const parsed = parseRate(
        formData.get(`rate_${component}`),
        `${FUND_BALANCE_COMPONENT_LABELS[component]} annual increase`,
      );
      if (parsed.error) fieldErrors[`rate_${component}`] = [parsed.error];
      rate = parsed.value;
    }

    writes.push({ component, method, rate });
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Please fix the errors below.", fieldErrors };
  }

  for (const w of writes) {
    const where = { fiscalYear, fundId, component: w.component };
    const data = { method: w.method, annualIncreasePercent: w.rate };
    const updated = await db.fundBalanceComponentAssumption.updateMany({ where, data });
    if (updated.count === 0) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await db.fundBalanceComponentAssumption.create({ data: { ...where, ...data } as any });
      } catch {
        await db.fundBalanceComponentAssumption.updateMany({ where, data });
      }
    }
  }

  await writeAudit({
    action: "FORECAST_ASSUMPTIONS_UPDATED",
    actorUserId: user.id,
    districtId,
    entityType: "Fund balance component assumption",
    entityId: `${fiscalYear}:${fundId}`,
    metadata: {
      fiscalYear,
      fundId,
      components: writes.map((w) => ({ component: w.component, method: w.method, rate: w.rate })),
    },
  });

  revalidatePath("/fund-balance/forecast");
  return { success: "Fund balance component assumptions saved." };
}

/**
 * Saving a district's projected fund-balance components for a future year (§6.2 card 3's
 * "Less: Nonspendable / Restricted / Assigned" row).
 *
 * Per fund and per year, because that is the grain FundBalanceProjection is keyed at, and
 * because the workbook's own note limits the multi-year reserve percentage to the General
 * Fund.
 */
export async function saveFundBalanceProjection(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const fiscalYear = String(formData.get("fiscalYear") ?? "").trim();
  const fundId = String(formData.get("fundId") ?? "").trim();
  if (!fiscalYear || !fundId) return { error: "A fiscal year and fund are required." };

  const { db, user, districtId } = await resolveTenantDb(
    String(formData.get("districtId") ?? "") || undefined,
  );
  if (!userCan(user, "edit_forecast_assumptions")) {
    return { error: "You do not have permission to change projections." };
  }

  const amount = (name: string) => {
    const s = String(formData.get(name) ?? "").trim();
    if (s === "") return null;
    const n = Number(s.replace(/[$,]/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  const data = {
    nonspendable: amount("nonspendable"),
    restricted: amount("restricted"),
    committed: amount("committed"),
    assigned: amount("assigned"),
  };

  const updated = await db.fundBalanceProjection.updateMany({ where: { fiscalYear, fundId }, data });
  if (updated.count === 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.fundBalanceProjection.create({ data: { fiscalYear, fundId, ...data } as any });
  }

  await writeAudit({
    action: "FUND_BALANCE_PROJECTION_UPDATED",
    actorUserId: user.id,
    districtId,
    entityType: "Fund balance projection",
    entityId: `${fiscalYear}:${fundId}`,
    metadata: { fiscalYear, fundId, ...data },
  });

  revalidatePath("/fund-balance/forecast");
  return { success: `Projected components saved for ${fiscalYear}.` };
}
