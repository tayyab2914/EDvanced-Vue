"use server";

import { revalidatePath } from "next/cache";
import { resolveTenantDb, userCan } from "@/lib/auth/dal";
import { writeAudit } from "@/lib/audit";
import { datasetByKind } from "@/lib/datasets/kinds";
import { validateBatch } from "@/lib/validation/import/engine";
import { commitBatch, restoreVersion, CommitError } from "@/lib/import/commit";
import { clearStagedRows } from "@/lib/import/stage";
import type { FormState } from "@/lib/forms";
import type { DatasetKind, ImportAction } from "@/lib/enums";
import type { CurrentUser } from "@/lib/auth/dal";

/**
 * The steps of the lifecycle a user drives (Spec §7). Upload itself is a Route Handler,
 * not an action — Server Actions cap request bodies at 1MB. See app/api/import/upload.
 *
 * Every action re-checks permission. The button being hidden is not a permission model,
 * and `userCan` (not `hasPermission`) is the one to use: an external user's granted level
 * decides this, so a View Only auditor is refused here even though they can read the
 * same screens.
 */

function canUpload(user: CurrentUser, districtId: string): boolean {
  return (
    userCan(user, "upload_data") &&
    (user.role === "PLATFORM_ADMIN" || user.districtId === districtId)
  );
}

function canManageVersions(user: CurrentUser, districtId: string): boolean {
  return (
    userCan(user, "manage_versions") &&
    (user.role === "PLATFORM_ADMIN" || user.districtId === districtId)
  );
}

/** Step 4 — "Legitimate anomalies are reviewed and acknowledged." */
export async function acknowledgeWarnings(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const batchId = String(formData.get("batchId") ?? "");
  const { db, user, districtId } = await resolveTenantDb(
    String(formData.get("districtId") ?? "") || undefined,
  );
  if (!canUpload(user, districtId)) {
    return { error: "You are not authorized to import data for this district." };
  }

  const batch = await db.importBatch.findFirst({ where: { id: batchId } });
  if (!batch) return { error: "That upload no longer exists." };
  if (batch.errorCount > 0) {
    // Warnings can be acknowledged; errors cannot. Conflating them would let a district
    // wave through a file that is actually broken.
    return { error: "Fix the errors first — warnings can only be acknowledged once the file imports cleanly." };
  }

  await db.importBatch.updateMany({
    where: { id: batchId },
    data: { warningsAckedAt: new Date() },
  });

  await writeAudit({
    action: "DATA_WARNINGS_ACKNOWLEDGED",
    actorUserId: user.id,
    districtId,
    entityType: datasetByKind(batch.dataset as DatasetKind).label,
    entityId: batchId,
    metadata: { warnings: batch.warningCount },
  });

  revalidatePath(`/data/batches/${batchId}`);
  return { success: `${batch.warningCount} warning${batch.warningCount === 1 ? "" : "s"} acknowledged.` };
}

/** Re-runs validation over the staged rows. */
export async function revalidate(_prev: FormState, formData: FormData): Promise<FormState> {
  const batchId = String(formData.get("batchId") ?? "");
  const { db, user, districtId } = await resolveTenantDb(
    String(formData.get("districtId") ?? "") || undefined,
  );
  if (!canUpload(user, districtId)) {
    return { error: "You are not authorized to import data for this district." };
  }

  try {
    const summary = await validateBatch(db, batchId);
    revalidatePath(`/data/batches/${batchId}`);
    return {
      success: summary.canProceed
        ? `Validated: ${summary.rowsValid} rows ready to import.`
        : `${summary.errorCount} error${summary.errorCount === 1 ? "" : "s"} to fix.`,
    };
  } catch (e) {
    console.error("[import] revalidate failed:", e);
    return { error: "We couldn't validate that upload. Please try uploading the file again." };
  }
}

