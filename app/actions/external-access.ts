"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, type CurrentUser } from "@/lib/auth/dal";
import {
  setActiveDistrict,
  clearActiveDistrict,
  revokeUserSessions,
} from "@/lib/auth/session";
import {
  approveAccessSchema,
  changeLevelSchema,
  extendAccessSchema,
  externalInviteSchema,
  platformExternalUserSchema,
} from "@/lib/validation/external-access";
import { fullName } from "@/lib/validation/user";
import {
  ACCESS_LEVEL_LABELS,
  isGrantLive,
} from "@/lib/external-access";
import { accessRequestRecipients } from "@/lib/external-access-db";
import { createVerificationToken, INVITE_TTL_MS } from "@/lib/tokens";
import {
  buildTokenLink,
  sendInviteEmail,
  sendAccessRequestEmail,
  sendAccessApprovedEmail,
  sendAccessClosedEmail,
} from "@/lib/email";
import { writeAudit } from "@/lib/audit";
import { formatDate } from "@/lib/format";
import { isProduction } from "@/lib/env";
import {
  ExternalAccessLevel,
  ExternalAccessStatus,
  Role,
  TokenType,
  UserStatus,
} from "@/lib/enums";
import type { FormState } from "@/lib/forms";

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/** Only a district's own admin (or a platform admin) decides that district's external access. */
function canDecide(actor: CurrentUser, districtId: string): boolean {
  return (
    actor.role === Role.PLATFORM_ADMIN ||
    (actor.role === Role.DISTRICT_ADMIN && actor.districtId === districtId)
  );
}

function revalidateExternal(districtId?: string) {
  revalidatePath("/users");
  revalidatePath("/platform/external-users");
  revalidatePath("/districts");
  if (districtId) revalidatePath(`/platform/districts/${districtId}/users`);
}

/**
 * Resolves the email to the user we should attach a grant to.
 *  - unknown address        → we create the external user (caller sends the invite)
 *  - existing EXTERNAL_USER → reuse them; they already have a password, so NO invite
 *  - existing internal user → refuse. Otherwise a district admin could mint external
 *    access for another district's finance user, or shadow their own staff.
 */
async function resolveExternalTarget(email: string): Promise<
  | { ok: true; user: { id: string; name: string; email: string } | null }
  | { ok: false; error: FormState }
> {
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!existing) return { ok: true, user: null };
  if (existing.role !== Role.EXTERNAL_USER) {
    return {
      ok: false,
      error: {
        error: "That email already belongs to a district user.",
        fieldErrors: { email: ["Already in use by a non-external user."] },
      },
    };
  }
  return { ok: true, user: existing };
}

// ---------------------------------------------------------------------------
// Platform admin
// ---------------------------------------------------------------------------

/**
 * Adds an external user and asks each selected district for approval. The invite goes out
 * immediately — they can set a password and sign in right away — but they see only
 * "Awaiting approval" until a district lets them in.
 */
