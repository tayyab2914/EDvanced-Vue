"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import { resolveTenantDb, userCan } from "@/lib/auth/dal";
import { writeAudit } from "@/lib/audit";
import type { FormState } from "@/lib/forms";
import { FundBalanceField } from "@/lib/enums";
import { oneFund } from "@/lib/finance/filter";
import { loadActivityCodes } from "@/lib/finance/transfers";
import {
  CORRECTABLE_COMPONENTS,
  componentBreakdown,
  correctedTotal,
  type CorrectableComponent,
} from "@/lib/finance/fund-balance";

/**
 * Correcting the derived fund-balance figures (Spec §6.5, §5.20).
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
 *
 * ---------------------------------------------------------------------------
 * ONE SUBMISSION, EVERY COMPONENT — and a TOTAL nobody types.
 *
 * This used to correct one figure per visit, chosen from a dropdown, with the total as a
 * seventh option in the same list. The district reads its balance as a sheet, not as a
 * field at a time, and a hand-typed total sitting in the same list as the parts it is made
 * of could be saved disagreeing with them.
 *
 * So the screen posts the whole column at once and the total is DERIVED here — calculated
 * total plus the changes made to the components (`correctedTotal`), stored as the TOTAL
 * override so the alerts engine and the forecast read the corrected figure. A blank row is
 * "use the calculated figure", which means clearing any correction that was there; when the
 * last component correction goes, the derived TOTAL goes with it.
 *
 * Rows whose amount did not change are LEFT ALONE rather than rewritten with this
 * submission's reason. Each correction keeps the explanation it was entered with, which is
 * the thing an auditor is reading it for.
 * ---------------------------------------------------------------------------
 */

const MIN_REASON = 10;
const D = Prisma.Decimal;

/** The scope every correction is written against. A correction is always one fund's. */
interface Target {
  fiscalYear: string;
  period: number;
  fundId: string;
}

function readTarget(formData: FormData): Target | null {
  const fiscalYear = String(formData.get("fiscalYear") ?? "").trim();
  const period = Number(formData.get("period"));
  const fundId = String(formData.get("fundId") ?? "").trim();
  if (!fiscalYear || !Number.isInteger(period) || !fundId) return null;
  return { fiscalYear, period, fundId };
}

/**
 * A typed amount, or null when the row was left blank.
 *
 * `undefined` is the error case and is distinct from both: "$1,2x3" must not be read as
 * "leave this row alone", which is how a typo becomes a silently ignored correction.
 */
function parseAmount(raw: string): Prisma.Decimal | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const cleaned = trimmed.replace(/[$,\s]/g, "");
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return undefined;
  try {
    return new D(cleaned);
  } catch {
    return undefined;
  }
}

