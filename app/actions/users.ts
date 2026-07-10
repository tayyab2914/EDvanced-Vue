"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAuth, type CurrentUser } from "@/lib/auth/dal";
import { createUserSchema, ASSIGNABLE_ROLES } from "@/lib/validation/user";
import { createVerificationToken, INVITE_TTL_MS } from "@/lib/tokens";
import { sendInviteEmail, buildTokenLink } from "@/lib/email";
import { revokeUserSessions } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { Role, UserStatus, TokenType } from "@/lib/enums";
import { isProduction } from "@/lib/env";
import type { FormState } from "@/lib/forms";

function canManageUsers(actor: CurrentUser, districtId: string): boolean {
  return (
    actor.role === Role.PLATFORM_ADMIN ||
    (actor.role === Role.DISTRICT_ADMIN && actor.districtId === districtId)
  );
}

function revalidateUsers(districtId: string) {
  revalidatePath(`/platform/districts/${districtId}/users`);
  revalidatePath("/district/users");
}

export async function createUser(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const districtId = String(formData.get("districtId") ?? "");
  const actor = await requireAuth();
  if (!districtId || !canManageUsers(actor, districtId)) {
    return { error: "You are not authorized to manage users for this district." };
  }

  const parsed = createUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return {
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const email = parsed.data.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) {
    return {
      error: "A user with that email already exists.",
      fieldErrors: { email: ["Already in use."] },
    };
  }

  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email,
      role: parsed.data.role as Role,
      status: UserStatus.INVITED,
      districtId,
    },
    select: { id: true, name: true, email: true },
  });
  const link = buildTokenLink(
    await createVerificationToken(user.id, TokenType.INVITE, INVITE_TTL_MS),
  );
  await sendInviteEmail(user.email, user.name, link);
  await writeAudit({
    action: "USER_INVITED",
    actorUserId: actor.id,
    districtId,
    entityType: "User",
    entityId: user.id,
    metadata: { email, role: parsed.data.role },
  });
  revalidateUsers(districtId);

  return {
    success: isProduction
      ? `Invitation sent to ${email}.`
      : `Invitation created for ${email}.\nDev link: ${link}`,
  };
}

export async function changeUserRole(formData: FormData): Promise<void> {
  const districtId = String(formData.get("districtId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  const actor = await requireAuth();
  if (!canManageUsers(actor, districtId)) return;
  if (!ASSIGNABLE_ROLES.includes(role as (typeof ASSIGNABLE_ROLES)[number])) return;

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { districtId: true, role: true },
  });
  if (!target || target.districtId !== districtId) return;
  if (target.role === Role.PLATFORM_ADMIN) return;

  await prisma.user.update({
    where: { id: userId },
    data: { role: role as Role },
  });
  await writeAudit({
    action: "USER_ROLE_CHANGED",
    actorUserId: actor.id,
    districtId,
    entityType: "User",
    entityId: userId,
    metadata: { role },
  });
  revalidateUsers(districtId);
}

export async function setUserStatus(formData: FormData): Promise<void> {
  const districtId = String(formData.get("districtId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const status = String(formData.get("status") ?? "");
  const actor = await requireAuth();
  if (!canManageUsers(actor, districtId)) return;
  if (status !== UserStatus.ACTIVE && status !== UserStatus.DISABLED) return;
  if (userId === actor.id) return; // never disable yourself

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { districtId: true, role: true },
  });
  if (!target || target.districtId !== districtId) return;
  if (target.role === Role.PLATFORM_ADMIN) return;

  await prisma.user.update({
    where: { id: userId },
    data: { status: status as UserStatus },
  });
  if (status === UserStatus.DISABLED) await revokeUserSessions(userId);
  await writeAudit({
    action: status === UserStatus.DISABLED ? "USER_DISABLED" : "USER_ENABLED",
    actorUserId: actor.id,
    districtId,
    entityType: "User",
    entityId: userId,
  });
  revalidateUsers(districtId);
}

export async function resendInvite(formData: FormData): Promise<void> {
  const districtId = String(formData.get("districtId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const actor = await requireAuth();
  if (!canManageUsers(actor, districtId)) return;

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, districtId: true, status: true },
  });
  if (!target || target.districtId !== districtId) return;
  if (target.status !== UserStatus.INVITED) return;

  const link = buildTokenLink(
    await createVerificationToken(target.id, TokenType.INVITE, INVITE_TTL_MS),
  );
  await sendInviteEmail(target.email, target.name, link);
  await writeAudit({
    action: "USER_INVITE_RESENT",
    actorUserId: actor.id,
    districtId,
    entityType: "User",
    entityId: userId,
  });
  revalidateUsers(districtId);
}

export async function unlockUser(formData: FormData): Promise<void> {
  const districtId = String(formData.get("districtId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const actor = await requireAuth();
  if (!canManageUsers(actor, districtId)) return;

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { districtId: true },
  });
  if (!target || target.districtId !== districtId) return;

  await prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });
  await writeAudit({
    action: "USER_UNLOCKED",
    actorUserId: actor.id,
    districtId,
    entityType: "User",
    entityId: userId,
  });
  revalidateUsers(districtId);
}