export async function createExternalUser(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireRole(Role.PLATFORM_ADMIN);

  const parsed = platformExternalUserSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    districtIds: formData.getAll("districtIds").map(String),
  });
  if (!parsed.success) {
    return {
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const email = parsed.data.email.toLowerCase();
  const target = await resolveExternalTarget(email);
  if (!target.ok) return target.error;

  // Only assign districts that actually exist — a forged id must not create a dangling grant.
  const districts = await prisma.district.findMany({
    where: { id: { in: parsed.data.districtIds } },
    select: { id: true, name: true },
  });
  if (!districts.length) return { error: "Select at least one valid district." };

  const name = fullName(parsed.data.firstName, parsed.data.lastName);
  const isNew = !target.user;

  const userId =
    target.user?.id ??
    (
      await prisma.user.create({
        data: {
          name,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          email,
          role: Role.EXTERNAL_USER,
          status: UserStatus.INVITED,
          districtId: null, // external users span districts — access lives in ExternalAccess
        },
        select: { id: true },
      })
    ).id;

  // upsert, not create: a previously DENIED/REVOKED row still exists and would collide with
  // @@unique([userId, districtId]). Re-assigning puts it back to PENDING for a fresh decision.
  for (const district of districts) {
    await prisma.externalAccess.upsert({
      where: { userId_districtId: { userId, districtId: district.id } },
      create: {
        userId,
        districtId: district.id,
        status: ExternalAccessStatus.PENDING,
        requestedByUserId: admin.id,
      },
      update: {
        status: ExternalAccessStatus.PENDING,
        level: null,
        expiresAt: null,
        decidedByUserId: null,
        decidedAt: null,
        requestedByUserId: admin.id,
      },
    });
    await writeAudit({
      action: "EXTERNAL_ACCESS_REQUESTED",
      actorUserId: admin.id,
      districtId: district.id,
      entityType: "ExternalAccess",
      entityId: userId,
      metadata: { email, district: district.name },
    });
  }

  let inviteLink: string | undefined;
  if (isNew) {
    inviteLink = buildTokenLink(
      await createVerificationToken(userId, TokenType.INVITE, INVITE_TTL_MS),
    );
    await sendInviteEmail(email, name, inviteLink);
    await writeAudit({
      action: "EXTERNAL_USER_CREATED",
      actorUserId: admin.id,
      entityType: "User",
      entityId: userId,
      metadata: { email },
    });
  }

  // Tell each district there's someone waiting on them.
  for (const district of districts) {
    const recipients = await accessRequestRecipients(district.id);
    for (const r of recipients) {
      await sendAccessRequestEmail(r.email, r.name, name, district.name);
    }
  }

  revalidateExternal();
  const where = districts.map((d) => d.name).join(", ");
  const base = isNew
    ? `${name} was added and access was requested from ${where}.`
    : `Access to ${where} was requested for ${name}.`;
  return {
    success:
      !isProduction && inviteLink ? `${base}\nDev invite link: ${inviteLink}` : base,
  };
}

/** Withdraws a request a district hasn't decided on yet. Never touches a live grant. */
export async function withdrawAssignment(formData: FormData): Promise<void> {
  const admin = await requireRole(Role.PLATFORM_ADMIN);
  const grantId = String(formData.get("grantId") ?? "");

  const grant = await prisma.externalAccess.findUnique({
    where: { id: grantId },
    select: { id: true, status: true, districtId: true, userId: true },
  });
  if (!grant || grant.status !== ExternalAccessStatus.PENDING) return;

  await prisma.externalAccess.delete({ where: { id: grant.id } });
  await writeAudit({
    action: "EXTERNAL_ACCESS_WITHDRAWN",
    actorUserId: admin.id,
    districtId: grant.districtId,
    entityType: "ExternalAccess",
    entityId: grant.userId,
  });
  revalidateExternal(grant.districtId);
}

/**
 * Account-level lifecycle for an external user (disable / enable / delete / unlock / resend
 * invite). These live here, platform-only, rather than in app/actions/users.ts, because every
 * guard in that file is scoped by `target.districtId === districtId` — and an external user's
 * districtId is NULL, so those actions can never match one.
 *
 * Districts deliberately cannot do this: a district revokes its OWN grant (revokeAccess); it
 * does not get to disable a person who also works with four other districts.
 */
async function loadExternalUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, status: true },
  });
  return user && user.role === Role.EXTERNAL_USER ? user : null;
}

export async function setExternalUserStatus(formData: FormData): Promise<void> {
  const admin = await requireRole(Role.PLATFORM_ADMIN);
  const status = String(formData.get("status") ?? "");
  if (status !== UserStatus.ACTIVE && status !== UserStatus.DISABLED) return;

  const target = await loadExternalUser(String(formData.get("userId") ?? ""));
  if (!target) return;

  await prisma.user.update({
    where: { id: target.id },
    data: { status: status as UserStatus },
  });
  // Disabling the ACCOUNT does end every session — unlike revoking one district's grant.
  if (status === UserStatus.DISABLED) await revokeUserSessions(target.id);

  await writeAudit({
    action: status === UserStatus.DISABLED ? "USER_DISABLED" : "USER_ENABLED",
    actorUserId: admin.id,
    entityType: "User",
    entityId: target.id,
    metadata: { email: target.email, external: true },
  });
  revalidateExternal();
}

export async function deleteExternalUser(formData: FormData): Promise<void> {
  const admin = await requireRole(Role.PLATFORM_ADMIN);
  const target = await loadExternalUser(String(formData.get("userId") ?? ""));
  if (!target) return;

  // Grants, sessions and tokens cascade. The audit trail survives by design.
  await prisma.user.delete({ where: { id: target.id } });
  await writeAudit({
    action: "USER_DELETED",
    actorUserId: admin.id,
    entityType: "User",
    entityId: target.id,
    metadata: { email: target.email, external: true },
  });
  revalidateExternal();
}