/** Steps 5 & 6 — the duplicate choice, then commit and version. */
export async function commitImport(_prev: FormState, formData: FormData): Promise<FormState> {
  const batchId = String(formData.get("batchId") ?? "");
  const action = String(formData.get("action") ?? "") as ImportAction;
  const { db, user, districtId } = await resolveTenantDb(
    String(formData.get("districtId") ?? "") || undefined,
  );
  if (!canUpload(user, districtId)) {
    return { error: "You are not authorized to import data for this district." };
  }

  try {
    const result = await commitBatch(db, { batchId, action, userId: user.id });
    const batch = await db.importBatch.findFirst({ where: { id: batchId } });
    const label = batch ? datasetByKind(batch.dataset as DatasetKind).label : "Data";

    await writeAudit({
      action: "DATA_COMMITTED",
      actorUserId: user.id,
      districtId,
      entityType: label,
      entityId: result.versionId,
      metadata: {
        batchId,
        action: result.action,
        version: result.version,
        rows: result.rowCount,
        supersededVersion: result.supersededVersion,
      },
    });

    revalidatePath("/data/versions");
    revalidatePath(`/data/batches/${batchId}`);
    return {
      success:
        result.action === "REPLACED"
          ? `Imported ${result.rowCount} rows as v${result.version}, replacing v${result.supersededVersion}.`
          : `Imported ${result.rowCount} rows as v${result.version}.`,
    };
  } catch (e) {
    // CommitError carries sentences written for the district. Anything else is ours to
    // fix and theirs to be spared.
    if (e instanceof CommitError) return { error: e.message };
    console.error("[import] commit failed:", e);
    return { error: "We couldn't import that data. Nothing was changed — please try again." };
  }
}

/** The "cancel the upload" arm of the duplicate prompt: abort with no changes. */
export async function cancelImport(_prev: FormState, formData: FormData): Promise<FormState> {
  const batchId = String(formData.get("batchId") ?? "");
  const { db, user, districtId } = await resolveTenantDb(
    String(formData.get("districtId") ?? "") || undefined,
  );
  if (!canUpload(user, districtId)) {
    return { error: "You are not authorized to import data for this district." };
  }

  const batch = await db.importBatch.findFirst({ where: { id: batchId } });
  if (!batch) return { error: "That upload no longer exists." };
  if (batch.status === "COMMITTED") {
    return { error: "That upload has already been imported — cancel it by replacing the version instead." };
  }

  // Drop the staged rows. The batch record stays: "someone tried and cancelled" is a
  // fact worth keeping, and it costs one row.
  await clearStagedRows(db, batchId);
  await db.importBatch.updateMany({ where: { id: batchId }, data: { status: "CANCELLED" } });

  await writeAudit({
    action: "DATA_UPLOAD_CANCELLED",
    actorUserId: user.id,
    districtId,
    entityType: datasetByKind(batch.dataset as DatasetKind).label,
    entityId: batchId,
  });

  revalidatePath("/data/versions");
  return { success: "Upload cancelled. Nothing was changed." };
}

/** Makes an earlier version current again, by copying it forward as a new one. */
export async function restoreDatasetVersion(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const versionId = String(formData.get("versionId") ?? "");
  const { db, user, districtId } = await resolveTenantDb(
    String(formData.get("districtId") ?? "") || undefined,
  );
  if (!canManageVersions(user, districtId)) {
    return { error: "You are not authorized to change versions for this district." };
  }

  try {
    const source = await db.datasetVersion.findFirst({ where: { id: versionId } });
    const result = await restoreVersion(db, { versionId, userId: user.id });

    await writeAudit({
      action: "VERSION_RESTORED",
      actorUserId: user.id,
      districtId,
      entityType: source ? datasetByKind(source.dataset as DatasetKind).label : "Data",
      entityId: result.versionId,
      metadata: {
        restoredFrom: source?.version,
        newVersion: result.version,
        rows: result.rowCount,
      },
    });

    revalidatePath("/data/versions");
    return {
      success: `Restored v${source?.version} as v${result.version}. It is now the current version.`,
    };
  } catch (e) {
    if (e instanceof CommitError) return { error: e.message };
    console.error("[import] restore failed:", e);
    return { error: "We couldn't restore that version. Nothing was changed." };
  }
}
