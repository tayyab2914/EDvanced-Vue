"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { resolveTenantDb, userCan } from "@/lib/auth/dal";
import { writeAudit } from "@/lib/audit";
import type { FormState } from "@/lib/forms";
import { FundBalanceField } from "@/lib/enums";

/**
 * Correcting a derived fund-balance figure (Spec §6.5, §5.20).
 *
 * The storage, the versioning and the "a Replace clears it" rule live elsewhere; this is
 * the write path. Four things it must do, and each of them is a promise made in the client
 * documents rather than a nicety:
 *
 *   1. DISTRICT ADMINISTRATOR ONLY. Narrower than every other write in the product.
 *   2. A WRITTEN REASON, REQUIRED. Not optional, no default text, and not satisfied by
 *      whitespace. "An override on a derived financial figure is the first thing an
 *      auditor asks about, and 'why' is the question."
 *   3. VERSIONED WITH THE PERIOD IT CORRECTS, so restoring an earlier version restores the
 *      corrections that were true then.
 *   4. AUDITED, with who and when.
 */

const MIN_REASON = 10;

export async function saveFundBalanceOverride(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const fiscalYear = String(formData.get("fiscalYear") ?? "").trim();
  const period = Number(formData.get("period"));
  const fundId = String(formData.get("fundId") ?? "").trim();
  const field = String(formData.get("field") ?? "").trim() as FundBalanceField;
  const rawValue = String(formData.get("value") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!fiscalYear || !Number.isInteger(period) || !fundId) {
    return { error: "A fiscal year, period and fund are required." };
  }
  if (!Object.values(FundBalanceField).includes(field)) {
    return { error: "Unknown fund balance component." };
  }

  const { db, user, districtId } = await resolveTenantDb(
    String(formData.get("districtId") ?? "") || undefined,
  );

  if (!userCan(user, "override_fund_balance")) {
    return { error: "Only a district administrator can correct a derived fund balance." };
  }

  const fieldErrors: Record<string, string[]> = {};

  const value = Number(rawValue.replace(/[$,]/g, ""));
  if (rawValue === "" || !Number.isFinite(value)) {
    fieldErrors.value = ["Enter the corrected amount."];
  }
  if (reason.length < MIN_REASON) {
    fieldErrors.reason = [
      `Explain the correction in at least ${MIN_REASON} characters — this is what an auditor will read.`,
    ];
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Please fix the errors below.", fieldErrors };
  }

  // The override is versioned with the period it corrects, so it needs the version that is
  // current for that period. Without one there is nothing to hang the correction on — and
  // nothing to have corrected.
  const version = await db.datasetVersion.findFirst({
    where: {
      fiscalYear,
      period,
      isCurrent: true,
      dataset: { in: ["EXPENDITURE_DETAIL", "REVENUE_DETAIL"] },
    },
    select: { id: true },
    orderBy: { committedAt: "desc" },
  });
  if (!version) {
    return { error: "This period has no committed data to correct." };
  }

  const where = { fiscalYear, period, fundId, field };
  const updated = await db.fundBalanceOverride.updateMany({
    where,
    data: { value, reason, overriddenByUserId: user.id, versionId: version.id },
  });

  if (updated.count === 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.fundBalanceOverride.create({
      data: {
        fiscalYear,
        period,
        fundId,
        field,
        value,
        reason,
        versionId: version.id,
        overriddenByUserId: user.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    });
  }

  await writeAudit({
    action: "FUND_BALANCE_OVERRIDDEN",
    actorUserId: user.id,
    districtId,
    entityType: "Fund balance override",
    entityId: `${fiscalYear}:${period}:${fundId}:${field}`,
    metadata: { fiscalYear, period, fundId, field, value, reason },
  });

  revalidatePath("/fund-balance");
  revalidatePath("/dashboard");
  redirect(`/fund-balance?fy=${fiscalYear}&period=${period}`);
}

/** Removing a correction, so the derived figure stands again. */
export async function clearFundBalanceOverride(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const fiscalYear = String(formData.get("fiscalYear") ?? "").trim();
  const period = Number(formData.get("period"));
  const fundId = String(formData.get("fundId") ?? "").trim();
  const field = String(formData.get("field") ?? "").trim() as FundBalanceField;

  const { db, user, districtId } = await resolveTenantDb(
    String(formData.get("districtId") ?? "") || undefined,
  );
  if (!userCan(user, "override_fund_balance")) {
    return { error: "Only a district administrator can remove a correction." };
  }

  await db.fundBalanceOverride.deleteMany({ where: { fiscalYear, period, fundId, field } });

  await writeAudit({
    action: "FUND_BALANCE_OVERRIDE_CLEARED",
    actorUserId: user.id,
    districtId,
    entityType: "Fund balance override",
    entityId: `${fiscalYear}:${period}:${fundId}:${field}`,
    metadata: { fiscalYear, period, fundId, field },
  });

  revalidatePath("/fund-balance");
  return { success: "Correction removed. The calculated figure now stands." };
}
