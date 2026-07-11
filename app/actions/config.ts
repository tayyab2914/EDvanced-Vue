"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/dal";
import {
  CONFIG_RESOURCES,
  type ConfigDef,
  type ConfigKind,
} from "@/lib/config/registry";
import { configItemSchema } from "@/lib/validation/config";
import { writeAudit } from "@/lib/audit";
import { Role } from "@/lib/enums";
import type { FormState } from "@/lib/forms";

// The five global lookup models share one shape (id, name, sortOrder, active), so a
// single delegate type covers them all.
interface LookupDelegate {
  create(args: { data: { name: string } }): Promise<{ id: string }>;
  update(args: {
    where: { id: string };
    data: { name?: string; active?: boolean };
  }): Promise<unknown>;
  deleteMany(args: { where: { id: string } }): Promise<{ count: number }>;
}

function delegateFor(def: ConfigDef): LookupDelegate {
  return (prisma as unknown as Record<string, LookupDelegate>)[def.model];
}

function parseContext(formData: FormData): {
  kind: ConfigKind;
  def: ConfigDef | undefined;
} {
  const kind = String(formData.get("kind") ?? "") as ConfigKind;
  return { kind, def: CONFIG_RESOURCES[kind] };
}

export async function createConfigItem(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { kind, def } = parseContext(formData);
  if (!def) return { error: "Unknown configuration list." };

  const admin = await requireRole(Role.PLATFORM_ADMIN);

  const parsed = configItemSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return {
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const created = await delegateFor(def).create({
      data: { name: parsed.data.name },
    });
    await writeAudit({
      action: "CONFIG_ITEM_CREATED",
      actorUserId: admin.id,
      entityType: def.singular,
      entityId: created.id,
      metadata: { kind, name: parsed.data.name },
    });
  } catch {
    return {
      error: `A ${def.singular.toLowerCase()} named “${parsed.data.name}” already exists.`,
    };
  }

  revalidatePath("/platform/config");
  return { success: `${def.singular} added.` };
}

export async function updateConfigItem(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { kind, def } = parseContext(formData);
  if (!def) return { error: "Unknown configuration list." };
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing item." };

  const admin = await requireRole(Role.PLATFORM_ADMIN);

  const parsed = configItemSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return {
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    await delegateFor(def).update({
      where: { id },
      data: { name: parsed.data.name },
    });
  } catch {
    return {
      error: `A ${def.singular.toLowerCase()} with that name already exists.`,
    };
  }

  await writeAudit({
    action: "CONFIG_ITEM_UPDATED",
    actorUserId: admin.id,
    entityType: def.singular,
    entityId: id,
    metadata: { kind, name: parsed.data.name },
  });
  revalidatePath("/platform/config");
  return { success: `${def.singular} updated.` };
}

export async function deleteConfigItem(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { kind, def } = parseContext(formData);
  if (!def) return { error: "Unknown configuration list." };
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing item." };

  const admin = await requireRole(Role.PLATFORM_ADMIN);

  // deleteMany (not delete) so a stale/removed id is a no-op rather than a throw.
  // Deleting a type that districts reference nulls the reference (FK onDelete: SetNull).
  const { count } = await delegateFor(def).deleteMany({ where: { id } });
  if (count > 0) {
    await writeAudit({
      action: "CONFIG_ITEM_DELETED",
      actorUserId: admin.id,
      entityType: def.singular,
      entityId: id,
      metadata: { kind },
    });
  }
  revalidatePath("/platform/config");
  return { success: `${def.singular} deleted.` };
}

export async function toggleConfigItem(formData: FormData): Promise<void> {
  const { kind, def } = parseContext(formData);
  if (!def) return;
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!id) return;

  const admin = await requireRole(Role.PLATFORM_ADMIN);

  await delegateFor(def).update({ where: { id }, data: { active } });
  await writeAudit({
    action: active ? "CONFIG_ITEM_ACTIVATED" : "CONFIG_ITEM_DEACTIVATED",
    actorUserId: admin.id,
    entityType: def.singular,
    entityId: id,
    metadata: { kind },
  });
  revalidatePath("/platform/config");
}
