import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { tenantDb, type TenantDb } from "@/lib/tenant-db";
import { getSessionToken, decryptSession } from "@/lib/auth/session";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { Role, UserStatus, DistrictStatus } from "@/lib/enums";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  districtId: string | null;
  districtName: string | null;
}

/**
 * SECURE session check (validates the session row + user status against the DB).
 * Memoized per request via React.cache. Returns null when unauthenticated/invalid.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const payload = await decryptSession(await getSessionToken());
  if (!payload?.sessionId || !payload.userId) return null;

  const session = await prisma.session.findUnique({
    where: { id: payload.sessionId },
    select: {
      expiresAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          districtId: true,
          district: { select: { name: true, status: true } },
        },
      },
    },
  });

  if (!session || session.expiresAt < new Date()) return null;

  const u = session.user;
  if (u.status !== UserStatus.ACTIVE) return null;
  // District users can't act while their district is inactive.
  if (u.districtId && u.district?.status !== DistrictStatus.ACTIVE) return null;

  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    districtId: u.districtId,
    districtName: u.district?.name ?? null,
  };
});

/** Redirects to /login if unauthenticated; otherwise returns the current user. */
export const requireAuth = cache(async (): Promise<CurrentUser> => {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
});

/** Requires one of the given roles; redirects to the role home ("/") otherwise. */
export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await requireAuth();
  if (!roles.includes(user.role)) redirect("/");
  return user;
}

export async function requirePermission(
  permission: Permission,
): Promise<CurrentUser> {
  const user = await requireAuth();
  if (!hasPermission(user.role, permission)) redirect("/");
  return user;
}

/** Optimistic UI helper: does the current user hold this permission? */
export async function can(permission: Permission): Promise<boolean> {
  const user = await getCurrentUser();
  return user ? hasPermission(user.role, permission) : false;
}

/** Ensures the user may act within `districtId` (platform admins may act on any). */
export async function requireDistrictAccess(
  districtId: string,
): Promise<CurrentUser> {
  const user = await requireAuth();
  if (user.role === Role.PLATFORM_ADMIN) return user;
  if (user.districtId !== districtId) redirect("/");
  return user;
}

/** District-scoped client for the signed-in user's OWN district. */
export async function getTenantDb(): Promise<{
  db: TenantDb;
  user: CurrentUser;
  districtId: string;
}> {
  const user = await requireAuth();
  if (!user.districtId) {
    throw new Error(
      "getTenantDb() requires a district-scoped user; platform admins must pass a districtId.",
    );
  }
  return { db: tenantDb(user.districtId), user, districtId: user.districtId };
}

/**
 * Resolves a district-scoped client for master-data actions shared by platform
 * admins (who pass a districtId) and district users (who use their own).
 * Throws if a district user tries to act on another district.
 */
export async function resolveTenantDb(requestedDistrictId?: string): Promise<{
  db: TenantDb;
  user: CurrentUser;
  districtId: string;
}> {
  const user = await requireAuth();

  if (user.role === Role.PLATFORM_ADMIN) {
    if (!requestedDistrictId) {
      throw new Error("A districtId is required for platform-admin actions.");
    }
    return { db: tenantDb(requestedDistrictId), user, districtId: requestedDistrictId };
  }

  if (!user.districtId) throw new Error("No district context.");
  if (requestedDistrictId && requestedDistrictId !== user.districtId) {
    throw new Error("Cross-district access denied.");
  }
  return { db: tenantDb(user.districtId), user, districtId: user.districtId };
}
