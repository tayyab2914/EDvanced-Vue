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
