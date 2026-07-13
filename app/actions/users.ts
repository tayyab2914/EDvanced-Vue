"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAuth, type CurrentUser } from "@/lib/auth/dal";
import {
  createUserSchema,
  editUserSchema,
  fullName,
} from "@/lib/validation/user";
import {
  createVerificationToken,
  INVITE_TTL_MS,
  RESET_TTL_MS,
} from "@/lib/tokens";
import {
  sendInviteEmail,
  sendPasswordResetEmail,
  buildTokenLink,
} from "@/lib/email";
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

/**
 * This file manages a district's OWN members. External users are not members of any district
 * (their User.districtId is NULL — access lives in ExternalAccess), so they must never be
 * reachable here: a district manages an external user's *access* via app/actions/external-access.ts
 * (approve / change level / revoke), and only a platform admin touches the account itself.
 *
 * The `target.districtId !== districtId` checks below already exclude them, since NULL never
 * equals a district id. This makes that exclusion explicit rather than incidental, so that
 * tightening or loosening those checks later can't silently expose external users.
 */
function isManageableTarget(target: { role: Role }): boolean {
  return target.role !== Role.PLATFORM_ADMIN && target.role !== Role.EXTERNAL_USER;
}

function revalidateUsers() {
  revalidatePath("/users");
  revalidatePath("/platform/districts/[districtId]/users", "page");
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
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
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

  const name = fullName(parsed.data.firstName, parsed.data.lastName);
  const user = await prisma.user.create({
    data: {
      name,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      email,
      role: parsed.data.role as Role,
      status: UserStatus.INVITED,
      districtId,
    },
    select: { id: true, email: true },
  });
  const link = buildTokenLink(
    await createVerificationToken(user.id, TokenType.INVITE, INVITE_TTL_MS),
  );
  await sendInviteEmail(user.email, name, link);
  await writeAudit({
    action: "USER_INVITED",
    actorUserId: actor.id,
    districtId,
    entityType: "User",
    entityId: user.id,
    metadata: { email, role: parsed.data.role },
  });
  revalidateUsers();

  return {
    success: isProduction
      ? `Invitation sent to ${email}.`
      : `Invitation created for ${email}.\nDev link: ${link}`,
  };
}

export async function editUser(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const districtId = String(formData.get("districtId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const actor = await requireAuth();
  if (!districtId || !canManageUsers(actor, districtId)) {
    return { error: "You are not authorized to manage users for this district." };
  }

  const parsed = editUserSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return {
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { districtId: true, role: true, email: true },
  });
  if (!target || target.districtId !== districtId) {
    return { error: "User not found in this district." };
  }
  if (!isManageableTarget(target)) {
    return { error: "This user cannot be edited here." };
  }

  const email = parsed.data.email.toLowerCase();
  const emailChanged = email !== target.email.toLowerCase();

  // The email IS the login identity, so a change is a deliberate, confirmed act. The
  // client makes the admin confirm; re-check here so the action can't be driven directly.
  if (emailChanged && formData.get("confirmEmailChange") !== "true") {
    return { error: "Confirm the email change before saving." };
  }
  if (emailChanged && (await prisma.user.findUnique({ where: { email } }))) {
    return {
      error: "A user with that email already exists.",
      fieldErrors: { email: ["Already in use."] },
    };
  }

  const name = fullName(parsed.data.firstName, parsed.data.lastName);
  await prisma.user.update({
    where: { id: userId },
    data: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      name,
      role: parsed.data.role as Role,
      ...(emailChanged
        ? {
            email,
            // The address is the login identity, and the new one is unproven. Reset them
            // to a pending invite: the old password dies with the old address, and they
            // must set a new one via the link mailed to the new address before signing in.
            emailVerifiedAt: null,
            passwordHash: null,
            status: UserStatus.INVITED,
            failedLoginAttempts: 0,
            lockedUntil: null,
          }
        : {}),
    },
  });
  await writeAudit({
    action: "USER_UPDATED",
    actorUserId: actor.id,
    districtId,
    entityType: "User",
    entityId: userId,
    metadata: { role: parsed.data.role },
  });

  if (!emailChanged) {
    revalidateUsers();
    return { success: "User updated." };
  }

  // Signing in with the old address must stop working immediately.
  await revokeUserSessions(userId);
  const link = buildTokenLink(
    await createVerificationToken(userId, TokenType.INVITE, INVITE_TTL_MS),
  );
  await sendInviteEmail(email, name, link);
  await writeAudit({
    action: "USER_EMAIL_CHANGED",
    actorUserId: actor.id,
    districtId,
    entityType: "User",
    entityId: userId,
    metadata: { from: target.email, to: email },
  });
  revalidateUsers();

  return {
    success: isProduction
      ? `Email changed to ${email}. An invite was sent there — they must set a new password before signing in.`
      : `Email changed to ${email}. They must set a new password.\nDev link: ${link}`,
  };
}

export async function deleteUser(formData: FormData): Promise<void> {
  const districtId = String(formData.get("districtId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const actor = await requireAuth();
  if (!canManageUsers(actor, districtId)) return;
  if (userId === actor.id) return; // never delete yourself

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { districtId: true, role: true, email: true },
  });
  if (!target || target.districtId !== districtId) return;
  if (!isManageableTarget(target)) return;

  // Sessions and pending tokens cascade. The audit trail survives by design:
  // AuditLog.actorUserId is deliberately not a foreign key.
  await prisma.user.delete({ where: { id: userId } });
  await writeAudit({
    action: "USER_DELETED",
    actorUserId: actor.id,
    districtId,
    entityType: "User",
    entityId: userId,
    metadata: { email: target.email },
  });
  revalidateUsers();
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
  if (!isManageableTarget(target)) return;

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
  revalidateUsers();
}

export async function resendInvite(formData: FormData): Promise<void> {
  const districtId = String(formData.get("districtId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const actor = await requireAuth();
  if (!canManageUsers(actor, districtId)) return;

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      districtId: true,
      status: true,
      emailVerifiedAt: true,
    },
  });
  if (!target || target.districtId !== districtId) return;
  // Resendable while they're still pending, or while the address on file is unproven —
  // which is the state an admin's email change leaves them in.
  if (target.status !== UserStatus.INVITED && target.emailVerifiedAt) return;

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
  revalidateUsers();
}

export async function adminResetPassword(formData: FormData): Promise<void> {
  const districtId = String(formData.get("districtId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const actor = await requireAuth();
  if (!canManageUsers(actor, districtId)) return;

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, districtId: true, role: true },
  });
  if (!target || target.districtId !== districtId) return;
  if (!isManageableTarget(target)) return;

  const link = buildTokenLink(
    await createVerificationToken(target.id, TokenType.PASSWORD_RESET, RESET_TTL_MS),
  );
  await sendPasswordResetEmail(target.email, target.name, link);
  await writeAudit({
    action: "PASSWORD_RESET_SENT",
    actorUserId: actor.id,
    districtId,
    entityType: "User",
    entityId: userId,
  });
  revalidateUsers();
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
  revalidateUsers();
}
