import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import type { Role } from "@/lib/enums";
import { encryptSession, decryptSession } from "@/lib/auth/jwt";

export type { SessionPayload } from "@/lib/auth/jwt";
export { decryptSession } from "@/lib/auth/jwt";

const COOKIE_NAME = "session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function getSessionToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value;
}

/** Creates a DB session row and sets the signed session cookie. */
export async function createSession(
  user: { id: string; role: Role; districtId: string | null },
  meta?: { ipAddress?: string; userAgent?: string },
): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      expiresAt,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    },
    select: { id: true },
  });

  const token = await encryptSession({
    sessionId: session.id,
    userId: user.id,
    role: user.role,
    districtId: user.districtId,
    expiresAt: expiresAt.toISOString(),
  });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production", // http on localhost, https in prod
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

/** Deletes the current DB session row (if any) and clears the cookie. */
export async function destroySession(): Promise<void> {
  const token = await getSessionToken();
  const payload = await decryptSession(token);
  if (payload?.sessionId) {
    await prisma.session.deleteMany({ where: { id: payload.sessionId } });
  }
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/** Revokes ALL of a user's sessions (used after password reset / disable). */
export async function revokeUserSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

/**
 * Points the CURRENT session at a district (external users only). This is untrusted UI
 * state — `getCurrentUser()` re-validates it against a live grant on every request — so it
 * is safe to store without re-signing the cookie.
 */
export async function setActiveDistrict(districtId: string): Promise<void> {
  const payload = await decryptSession(await getSessionToken());
  if (!payload?.sessionId) return;
  await prisma.session.updateMany({
    where: { id: payload.sessionId },
    data: { activeDistrictId: districtId },
  });
}

/**
 * Drops a district from any session currently pointing at it, after access is revoked or
 * expires. Purely cosmetic — access is already gone, because the grant is re-read on every
 * request — but it stops the user from landing on a district they can no longer open.
 *
 * Deliberately NOT `revokeUserSessions`: that would sign the user out of every OTHER
 * district too, and one district's decision must not do that.
 */
export async function clearActiveDistrict(
  userId: string,
  districtId: string,
): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, activeDistrictId: districtId },
    data: { activeDistrictId: null },
  });
}