export async function unlockExternalUser(formData: FormData): Promise<void> {
  const admin = await requireRole(Role.PLATFORM_ADMIN);
  const target = await loadExternalUser(String(formData.get("userId") ?? ""));
  if (!target) return;

  await prisma.user.update({
    where: { id: target.id },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });
  await writeAudit({
    action: "USER_UNLOCKED",
    actorUserId: admin.id,
    entityType: "User",
    entityId: target.id,
    metadata: { email: target.email, external: true },
  });
  revalidateExternal();
}

export async function resendExternalInvite(formData: FormData): Promise<void> {
  const admin = await requireRole(Role.PLATFORM_ADMIN);
  const target = await loadExternalUser(String(formData.get("userId") ?? ""));
  if (!target || target.status !== UserStatus.INVITED) return;

  const link = buildTokenLink(
    await createVerificationToken(target.id, TokenType.INVITE, INVITE_TTL_MS),
  );
  await sendInviteEmail(target.email, target.name, link);
  await writeAudit({
    action: "USER_INVITE_RESENT",
    actorUserId: admin.id,
    entityType: "User",
    entityId: target.id,
    metadata: { email: target.email, external: true },
  });
  revalidateExternal();
}

// ---------------------------------------------------------------------------
// District admin
// ---------------------------------------------------------------------------

/** Loads a grant and checks the actor is entitled to decide it. */
async function loadDecidableGrant(actor: CurrentUser, grantId: string) {
  const grant = await prisma.externalAccess.findUnique({
    where: { id: grantId },
    select: {
      id: true,
      userId: true,
      districtId: true,
      status: true,
      level: true,
      expiresAt: true,
      user: { select: { name: true, email: true } },
      district: { select: { name: true } },
    },
  });
  if (!grant || !canDecide(actor, grant.districtId)) return null;
  return grant;
}

