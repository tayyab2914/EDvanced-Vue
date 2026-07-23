"use server";

import { revalidatePath } from "next/cache";
import { resolveTenantDb, userCan } from "@/lib/auth/dal";
import { writeAudit } from "@/lib/audit";
import {
  POLICY_GROUPS,
  defaultPolicy,
  validateGroup,
  type PolicyGroupKey,
} from "@/lib/policies/registry";
import type { FormState } from "@/lib/forms";
import type { TenantDb } from "@/lib/tenant-db";

/**
 * Writes one or more policy groups for the signed-in user's district.
 *
 * This was an `upsert`, which the tenant extension now refuses: DistrictPolicy became a
 * district-scoped model when it was found to be missing from the allowlist, and the
 * extension cannot safely widen an upsert's `where` (it must be a unique selector, and
 * districtId is not part of every model's unique key). So it is the explicit two-step.
 *
 * updateMany first, create second — that order matters. updateMany is district-scoped by
 * the extension and returns a count, so it doubles as the existence check without a
 * separate read. `create` then has districtId injected for it.
 *
 * The create path races only against the same district saving twice in the same instant.
 * The unique index on districtId is what stops both winning, and the retry turns the
 * loser into an update rather than an error page.
 */
async function writePolicy(
  db: TenantDb,
  userId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const data = { ...patch, updatedByUserId: userId };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updated = await db.districtPolicy.updateMany({ where: {}, data: data as any });
  if (updated.count > 0) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.districtPolicy.create({ data: { ...defaultPolicy(), ...data } as any });
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.districtPolicy.updateMany({ where: {}, data: data as any });
  }
}

/**
 * Saving one group of a district's financial policies.
 *
 * One group at a time, because the screen is one tab at a time — saving all four would
 * mean a district's unsaved edits on another tab silently overwriting what is stored.
 */
export async function savePolicyGroup(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const key = String(formData.get("group") ?? "") as PolicyGroupKey;
  const group = POLICY_GROUPS.find((g) => g.key === key);
  if (!group) return { error: "Unknown policy group." };

  const { db, user, districtId } = await resolveTenantDb(
    String(formData.get("districtId") ?? "") || undefined,
  );

  // configure_district, matching who owns district settings. Worth revisiting: M1's own
  // reasoning — "keeping master data current is day-to-day finance work, not
  // administration" — argues a Finance User should own thresholds too. One line here
  // either way, and it is the client's call.
  if (!userCan(user, "configure_district")) {
    return { error: "Only a district administrator can change financial policies." };
  }

  const input: Record<string, unknown> = {};
  for (const s of group.settings) {
    input[s.key] = s.type === "toggle" ? formData.get(s.key) !== null : formData.get(s.key);
  }

  const { values, errors } = validateGroup(key, input);
  if (Object.keys(errors).length > 0) {
    return { error: "Please fix the errors below.", fieldErrors: errors };
  }

  await writePolicy(db, user.id, { [key]: values });

  await writeAudit({
    action: "POLICY_UPDATED",
    actorUserId: user.id,
    districtId,
    entityType: "Financial policy",
    entityId: districtId,
    metadata: { group: key, values },
  });

  revalidatePath("/policies");
  return { success: `${group.title} thresholds saved.` };
}

/** Puts one group back to the workbook's values. */
export async function resetPolicyGroup(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const key = String(formData.get("group") ?? "") as PolicyGroupKey;
  const group = POLICY_GROUPS.find((g) => g.key === key);
  if (!group) return { error: "Unknown policy group." };

  const { db, user, districtId } = await resolveTenantDb(
    String(formData.get("districtId") ?? "") || undefined,
  );
  if (!userCan(user, "configure_district")) {
    return { error: "Only a district administrator can change financial policies." };
  }

  await writePolicy(db, user.id, { [key]: defaultPolicy()[key] });

  await writeAudit({
    action: "POLICY_RESET",
    actorUserId: user.id,
    districtId,
    entityType: "Financial policy",
    entityId: districtId,
    metadata: { group: key },
  });

  revalidatePath("/policies");
  return { success: `${group.title} thresholds reset to the recommended values.` };
}
