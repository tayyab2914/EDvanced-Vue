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

  // upsert, not updateMany: DistrictPolicy is NOT a tenant model in the scoping sense —
  // it is keyed one-per-district and the row may not exist yet. The extension leaves it
  // alone, so districtId is set explicitly here.
  await db.districtPolicy.upsert({
    where: { districtId },
    create: {
      districtId,
      ...defaultPolicy(),
      [key]: values,
      updatedByUserId: user.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    update: {
      [key]: values,
      updatedByUserId: user.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  });

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

  const defaults = defaultPolicy()[key];
  await db.districtPolicy.upsert({
    where: { districtId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create: { districtId, ...defaultPolicy(), updatedByUserId: user.id } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update: { [key]: defaults, updatedByUserId: user.id } as any,
  });

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
