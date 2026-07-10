import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { TokenType } from "@/lib/enums";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Issues a one-time token: stores only its SHA-256 hash, returns the raw token
 * (to embed in an email link). Any prior unused token of the same type is purged.
 */
export async function createVerificationToken(
  userId: string,
  type: TokenType,
  ttlMs: number,
): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  await prisma.verificationToken.deleteMany({
    where: { userId, type, usedAt: null },
  });
  await prisma.verificationToken.create({
    data: {
      userId,
      type,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });
  return raw;
}

/** Validates a token WITHOUT consuming it (for rendering the reset/invite form). */
export async function peekVerificationToken(
  raw: string,
): Promise<{ userId: string; type: TokenType } | null> {
  const token = await prisma.verificationToken.findUnique({
    where: { tokenHash: hashToken(raw) },
    select: { userId: true, type: true, usedAt: true, expiresAt: true },
  });
  if (!token || token.usedAt || token.expiresAt < new Date()) return null;
  return { userId: token.userId, type: token.type };
}

/** Validates AND marks the token used. Returns the owner + type, or null. */
export async function consumeVerificationToken(
  raw: string,
): Promise<{ userId: string; type: TokenType } | null> {
  const token = await prisma.verificationToken.findUnique({
    where: { tokenHash: hashToken(raw) },
  });
  if (!token || token.usedAt || token.expiresAt < new Date()) return null;
  await prisma.verificationToken.update({
    where: { id: token.id },
    data: { usedAt: new Date() },
  });
  return { userId: token.userId, type: token.type };
}
