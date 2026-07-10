import "server-only";
import { prisma } from "@/lib/db";

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;

export function isLocked(user: { lockedUntil: Date | null }): boolean {
  return !!user.lockedUntil && user.lockedUntil > new Date();
}

/**
 * Records a failed login. Returns `{ locked: true }` when this attempt trips the
 * threshold and the account is now locked.
 */
export async function registerFailedAttempt(
  userId: string,
): Promise<{ locked: boolean }> {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: { increment: 1 } },
    select: { failedLoginAttempts: true },
  });

  if (updated.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000),
        failedLoginAttempts: 0,
      },
    });
    return { locked: true };
  }
  return { locked: false };
}

/** Clears the failed-attempt counter / lock and stamps last login on success. */
export async function resetFailedAttempts(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    },
  });
}
