"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import {
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "@/lib/validation/auth";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import {
  createSession,
  destroySession,
  revokeUserSessions,
} from "@/lib/auth/session";
import { getCurrentUser } from "@/lib/auth/dal";
import {
  isLocked,
  registerFailedAttempt,
  resetFailedAttempts,
} from "@/lib/auth/lockout";
import {
  createVerificationToken,
  consumeVerificationToken,
  RESET_TTL_MS,
} from "@/lib/tokens";
import { sendPasswordResetEmail, buildTokenLink } from "@/lib/email";
import { writeAudit } from "@/lib/audit";
import { homePathForRole } from "@/lib/auth/routes";
import { UserStatus, TokenType } from "@/lib/enums";
import type { FormState } from "@/lib/forms";

async function requestMeta() {
  const h = await headers();
  return {
    ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    userAgent: h.get("user-agent") ?? undefined,
  };
}

export async function login(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Enter a valid email and password." };

  const email = parsed.data.email.toLowerCase();
  const invalid: FormState = { error: "Invalid email or password." };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    await writeAudit({ action: "LOGIN_FAILED", metadata: { email } });
    return invalid;
  }
  if (user.status === UserStatus.DISABLED) {
    await writeAudit({
      action: "LOGIN_FAILED",
      actorUserId: user.id,
      districtId: user.districtId,
      metadata: { reason: "disabled" },
    });
    return { error: "This account has been disabled. Contact your administrator." };
  }
  if (isLocked(user)) {
    await writeAudit({
      action: "LOGIN_BLOCKED",
      actorUserId: user.id,
      districtId: user.districtId,
      metadata: { reason: "locked" },
    });
    return {
      error: "Account temporarily locked from repeated failed attempts. Try again shortly.",
    };
  }

  const ok = await verifyPassword(user.passwordHash, parsed.data.password);
  if (!ok) {
    const { locked } = await registerFailedAttempt(user.id);
    await writeAudit({
      action: locked ? "ACCOUNT_LOCKED" : "LOGIN_FAILED",
      actorUserId: user.id,
      districtId: user.districtId,
    });
    return locked
      ? { error: "Too many failed attempts. Account locked for 15 minutes." }
      : invalid;
  }

  await resetFailedAttempts(user.id);
  await createSession(
    { id: user.id, role: user.role, districtId: user.districtId },
    await requestMeta(),
  );
  await writeAudit({
    action: "LOGIN_SUCCESS",
    actorUserId: user.id,
    districtId: user.districtId,
  });

  redirect(homePathForRole(user.role));
}

export async function logout(): Promise<void> {
  const user = await getCurrentUser();
  await destroySession();
  if (user) {
    await writeAudit({
      action: "LOGOUT",
      actorUserId: user.id,
      districtId: user.districtId,
    });
  }
  redirect("/login");
}

export async function requestPasswordReset(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  // Always return the same message to prevent account enumeration.
  const generic: FormState = {
    success: "If that email is registered, we've sent a reset link.",
  };

  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return generic;

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (user && user.status !== UserStatus.DISABLED) {
    const raw = await createVerificationToken(
      user.id,
      TokenType.PASSWORD_RESET,
      RESET_TTL_MS,
    );
    await sendPasswordResetEmail(user.email, user.name, buildTokenLink(raw));
    await writeAudit({
      action: "PASSWORD_RESET_REQUESTED",
      actorUserId: user.id,
      districtId: user.districtId,
    });
  }
  return generic;
}

/** Sets a password from an INVITE or PASSWORD_RESET token, then requires a fresh login. */
export async function setPassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return {
      error: fieldErrors.password?.[0] ?? "Please choose a valid password.",
    };
  }

  const result = await consumeVerificationToken(parsed.data.token);
  if (!result) {
    return { error: "This link is invalid or has expired. Request a new one." };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const user = await prisma.user.update({
    where: { id: result.userId },
    data: {
      passwordHash,
      status: UserStatus.ACTIVE,
      // Consuming a link we emailed them proves they control the current address.
      emailVerifiedAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
    select: { id: true, districtId: true },
  });
  await revokeUserSessions(user.id);
  await writeAudit({
    action:
      result.type === TokenType.INVITE
        ? "INVITE_ACCEPTED"
        : "PASSWORD_RESET_COMPLETED",
    actorUserId: user.id,
    districtId: user.districtId,
  });

  redirect("/login?reset=1");
}