export async function saveFundBalanceCorrections(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const target = readTarget(formData);
  if (!target) return { error: "A fiscal year, period and fund are required." };
  const { fiscalYear, period, fundId } = target;
  const reason = String(formData.get("reason") ?? "").trim();

  const { db, user, districtId } = await resolveTenantDb(
    String(formData.get("districtId") ?? "") || undefined,
  );
  if (!userCan(user, "override_fund_balance")) {
    return { error: "Only a district administrator can correct a derived fund balance." };
  }

  // ---------- what was typed ----------
  const fieldErrors: Record<string, string[]> = {};
  const entered: Partial<Record<CorrectableComponent, Prisma.Decimal>> = {};

  for (const field of CORRECTABLE_COMPONENTS) {
    const amount = parseAmount(String(formData.get(`value_${field}`) ?? ""));
    if (amount === undefined) {
      fieldErrors[`value_${field}`] = [
        "Enter an amount, or clear the box to use the calculated figure.",
      ];
    } else if (amount !== null) {
      entered[field] = amount;
    }
  }

  // ---------- what is already in force ----------
  const existing = await db.fundBalanceOverride.findMany({
    where: { fiscalYear, period, fundId },
  });
  const inForce = new Map(existing.map((o) => [o.field as string, o]));

  const changed = CORRECTABLE_COMPONENTS.filter((field) => {
    const was = inForce.get(field);
    const now = entered[field];
    if (now === undefined) return was !== undefined; // a correction being removed
    return was === undefined || !was.value.equals(now);
  });

  const anyCorrection = Object.keys(entered).length > 0;

  // The reason is what the screen is for, but only where something is being asserted.
  // Emptying every box is a removal, and the removal path below does not ask for one.
  if (anyCorrection && reason.length < MIN_REASON) {
    fieldErrors.reason = [
      `Explain the correction in at least ${MIN_REASON} characters — this is what an auditor will read.`,
    ];
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Please fix the errors below.", fieldErrors };
  }
  if (changed.length === 0) {
    return { error: "Nothing has changed. Type over a calculated figure to correct it." };
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

  /**
   * The base the corrections are applied to, recomputed HERE rather than taken from the
   * form. The calculated column is the platform's own figure; accepting the browser's copy
   * of it would let a corrected total be posted that no component on the screen supports.
   */
  const codes = await loadActivityCodes(prisma);
  const breakdown = await componentBreakdown(
    db,
    { fiscalYear, period, filter: oneFund(fundId) },
    codes,
  );

  const write = async (field: FundBalanceField, value: Prisma.Decimal, why: string) => {
    const where = { fiscalYear, period, fundId, field };
    const updated = await db.fundBalanceOverride.updateMany({
      where,
      data: { value, reason: why, overriddenByUserId: user.id, versionId: version.id },
    });
    if (updated.count === 0) {
      await db.fundBalanceOverride.create({
        data: {
          fiscalYear,
          period,
          fundId,
          field,
          value,
          reason: why,
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
      metadata: { fiscalYear, period, fundId, field, value: value.toFixed(2), reason: why },
    });
  };

  const drop = async (field: FundBalanceField) => {
    await db.fundBalanceOverride.deleteMany({ where: { fiscalYear, period, fundId, field } });
    await writeAudit({
      action: "FUND_BALANCE_OVERRIDE_CLEARED",
      actorUserId: user.id,
      districtId,
      entityType: "Fund balance override",
      entityId: `${fiscalYear}:${period}:${fundId}:${field}`,
      metadata: { fiscalYear, period, fundId, field },
    });
  };

  for (const field of changed) {
    const value = entered[field];
    if (value === undefined) await drop(field as FundBalanceField);
    else await write(field as FundBalanceField, value, reason);
  }

  /**
   * The total, last — because it is a function of everything above it.
   *
   * Rewritten on every save rather than only when it moves: it is derived, so leaving a
   * stale one behind after a component changed would put a total on the alerts engine that
   * the components on this screen do not add up to.
   */
  if (anyCorrection) {
    await write(
      FundBalanceField.TOTAL,
      correctedTotal(breakdown, entered),
      `Derived from the corrected components. ${reason}`,
    );
  } else if (inForce.has(FundBalanceField.TOTAL)) {
    await drop(FundBalanceField.TOTAL);
  }

  revalidatePath("/fund-balance");
  revalidatePath("/dashboard");
  redirect(`/fund-balance?fy=${fiscalYear}&period=${period}&fund=${fundId}`);
}

/** Removing every correction on this fund and period, so the calculated figures stand again. */
export async function clearFundBalanceCorrections(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const target = readTarget(formData);
  if (!target) return { error: "A fiscal year, period and fund are required." };
  const { fiscalYear, period, fundId } = target;

  const { db, user, districtId } = await resolveTenantDb(
    String(formData.get("districtId") ?? "") || undefined,
  );
  if (!userCan(user, "override_fund_balance")) {
    return { error: "Only a district administrator can remove a correction." };
  }

  const removed = await db.fundBalanceOverride.findMany({
    where: { fiscalYear, period, fundId },
    select: { field: true },
  });
  if (removed.length === 0) return { error: "There are no corrections to remove." };

  await db.fundBalanceOverride.deleteMany({ where: { fiscalYear, period, fundId } });

  for (const { field } of removed) {
    await writeAudit({
      action: "FUND_BALANCE_OVERRIDE_CLEARED",
      actorUserId: user.id,
      districtId,
      entityType: "Fund balance override",
      entityId: `${fiscalYear}:${period}:${fundId}:${field}`,
      metadata: { fiscalYear, period, fundId, field },
    });
  }

  revalidatePath("/fund-balance");
  revalidatePath("/fund-balance/override");
  revalidatePath("/dashboard");
  return { success: "Corrections removed. The calculated figures now stand." };
}
