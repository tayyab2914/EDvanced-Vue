"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireAuth } from "@/lib/auth/dal";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { revokeUserSessions, createSession } from "@/lib/auth/session";
import { passwordSchema } from "@/lib/validation/auth";
import { writeAudit } from "@/lib/audit";
import type { FormState } from "@/lib/forms";

/**
 * "My account" — the Spec's known gap (§5.1): "A signed-in user cannot change their own
 * name or password from inside the application; a password change has to go through the
 * forgot-password flow."
 *
 * Folded in at no extra cost, per the Milestone Plan.
 */

const nameSchema = z.object({
  firstName: z.string().trim().min(1, { error: "First name is required." }).max(80),
  lastName: z.string().trim().min(1, { error: "Last name is required." }).max(80),
});

export async function updateMyName(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAuth();

  const parsed = nameSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
  });
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { firstName, lastName } = parsed.data;
  await prisma.user.update({
    where: { id: user.id },
    data: {
      firstName,
      lastName,
      // `name` is the denormalised "First Last" the rest of the product displays. M1 keeps
      // it in sync on every write rather than deriving it, so this does too — a stale one
      // here would show the old name in the audit log and the sidebar.
      name: `${firstName} ${lastName}`,
    },
  });

  await writeAudit({
    action: "USER_UPDATED",
    actorUserId: user.id,
    districtId: user.districtId,
    entityType: "User",
    entityId: user.id,
    metadata: { self: true, field: "name" },
  });

  revalidatePath("/account");
  return { success: "Your name has been updated." };
}

const changePasswordSchema = z
  .object({
    current: z.string().min(1, { error: "Enter your current password." }),
    next: passwordSchema,
    confirm: z.string().min(1, { error: "Confirm your new password." }),
  })
  .refine((v) => v.next === v.confirm, {
    error: "The two passwords don't match.",
    path: ["confirm"],
  });

export async function changeMyPassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAuth();

  const parsed = changePasswordSchema.safeParse({
    current: formData.get("current"),
    next: formData.get("next"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!row?.passwordHash) {
    return { error: "Your account has no password set. Use the forgot-password link instead." };
  }

  // The current password is required even though the session already proves who they are:
  // it is what stops an unattended, unlocked laptop becoming a permanent account takeover.
  const ok = await verifyPassword(row.passwordHash, parsed.data.current);
  if (!ok) {
    return { error: "That isn't your current password.", fieldErrors: { current: ["Incorrect password."] } };
  }

  if (parsed.data.current === parsed.data.next) {
    return {
      error: "That's your current password.",
      fieldErrors: { next: ["Choose a password you haven't used here before."] },
    };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.next) },
  });

  // Every session, everywhere — matching what M1 already does on a password reset. If the
  // reason someone is changing their password is that a session is not theirs, leaving
  // the others alive would defeat the whole act.
  await revokeUserSessions(user.id);
  // ...including this one, so sign them straight back in rather than bouncing them to the
  // login screen for doing the right thing.
  //
  // An external user's new session carries no activeDistrictId, so they land on their
  // districts list and pick one again. That is a fair price for a clean slate, and the
  // alternative — carrying the old selection across a security event — is the wrong
  // instinct.
  await createSession({ id: user.id, role: user.role, districtId: user.districtId });

  await writeAudit({
    action: "PASSWORD_CHANGED",
    actorUserId: user.id,
    districtId: user.districtId,
    entityType: "User",
    entityId: user.id,
    metadata: { self: true },
  });

  revalidatePath("/account");
  return {
    success: "Password changed. You've been signed out everywhere else.",
  };
}
