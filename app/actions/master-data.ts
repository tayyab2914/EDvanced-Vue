"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { tenantDb } from "@/lib/tenant-db";
import { requireAuth, userCan, type CurrentUser } from "@/lib/auth/dal";
import {
  RESOURCES,
  type FieldDef,
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
  // userCan (not hasPermission) so an external user's granted level decides this: a
  // VIEW_ONLY external fails here even though they can read the same page.
  return (
    userCan(user, "manage_master_data") &&
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
 * cross-tenant FKs); `globalType` values must exist in the platform lookup table — and
 * for a dependent select, must also match the parent the user picked (a Cost Center Type
 * has to belong to the chosen Category).
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
      const where: Record<string, unknown> = { id: data[f.name] };
      if (f.parentColumn && f.dependsOn) {
        where[f.parentColumn] = data[f.dependsOn];
      }
      const exists = await (prisma as unknown as Record<string, AnyDelegate>)[
        f.globalType
      ].findFirst({ where, select: { id: true } });
      if (!exists) {
        const parentLabel = f.dependsOn
          ? def.fields.find((p) => p.name === f.dependsOn)?.label.toLowerCase()
          : undefined;
        return {
          [f.name]: [
            parentLabel
              ? `That ${f.label.toLowerCase()} doesn't match the selected ${parentLabel}.`
              : "Invalid selection.",
          ],
        };
      }
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

  // Resolve type/status columns by name/label → id/enum value. For a dependent select
  // (Cost Center Type) the key is scoped by its parent, so "Elementary" only resolves
  // under the School category — that's what keeps a CSV from pairing a type with the
  // wrong category now that the check lives in the DB rather than the Zod schema.
  const globalMaps: Record<string, Map<string, string>> = {};
  const staticMaps: Record<string, Map<string, string>> = {};
  const globalKey = (f: FieldDef, parent: string, name: string) =>
    f.parentColumn ? `${norm(parent)}|${norm(name)}` : norm(name);

  for (const f of def.fields) {
    if (f.type !== "select" && f.type !== "radio") continue;
    if (f.globalType) {
      const items = await (prisma as unknown as Record<string, AnyDelegate>)[
        f.globalType
      ].findMany({
        select: {
          id: true,
          name: true,
          ...(f.parentColumn ? { [f.parentColumn]: true } : {}),
        },
      });
      globalMaps[f.name] = new Map(
        items.map((x: Record<string, string>) => [
          globalKey(f, f.parentColumn ? (x[f.parentColumn] ?? "") : "", x.name),
          x.id,
        ]),
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

    // Fields are read in registry order, so a parent (Category) is already resolved by
    // the time its dependent (Cost Center Type) is looked up.
    for (const f of def.fields) {
      const idx = colOf(f.name, f.label);
      let value = idx >= 0 ? (cells[idx] ?? "").trim() : "";
      if (value && (f.type === "select" || f.type === "radio")) {
        const gm = globalMaps[f.name];
        const parent = f.dependsOn ? String(raw[f.dependsOn] ?? "") : "";
        const resolved = gm
          ? gm.get(globalKey(f, parent, value))
          : staticMaps[f.name]?.get(norm(value));
        if (!resolved) {
          const parentLabel = f.dependsOn
            ? def.fields.find((p) => p.name === f.dependsOn)?.label.toLowerCase()
            : undefined;
          rowError = parentLabel
            ? `Unknown ${f.label.toLowerCase()} “${value}” for the selected ${parentLabel}`
            : `Unknown ${f.label.toLowerCase()} “${value}”`;
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

/**
 * Returns a FormState rather than void, because from Milestone 2 this can legitimately
 * fail: periodic data references master data with onDelete: Restrict, so a fund that has
 * financial history CANNOT be deleted. That is correct — deleting it would orphan a
 * district's revenue and expenditure rows — but the district needs a sentence, not a
 * Postgres error on a Next.js error page.
 */
export async function deleteMasterItem(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { kind, districtId, def } = parseContext(formData);
  if (!def || !districtId) return { error: "Unknown resource." };
  const id = String(formData.get("id") ?? "");

  const user = await requireAuth();
  if (!canManage(user, districtId)) {
    return { error: "You are not authorized to change this data." };
  }

  try {
    await (tenantDb(districtId) as unknown as Record<string, AnyDelegate>)[
      def.model
    ].deleteMany({ where: { id } });
  } catch {
    // Prisma's foreign-key error is caught bare, matching how the create/update actions
    // here translate a unique violation. The only way a delete fails on a tenant model is
    // a Restrict from periodic data, so the cause is known even without inspecting a code.
    return {
      error:
        `This ${def.singular.toLowerCase()} has financial data reported against it, so it can't be deleted — ` +
        `removing it would orphan those rows. Deactivate it instead: it will stop being offered on new imports ` +
        `while the history that references it stays intact.`,
    };
  }

  await writeAudit({
    action: "MASTER_DATA_DELETED",
    actorUserId: user.id,
    districtId,
    entityType: def.singular,
    entityId: id,
    metadata: { kind },
  });
  revalidatePath("/master-data");
  return { success: `${def.singular} deleted.` };
}
