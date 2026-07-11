"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth/dal";
import * as z from "zod";
import { districtSchema, districtSettingsSchema } from "@/lib/validation/district";
import { fullName } from "@/lib/validation/user";
import { createVerificationToken, INVITE_TTL_MS } from "@/lib/tokens";
import { sendInviteEmail, buildTokenLink } from "@/lib/email";
import { writeAudit } from "@/lib/audit";
import { Role, DistrictStatus, UserStatus, TokenType } from "@/lib/enums";
import { isProduction } from "@/lib/env";
import type { FormState } from "@/lib/forms";

export async function createDistrict(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireRole(Role.PLATFORM_ADMIN);

  const parsed = districtSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    fiscalYearStartMonth: formData.get("fiscalYearStartMonth"),
    state: formData.get("state"),
  });
  if (!parsed.success) {
    return {
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const code = parsed.data.code.toLowerCase();

  // Optional first District Admin.
  const adminEmailRaw = String(formData.get("adminEmail") ?? "").trim();
  const wantsAdmin = !!adminEmailRaw;
  let adminEmail = "";
  let adminName = "";
  let adminFirst = "";
  let adminLast = "";
  if (wantsAdmin) {
    const emailParsed = z.email().safeParse(adminEmailRaw);
    if (!emailParsed.success) {
      return {
        error: "Please fix the errors below.",
        fieldErrors: { adminEmail: ["Enter a valid email address."] },
      };
    }
    adminEmail = emailParsed.data.toLowerCase();
    adminName =
      String(formData.get("adminName") ?? "").trim() || "District Administrator";
    const parts = adminName.split(/\s+/);
    adminFirst = parts[0];
    adminLast = parts.slice(1).join(" ");
    adminName = fullName(adminFirst, adminLast);
    if (await prisma.user.findUnique({ where: { email: adminEmail } })) {
      return {
        error: "That admin email is already in use.",
        fieldErrors: { adminEmail: ["Already in use."] },
      };
    }
  }

  if (await prisma.district.findUnique({ where: { code } })) {
    return {
      error: "That district code is already in use.",
      fieldErrors: { code: ["Already in use."] },
    };
  }

  // Create district + (optional) first admin, atomically. Districts start with no
  // account data — each district enters/imports its own (no seeded standards).
  const { districtId, adminUserId } = await prisma.$transaction(async (tx) => {
    const district = await tx.district.create({
      data: {
        name: parsed.data.name,
        code,
        fiscalYearStartMonth: parsed.data.fiscalYearStartMonth,
        state: parsed.data.state,
        status: DistrictStatus.ACTIVE,
      },
      select: { id: true },
    });

    let adminUserId: string | null = null;
    if (wantsAdmin) {
      const user = await tx.user.create({
        data: {
          name: adminName,
          firstName: adminFirst,
          lastName: adminLast,
          email: adminEmail,
          role: Role.DISTRICT_ADMIN,
          status: UserStatus.INVITED,
          districtId: district.id,
        },
        select: { id: true },
      });
      adminUserId = user.id;
    }
    return { districtId: district.id, adminUserId };
  });

  // Side effects after commit: issue invite token + send email.
  let inviteLink: string | undefined;
  if (adminUserId) {
    const raw = await createVerificationToken(
      adminUserId,
      TokenType.INVITE,
      INVITE_TTL_MS,
    );
    inviteLink = buildTokenLink(raw);
    await sendInviteEmail(adminEmail, adminName, inviteLink);
    await writeAudit({
      action: "USER_INVITED",
      actorUserId: admin.id,
      districtId,
      entityType: "User",
      entityId: adminUserId,
      metadata: { email: adminEmail, role: Role.DISTRICT_ADMIN },
    });
  }

  await writeAudit({
    action: "DISTRICT_CREATED",
    actorUserId: admin.id,
    districtId,
    entityType: "District",
    entityId: districtId,
    metadata: { code, name: parsed.data.name },
  });

  revalidatePath("/platform/districts");
  const query =
    !isProduction && inviteLink
      ? `?invite=${encodeURIComponent(inviteLink)}`
      : "";
  redirect(`/platform/districts/${districtId}${query}`);
}

export async function updateDistrictSettings(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const districtId = String(formData.get("districtId") ?? "");
  const actor = await requireAuth();
  // Core district settings (name / state / fiscal year) are platform-managed.
  if (!districtId || actor.role !== Role.PLATFORM_ADMIN) {
    return { error: "Only a platform administrator can change these settings." };
  }

  const parsed = districtSettingsSchema.safeParse({
    name: formData.get("name"),
    fiscalYearStartMonth: formData.get("fiscalYearStartMonth"),
    state: formData.get("state"),
  });
  if (!parsed.success) {
    return {
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  await prisma.district.update({
    where: { id: districtId },
    data: {
      name: parsed.data.name,
      fiscalYearStartMonth: parsed.data.fiscalYearStartMonth,
      state: parsed.data.state,
    },
  });
  await writeAudit({
    action: "DISTRICT_SETTINGS_UPDATED",
    actorUserId: actor.id,
    districtId,
    entityType: "District",
    entityId: districtId,
  });
  revalidatePath(`/platform/districts/${districtId}`);
  revalidatePath("/district/settings");
  return { success: "District settings saved." };
}

export async function setDistrictStatus(formData: FormData): Promise<void> {
  const admin = await requireRole(Role.PLATFORM_ADMIN);
  const districtId = String(formData.get("districtId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (status !== DistrictStatus.ACTIVE && status !== DistrictStatus.INACTIVE) {
    return;
  }
  await prisma.district.update({
    where: { id: districtId },
    data: { status: status as DistrictStatus },
  });
  await writeAudit({
    action: status === DistrictStatus.INACTIVE ? "DISTRICT_DEACTIVATED" : "DISTRICT_ACTIVATED",
    actorUserId: admin.id,
    districtId,
    entityType: "District",
    entityId: districtId,
  });
  revalidatePath("/platform/districts");
  revalidatePath(`/platform/districts/${districtId}`);
}
