"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { tenantDb } from "@/lib/tenant-db";
import { requireAuth, type CurrentUser } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import {
  RESOURCES,
  type MasterKind,
  type ResourceDef,
  type ImportResult,
} from "@/lib/master-data/registry";
import { parseCsvRows } from "@/lib/csv";
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

function readFields(def: ResourceDef, formData: FormData): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const f of def.fields) raw[f.name] = formData.get(f.name);
  return raw;
}

/**
 * Validates select fields: `relModel` values must belong to THIS district (no
 * cross-tenant FKs); `globalType` values must exist in the platform lookup table.
 * Returns a fieldErrors object if anything is invalid, else null.
 */
async function validateSelects(
  def: ResourceDef,
  data: Record<string, unknown>,
  db: ReturnType<typeof tenantDb>,
): Promise<Record<string, string[]> | null> {
  for (const f of def.fields) {
    if (f.type !== "select" || !data[f.name]) continue;
    if (f.relModel) {
      const owned = await (db as unknown as Record<string, AnyDelegate>)[
        f.relModel
      ].findFirst({ where: { id: data[f.name] }, select: { id: true } });
      if (!owned) return { [f.name]: ["Invalid selection."] };
    } else if (f.globalType) {
      const exists = await (prisma as unknown as Record<string, AnyDelegate>)[
        f.globalType
      ].findFirst({ where: { id: data[f.name] }, select: { id: true } });
      if (!exists) return { [f.name]: ["Invalid selection."] };
    }
  }
  return null;
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

  const parsed = def.schema.safeParse(readFields(def, formData));
  if (!parsed.success) {
    return {
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const db = tenantDb(districtId);
  const data = { ...(parsed.data as Record<string, unknown>) };

  const selectErrors = await validateSelects(def, data, db);
  if (selectErrors) {
    return { error: "Please fix the errors below.", fieldErrors: selectErrors };
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
  revalidatePath("/master-data");
  return { success: `${def.singular} added.` };
}

export async function updateMasterItem(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { kind, districtId, def } = parseContext(formData);
  if (!def || !districtId) return { error: "Unknown resource." };
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing item." };

  const user = await requireAuth();
  if (!canManage(user, districtId)) {
    return { error: "You are not authorized to change this data." };
  }

  const parsed = def.schema.safeParse(readFields(def, formData));
  if (!parsed.success) {
    return {
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const db = tenantDb(districtId);
  const data = { ...(parsed.data as Record<string, unknown>) };

  const selectErrors = await validateSelects(def, data, db);
  if (selectErrors) {
    return { error: "Please fix the errors below.", fieldErrors: selectErrors };
  }

  try {
    // updateMany keeps the tenant-scope enforcement (scopes the where to districtId).
    await (db as unknown as Record<string, AnyDelegate>)[def.model].updateMany({
      where: { id },
      data,
    });
  } catch {
    return {
      error: `That ${def.singular.toLowerCase()} already exists (duplicate code or ID).`,
    };
  }

  await writeAudit({
    action: "MASTER_DATA_UPDATED",
    actorUserId: user.id,
    districtId,
    entityType: def.singular,
    entityId: id,
    metadata: { kind },
  });
  revalidatePath("/master-data");
  return { success: `${def.singular} updated.` };
}

export async function toggleMasterItem(formData: FormData): Promise<void> {
  const { districtId, def } = parseContext(formData);
  if (!def || !districtId) return;
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";

  const user = await requireAuth();
  if (!canManage(user, districtId)) return;

  await (tenantDb(districtId) as unknown as Record<string, AnyDelegate>)[
    def.model
  ].updateMany({ where: { id }, data: { active } });

  await writeAudit({
    action: active ? "MASTER_DATA_ACTIVATED" : "MASTER_DATA_DEACTIVATED",
    actorUserId: user.id,
    districtId,
    entityType: def.singular,
    entityId: id,
  });
  revalidatePath("/master-data");
}

export async function importMasterData(
  _prev: ImportResult,
  formData: FormData,
): Promise<ImportResult> {
  const { kind, districtId, def } = parseContext(formData);
  if (!def || !districtId) return { ok: false, error: "Unknown resource." };

  const user = await requireAuth();
  if (!canManage(user, districtId)) {
    return { ok: false, error: "You are not authorized to import this data." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a CSV file to import." };
  }
  const { headers, rows } = parseCsvRows(await file.text());
  if (!headers.length) return { ok: false, error: "The file appears to be empty." };

  const norm = (s: string) => s.trim().toLowerCase();
  const headerNorm = headers.map(norm);
  const colOf = (fieldName: string, label: string) => {
    const byLabel = headerNorm.indexOf(norm(label));
    return byLabel >= 0 ? byLabel : headerNorm.indexOf(norm(fieldName));
  };

  const missing = def.fields
    .filter((f) => f.required && colOf(f.name, f.label) < 0)
    .map((f) => f.label);
  if (missing.length) {
    return { ok: false, error: `Missing required column(s): ${missing.join(", ")}.` };
  }

  // Resolve type/status columns by name/label → id/enum value.
  const globalMaps: Record<string, Map<string, string>> = {};
  const staticMaps: Record<string, Map<string, string>> = {};
  for (const f of def.fields) {
    if (f.type !== "select") continue;
    if (f.globalType) {
      const items = await (prisma as unknown as Record<string, AnyDelegate>)[
        f.globalType
      ].findMany({ select: { id: true, name: true } });
      globalMaps[f.name] = new Map(
        items.map((x: { id: string; name: string }) => [norm(x.name), x.id]),
      );
    } else if (f.staticOptions) {
      staticMaps[f.name] = new Map(
        f.staticOptions.map((o) => [norm(o.label), o.value]),
      );
    }
  }

  const db = tenantDb(districtId);
  let imported = 0;
  const errors: { row: number; message: string }[] = [];

  for (let r = 0; r < rows.length; r++) {
    const rowNum = r + 2; // account for the header row (1-based)
    const cells = rows[r];
    const raw: Record<string, unknown> = {};
    let rowError: string | null = null;

    for (const f of def.fields) {
      const idx = colOf(f.name, f.label);
      let value = idx >= 0 ? (cells[idx] ?? "").trim() : "";
      if (value && f.type === "select") {
        const resolved = (globalMaps[f.name] ?? staticMaps[f.name])?.get(
          norm(value),
        );
        if (!resolved) {
          rowError = `Unknown ${f.label.toLowerCase()} “${value}”`;
          break;
        }
        value = resolved;
      }
      raw[f.name] = value;
    }
    if (rowError) {
      errors.push({ row: rowNum, message: rowError });
      continue;
    }

    const parsed = def.schema.safeParse(raw);
    if (!parsed.success) {
      const msg = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
      errors.push({ row: rowNum, message: msg ?? "Invalid row." });
      continue;
    }

    try {
      await (db as unknown as Record<string, AnyDelegate>)[def.model].create({
        data: parsed.data,
      });
      imported++;
    } catch {
      errors.push({ row: rowNum, message: "Duplicate code/ID (already exists)." });
    }
  }

  if (imported > 0) {
    await writeAudit({
      action: "MASTER_DATA_IMPORTED",
      actorUserId: user.id,
      districtId,
      entityType: def.singular,
      metadata: { kind, imported },
    });
    revalidatePath("/master-data");
  }
  return { ok: true, imported, failed: errors.length, errors };
}

export async function deleteMasterItem(formData: FormData): Promise<void> {
  const { districtId, def } = parseContext(formData);
  if (!def || !districtId) return;
  const id = String(formData.get("id") ?? "");

  const user = await requireAuth();
  if (!canManage(user, districtId)) return;

  await (tenantDb(districtId) as unknown as Record<string, AnyDelegate>)[
    def.model
  ].deleteMany({ where: { id } });

  await writeAudit({
    action: "MASTER_DATA_DELETED",
    actorUserId: user.id,
    districtId,
    entityType: def.singular,
    entityId: id,
  });
  revalidatePath("/master-data");
}
