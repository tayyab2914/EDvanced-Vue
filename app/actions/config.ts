"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/dal";
import {
  CONFIG_RESOURCES,
  type ConfigDef,
  type ConfigKind,
  type ConfigImportResult,
} from "@/lib/config/registry";
import { configSchemaFor } from "@/lib/validation/config";
import { parseCsvRows } from "@/lib/csv";
import { writeAudit } from "@/lib/audit";
import { Role } from "@/lib/enums";
import type { FormState } from "@/lib/forms";

// The global lookup models share one shape (id, code, name, sortOrder, active) plus an
// optional `category` (Cost Center Types), so a single delegate type covers them all.
interface LookupFields {
  code?: string | null;
  name?: string;
  category?: string;
  active?: boolean;
}

interface LookupDelegate {
  create(args: { data: LookupFields & { name: string } }): Promise<{ id: string }>;
  update(args: { where: { id: string }; data: LookupFields }): Promise<unknown>;
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

/** Reads code/name — plus category for the lists that have one — off the form. */
function readItem(def: ConfigDef, formData: FormData) {
  return configSchemaFor(def).safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    ...(def.categoryField ? { category: formData.get("category") } : {}),
  });
}

export async function createConfigItem(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { kind, def } = parseContext(formData);
  if (!def) return { error: "Unknown configuration list." };

  const admin = await requireRole(Role.PLATFORM_ADMIN);

  const parsed = readItem(def, formData);
  if (!parsed.success) {
    return {
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const created = await delegateFor(def).create({
      data: {
        name: parsed.data.name,
        code: parsed.data.code,
        ...(def.categoryField ? { category: parsed.data.category } : {}),
      },
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
      error: `A ${def.singular.toLowerCase()} with that name or code already exists.`,
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

  const parsed = readItem(def, formData);
  if (!parsed.success) {
    return {
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    await delegateFor(def).update({
      where: { id },
      data: {
        name: parsed.data.name,
        code: parsed.data.code ?? null,
        ...(def.categoryField ? { category: parsed.data.category } : {}),
      },
    });
  } catch {
    return {
      error: `A ${def.singular.toLowerCase()} with that name or code already exists.`,
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

export async function importConfigItems(
  _prev: ConfigImportResult,
  formData: FormData,
): Promise<ConfigImportResult> {
  const { kind, def } = parseContext(formData);
  if (!def) return { ok: false, error: "Unknown configuration list." };

  const admin = await requireRole(Role.PLATFORM_ADMIN);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a CSV file to import." };
  }
  const { headers, rows } = parseCsvRows(await file.text());
  if (!headers.length) return { ok: false, error: "The file appears to be empty." };

  const norm = (s: string) => s.trim().toLowerCase();
  const headerNorm = headers.map(norm);
  const nameCol = headerNorm.indexOf("name");
  const codeCol = headerNorm.indexOf("code");
  if (nameCol < 0) {
    return { ok: false, error: "Missing required column: Name." };
  }

  // Lists with a category (Cost Center Types) need it on every row; accept either the
  // label ("School") or the stored value ("SCHOOL").
  const cat = def.categoryField;
  const catCol = cat ? headerNorm.indexOf(norm(cat.label)) : -1;
  if (cat && catCol < 0) {
    return { ok: false, error: `Missing required column: ${cat.label}.` };
  }
  const catValues = new Map(
    (cat?.options ?? []).flatMap((o) => [
      [norm(o.label), o.value] as const,
      [norm(o.value), o.value] as const,
    ]),
  );

  const delegate = delegateFor(def);
  let imported = 0;
  const errors: { row: number; message: string }[] = [];

  for (let r = 0; r < rows.length; r++) {
    const rowNum = r + 2;
    const name = (rows[r][nameCol] ?? "").trim();
    const code = codeCol >= 0 ? (rows[r][codeCol] ?? "").trim() : "";
    if (!name) {
      errors.push({ row: rowNum, message: "Name is required." });
      continue;
    }

    let category: string | undefined;
    if (cat) {
      const raw = (rows[r][catCol] ?? "").trim();
      category = catValues.get(norm(raw));
      if (!category) {
        errors.push({
          row: rowNum,
          message: raw
            ? `Unknown ${cat.label.toLowerCase()} “${raw}”.`
            : `${cat.label} is required.`,
        });
        continue;
      }
    }

    try {
      await delegate.create({
        data: { name, ...(code ? { code } : {}), ...(category ? { category } : {}) },
      });
      imported++;
    } catch {
      errors.push({ row: rowNum, message: "Duplicate name or code." });
    }
  }

  if (imported > 0) {
    await writeAudit({
      action: "CONFIG_ITEMS_IMPORTED",
      actorUserId: admin.id,
      entityType: def.singular,
      metadata: { kind, imported },
    });
    revalidatePath("/platform/config");
  }
  return { ok: true, imported, failed: errors.length, errors };
}
