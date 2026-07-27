"use server";

import { revalidatePath } from "next/cache";
import { getTenantDb, userCan } from "@/lib/auth/dal";
import { writeAudit } from "@/lib/audit";
import type { FormState } from "@/lib/forms";
import { ALL_FILTER_PARAMS } from "@/lib/dashboard/filter-params";

/**
 * Saving, renaming and deleting the district's named filter views.
 *
 * ---------------------------------------------------------------------------
 * WHO MAY WRITE ONE, AND WHY IT IS NOT `configure_district`
 *
 * Anyone who can see a dashboard can save a view, and anyone can delete one. A saved view
 * is a bookmark with a shared name — it holds no figures, changes no figures, and grants
 * access to nothing its author could not already reach through the filter bar. Gating it
 * behind an administrator permission would mean the finance analyst who actually builds
 * these slices has to ask someone else to press Save, which is how a feature stops being
 * used.
 *
 * What it is NOT is a per-user preference. Views are district-wide, so a delete removes it
 * for colleagues too. That is a real consequence, which is why the delete is confirmed in
 * the UI and audited here with the name and the filters it held — enough for an
 * administrator to put it back.
 * ---------------------------------------------------------------------------
 *
 * THE FILTER STRING IS RE-PARSED BEFORE IT IS STORED. It arrives from a form field, so it
 * is user input in the ordinary sense: it reaches the database, and it comes back out into
 * `router.push()`. `sanitiseFilters` below reduces it to the parameters this app owns,
 * which is what stops a saved "view" carrying anything else.
 */

const MAX_NAME = 60;

/** The one place a stored filter string is built. See the note above. */
function sanitiseFilters(raw: string): string {
  // `URLSearchParams` handles the decoding; the allowlist handles everything else. A
  // parameter this app does not own is dropped rather than escaped — there is no filter it
  // could be expressing, so keeping it could only serve some other purpose.
  const incoming = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  const clean = new URLSearchParams();

  for (const key of ALL_FILTER_PARAMS) {
    const value = incoming.get(key);
    // Ids are cuids. Anything with a character a cuid cannot contain is not an id list,
    // and is dropped whole rather than trimmed into something that looks like one.
    if (value && /^[A-Za-z0-9,_-]+$/.test(value)) clean.set(key, value);
  }

  return clean.toString();
}

export async function saveView(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  const filters = sanitiseFilters(String(formData.get("filters") ?? ""));
  const path = String(formData.get("path") ?? "/dashboard");

  if (!name) return { error: "Give the view a name." };
  if (name.length > MAX_NAME) return { error: `Keep the name under ${MAX_NAME} characters.` };
  // A view with no filters is "All funds" under a name — it would apply nothing and
  // explain nothing, and it would sit in the list looking like it did something.
  if (!filters) return { error: "Apply at least one filter before saving a view." };

  const { db, user, districtId } = await getTenantDb();
  if (!userCan(user, "view_dashboards")) {
    return { error: "You do not have permission to save a view." };
  }

  const existing = await db.savedView.findFirst({ where: { name } });

  if (existing) {
    // Same name, new filters: an UPDATE, not a duplicate-name error. Someone refining
    // "Special Revenue funds" and saving it again means to refine the shared view, and
    // making them delete the old one first is a step with no purpose.
    await db.savedView.updateMany({ where: { id: existing.id }, data: { filters } });
  } else {
    // districtId is injected by the tenant extension, so it is absent from the literal and
    // Prisma's create input type does not know that.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.savedView.create({ data: { name, filters, createdByUserId: user.id } as any });
  }

  await writeAudit({
    action: existing ? "SAVED_VIEW_UPDATED" : "SAVED_VIEW_CREATED",
    actorUserId: user.id,
    districtId,
    entityType: "Saved view",
    entityId: name,
    metadata: { name, filters },
  });

  revalidatePath(path);
  return { success: existing ? `"${name}" updated.` : `"${name}" saved.` };
}

export async function deleteView(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "").trim();
  const path = String(formData.get("path") ?? "/dashboard");
  if (!id) return { error: "No view was named." };

  const { db, user, districtId } = await getTenantDb();
  if (!userCan(user, "view_dashboards")) {
    return { error: "You do not have permission to delete a view." };
  }

  // Read before delete so the audit entry can carry what was removed — a district-wide
  // view is worth being able to reconstruct, and `deleteMany` returns only a count.
  const view = await db.savedView.findFirst({ where: { id } });
  if (!view) return { error: "That view has already been removed." };

  // `deleteMany`, not `delete`: the tenant extension refuses `delete` on a tenant model
  // because a by-id delete carries no `where` it can scope. See lib/tenant-scope.ts.
  await db.savedView.deleteMany({ where: { id } });

  await writeAudit({
    action: "SAVED_VIEW_DELETED",
    actorUserId: user.id,
    districtId,
    entityType: "Saved view",
    entityId: view.name,
    metadata: { name: view.name, filters: view.filters },
  });

  revalidatePath(path);
  return { success: `"${view.name}" deleted.` };
}
