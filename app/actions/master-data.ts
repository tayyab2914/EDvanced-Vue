"use server";

import { revalidatePath } from "next/cache";
import { tenantDb } from "@/lib/tenant-db";
import { requireAuth, type CurrentUser } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import { RESOURCES, type MasterKind, type ResourceDef } from "@/lib/master-data/registry";
import { writeAudit } from "@/lib/audit";
import { Role } from "@/lib/enums";
import type { FormState } from "@/lib/forms";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDelegate = any;

function canManage(user: CurrentUser, districtId: string): boolean {
  return (
    hasPermission(user.role, "manage_master_data") &&
    (user.role === Role.PLATFORM_ADMIN || user.districtId === districtId)
  );
}

function parseContext(formData: FormData): {
  kind: MasterKind;
  districtId: string;
  def: ResourceDef | undefined;
} {
  const kind = String(formData.get("kind") ?? "") as MasterKind;
  const districtId = String(formData.get("districtId") ?? "");
  return { kind, districtId, def: RESOURCES[kind] };
}

export async function createMasterItem(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { kind, districtId, def } = parseContext(formData);
  if (!def || !districtId) return { error: "Unknown resource." };

  const user = await requireAuth();
  if (!canManage(user, districtId)) {
    return { error: "You are not authorized to change this data." };
  }

  const raw: Record<string, unknown> = {};
  for (const f of def.fields) raw[f.name] = formData.get(f.name);
  const parsed = def.schema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const db = tenantDb(districtId);
  const data = { ...(parsed.data as Record<string, unknown>) };
  if (def.isReference) data.isStandard = false;

  // Verify any relational select values belong to THIS district (prevent cross-tenant FKs).
  for (const f of def.fields) {
    if (f.type === "select" && f.relModel && data[f.name]) {
      const owned = await (db as unknown as Record<string, AnyDelegate>)[
        f.relModel
      ].findFirst({ where: { id: data[f.name] }, select: { id: true } });
      if (!owned) {
        return {
          error: "Please fix the errors below.",
          fieldErrors: { [f.name]: ["Invalid selection."] },
        };
      }
    }
  }

  try {
    await (db as unknown as Record<string, AnyDelegate>)[def.model].create({
      data,
    });
  } catch {
    return {
      error: `That ${def.singular.toLowerCase()} already exists (duplicate code or ID).`,
    };
  }

  await writeAudit({
    action: "MASTER_DATA_CREATED",
    actorUserId: user.id,
    districtId,
    entityType: def.singular,
    metadata: { kind },
  });
  revalidatePath(`/master-data/${kind}`);
  return { success: `${def.singular} added.` };
}

export async function toggleMasterItem(formData: FormData): Promise<void> {
  const { kind, districtId, def } = parseContext(formData);
  if (!def || !districtId) return;
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";

  const user = await requireAuth();
  if (!canManage(user, districtId)) return;

  await (
    tenantDb(districtId) as unknown as Record<string, AnyDelegate>
  )[def.model].updateMany({ where: { id }, data: { active } });

  await writeAudit({
    action: active ? "MASTER_DATA_ACTIVATED" : "MASTER_DATA_DEACTIVATED",
    actorUserId: user.id,
    districtId,
    entityType: def.singular,
    entityId: id,
  });
  revalidatePath(`/master-data/${kind}`);
}

export async function deleteMasterItem(formData: FormData): Promise<void> {
  const { kind, districtId, def } = parseContext(formData);
  if (!def || !districtId) return;
  const id = String(formData.get("id") ?? "");

  const user = await requireAuth();
  if (!canManage(user, districtId)) return;

  // Protect standard (seeded) reference rows from deletion; they can be deactivated.
  const where: Record<string, unknown> = { id };
  if (def.isReference) where.isStandard = false;

  await (
    tenantDb(districtId) as unknown as Record<string, AnyDelegate>
  )[def.model].deleteMany({ where });

  await writeAudit({
    action: "MASTER_DATA_DELETED",
    actorUserId: user.id,
    districtId,
    entityType: def.singular,
    entityId: id,
  });
  revalidatePath(`/master-data/${kind}`);
}