/** Approves a pending request, setting the permission level and expiry (max 30 days). */
export async function approveAccess(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireAuth();
  const grant = await loadDecidableGrant(actor, String(formData.get("grantId") ?? ""));
  if (!grant) return { error: "You are not authorized to decide this request." };
  if (grant.status !== ExternalAccessStatus.PENDING) {
    return { error: "That request has already been decided." };
  }

  const parsed = approveAccessSchema.safeParse({
    level: formData.get("level"),
    expiresAt: formData.get("expiresAt"),
  });
  if (!parsed.success) {
    return {
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  await prisma.externalAccess.update({
    where: { id: grant.id },
    data: {
      status: ExternalAccessStatus.ACTIVE,
      level: parsed.data.level as ExternalAccessLevel,
      expiresAt: parsed.data.expiresAt,
      decidedByUserId: actor.id,
      decidedAt: new Date(),
    },
  });
  await writeAudit({
    action: "EXTERNAL_ACCESS_APPROVED",
    actorUserId: actor.id,
    districtId: grant.districtId,
    entityType: "ExternalAccess",
    entityId: grant.userId,
    metadata: {
      email: grant.user.email,
      level: parsed.data.level,
      expiresAt: parsed.data.expiresAt.toISOString(),
    },
  });
  await sendAccessApprovedEmail(
    grant.user.email,
    grant.user.name,
    grant.district.name,
    ACCESS_LEVEL_LABELS[parsed.data.level as ExternalAccessLevel],
    formatDate(parsed.data.expiresAt),
  );

  revalidateExternal(grant.districtId);
  return { success: `${grant.user.name} now has access until ${formatDate(parsed.data.expiresAt)}.` };
}

/** Declines a pending request. */
export async function denyAccess(formData: FormData): Promise<void> {
  const actor = await requireAuth();
  const grant = await loadDecidableGrant(actor, String(formData.get("grantId") ?? ""));
  if (!grant || grant.status !== ExternalAccessStatus.PENDING) return;

  await prisma.externalAccess.update({
    where: { id: grant.id },
    data: {
      status: ExternalAccessStatus.DENIED,
      decidedByUserId: actor.id,
      decidedAt: new Date(),
    },
  });
  await writeAudit({
    action: "EXTERNAL_ACCESS_DENIED",
    actorUserId: actor.id,
    districtId: grant.districtId,
    entityType: "ExternalAccess",
    entityId: grant.userId,
    metadata: { email: grant.user.email },
  });
  await sendAccessClosedEmail(
    grant.user.email,
    grant.user.name,
    grant.district.name,
    "denied",
  );
  revalidateExternal(grant.districtId);
}

/**
 * Pushes the expiry out. The 30-day cap is measured from today, so this is exactly
 * "up to 30 days from the update". Also re-activates a grant that has lapsed — extending
 * an expired grant is how a district lets someone back in.
 */
export async function extendAccess(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireAuth();
  const grant = await loadDecidableGrant(actor, String(formData.get("grantId") ?? ""));
  if (!grant) return { error: "You are not authorized to change this access." };
  if (grant.status !== ExternalAccessStatus.ACTIVE) {
    return { error: "Only approved access can be extended." };
  }

  const parsed = extendAccessSchema.safeParse({ expiresAt: formData.get("expiresAt") });
  if (!parsed.success) {
    return {
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  await prisma.externalAccess.update({
    where: { id: grant.id },
    data: { expiresAt: parsed.data.expiresAt },
  });
  await writeAudit({
    action: "EXTERNAL_ACCESS_EXTENDED",
    actorUserId: actor.id,
    districtId: grant.districtId,
    entityType: "ExternalAccess",
    entityId: grant.userId,
    metadata: {
      email: grant.user.email,
      from: grant.expiresAt?.toISOString() ?? null,
      to: parsed.data.expiresAt.toISOString(),
    },
  });
  revalidateExternal(grant.districtId);
  return { success: `Access now runs until ${formatDate(parsed.data.expiresAt)}.` };
}

/** Switches an existing grant between View Only and Full Access. */
export async function changeAccessLevel(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireAuth();
  const grant = await loadDecidableGrant(actor, String(formData.get("grantId") ?? ""));
  if (!grant) return { error: "You are not authorized to change this access." };
  if (grant.status !== ExternalAccessStatus.ACTIVE) {
    return { error: "Only approved access can be changed." };
  }

  const parsed = changeLevelSchema.safeParse({ level: formData.get("level") });
  if (!parsed.success) {
    return {
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  await prisma.externalAccess.update({
    where: { id: grant.id },
    data: { level: parsed.data.level as ExternalAccessLevel },
  });
  await writeAudit({
    action: "EXTERNAL_ACCESS_LEVEL_CHANGED",
    actorUserId: actor.id,
    districtId: grant.districtId,
    entityType: "ExternalAccess",
    entityId: grant.userId,
    metadata: {
      email: grant.user.email,
      from: grant.level,
      to: parsed.data.level,
    },
  });
  revalidateExternal(grant.districtId);
  return {
    success: `${grant.user.name} is now ${ACCESS_LEVEL_LABELS[parsed.data.level as ExternalAccessLevel]}.`,
  };
}

/**
 * Cuts a district's access off immediately. Takes effect on the user's very next request,
 * because the grant is re-read every time — no session revocation needed, and crucially we
 * must NOT revoke sessions here: that would sign them out of their OTHER districts too.
 */
export async function revokeAccess(formData: FormData): Promise<void> {
  const actor = await requireAuth();
  const grant = await loadDecidableGrant(actor, String(formData.get("grantId") ?? ""));
  if (!grant || grant.status !== ExternalAccessStatus.ACTIVE) return;

  await prisma.externalAccess.update({
    where: { id: grant.id },
    data: {
      status: ExternalAccessStatus.REVOKED,
      decidedByUserId: actor.id,
      decidedAt: new Date(),
    },
  });
  // Cosmetic only: stop them landing on a district they can no longer open.
  await clearActiveDistrict(grant.userId, grant.districtId);

  await writeAudit({
    action: "EXTERNAL_ACCESS_REVOKED",
    actorUserId: actor.id,
    districtId: grant.districtId,
    entityType: "ExternalAccess",
    entityId: grant.userId,
    metadata: { email: grant.user.email },
  });
  await sendAccessClosedEmail(
    grant.user.email,
    grant.user.name,
    grant.district.name,
    "revoked",
  );
  revalidateExternal(grant.districtId);
}

/**
 * A district invites an external user itself. The district is the approver, so consenting by
 * inviting means the grant starts ACTIVE — there is nobody left to approve it.
 */
export async function inviteExternalUser(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const districtId = String(formData.get("districtId") ?? "");
  const actor = await requireAuth();
  if (!districtId || !canDecide(actor, districtId)) {
    return { error: "You are not authorized to manage external access for this district." };
  }

  const parsed = externalInviteSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    level: formData.get("level"),
    expiresAt: formData.get("expiresAt"),
  });
  if (!parsed.success) {
    return {
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const email = parsed.data.email.toLowerCase();
  const target = await resolveExternalTarget(email);
  if (!target.ok) return target.error;

  const district = await prisma.district.findUnique({
    where: { id: districtId },
    select: { name: true },
  });
  if (!district) return { error: "District not found." };

  const name = target.user?.name ?? fullName(parsed.data.firstName, parsed.data.lastName);
  const isNew = !target.user;

  const userId =
    target.user?.id ??
    (
      await prisma.user.create({
        data: {
          name,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          email,
          role: Role.EXTERNAL_USER,
          status: UserStatus.INVITED,
          districtId: null,
        },
        select: { id: true },
      })
    ).id;

  await prisma.externalAccess.upsert({
    where: { userId_districtId: { userId, districtId } },
    create: {
      userId,
      districtId,
      status: ExternalAccessStatus.ACTIVE,
      level: parsed.data.level as ExternalAccessLevel,
      expiresAt: parsed.data.expiresAt,
      requestedByUserId: actor.id,
      decidedByUserId: actor.id,
      decidedAt: new Date(),
    },
    update: {
      status: ExternalAccessStatus.ACTIVE,
      level: parsed.data.level as ExternalAccessLevel,
      expiresAt: parsed.data.expiresAt,
      decidedByUserId: actor.id,
      decidedAt: new Date(),
    },
  });

  await writeAudit({
    action: "EXTERNAL_ACCESS_APPROVED",
    actorUserId: actor.id,
    districtId,
    entityType: "ExternalAccess",
    entityId: userId,
    metadata: {
      email,
      level: parsed.data.level,
      expiresAt: parsed.data.expiresAt.toISOString(),
      invited: true,
    },
  });

  // A brand-new user needs a password before any of this is reachable; an existing external
  // user already has one, so they get the "you've been granted access" note instead.
  let inviteLink: string | undefined;
  if (isNew) {
    inviteLink = buildTokenLink(
      await createVerificationToken(userId, TokenType.INVITE, INVITE_TTL_MS),
    );
    await sendInviteEmail(email, name, inviteLink);
  } else {
    await sendAccessApprovedEmail(
      email,
      name,
      district.name,
      ACCESS_LEVEL_LABELS[parsed.data.level as ExternalAccessLevel],
      formatDate(parsed.data.expiresAt),
    );
  }

  revalidateExternal(districtId);
  const base = `${name} now has ${ACCESS_LEVEL_LABELS[parsed.data.level as ExternalAccessLevel].toLowerCase()} until ${formatDate(parsed.data.expiresAt)}.`;
  return {
    success:
      !isProduction && inviteLink ? `${base}\nDev invite link: ${inviteLink}` : base,
  };
}

// ---------------------------------------------------------------------------
// External user
// ---------------------------------------------------------------------------

/** Enters a district. Only ever succeeds for a grant that is live right now. */
export async function switchDistrict(formData: FormData): Promise<void> {
  const user = await requireAuth();
  if (user.role !== Role.EXTERNAL_USER) return;

  const districtId = String(formData.get("districtId") ?? "");
  const grant = await prisma.externalAccess.findUnique({
    where: { userId_districtId: { userId: user.id, districtId } },
    select: { status: true, expiresAt: true, district: { select: { status: true } } },
  });
  // Re-check liveness here rather than trusting the button that was rendered: the grant may
  // have been revoked or lapsed since the page was served.
  if (!grant || !isGrantLive(grant) || grant.district.status !== "ACTIVE") {
    redirect("/districts");
  }

  await setActiveDistrict(districtId);
  // The whole shell (district name, nav, permissions) is derived from the active district,
  // so every cached segment has to be rebuilt — otherwise another tab could keep rendering
  // the previous district's chrome.
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
