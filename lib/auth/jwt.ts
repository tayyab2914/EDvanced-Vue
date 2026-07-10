import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@/lib/enums";

// Lightweight, dependency-light session token module. Safe to import from proxy.ts
// (no Prisma, no next/headers, no server-only) so it can run cheaply on every request.

const secret = process.env.SESSION_SECRET ?? "";
const encodedKey = new TextEncoder().encode(secret);

export interface SessionPayload {
  sessionId: string;
  userId: string;
  role: Role;
  districtId: string | null;
  expiresAt: string; // ISO
  [key: string]: unknown; // jose JWTPayload compatibility
}

export async function encryptSession(payload: SessionPayload): Promise<string> {
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(encodedKey);
}

/** Verifies signature + expiry only (no DB). Returns null if missing/invalid. */
export async function decryptSession(
  token?: string,
): Promise<SessionPayload | null> {
  if (!token || !secret) return null;
  try {
    const { payload } = await jwtVerify(token, encodedKey, {
      algorithms: ["HS256"],
    });
    return payload as SessionPayload;
  } catch {
    return null;
  }
}
