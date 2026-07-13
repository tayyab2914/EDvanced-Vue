import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { tenantDb, type TenantDb } from "@/lib/tenant-db";
import { getSessionToken, decryptSession } from "@/lib/auth/session";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { liveGrantWhere } from "@/lib/external-access";
import { homePathForUser } from "@/lib/auth/routes";
import { Role, UserStatus, DistrictStatus, type ExternalAccessLevel } from "@/lib/enums";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** For an EXTERNAL_USER this is their *active* district (resolved from a live grant). */
  districtId: string | null;
  districtName: string | null;
  /** Only set for an EXTERNAL_USER inside a district: what that district granted them. */
  accessLevel: ExternalAccessLevel | null;
  /** Only set for an EXTERNAL_USER inside a district: when that access lapses. */
  accessExpiresAt: Date | null;
}

/** Does this user hold the permission, accounting for an external user's granted level? */
export function userCan(user: CurrentUser, permission: Permission): boolean {
  return hasPermission(user.role, permission, user.accessLevel);
}

/**
 * SECURE session check (validates the session row + user status against the DB).
 * Memoized per request via React.cache. Returns null when unauthenticated/invalid.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const payload = await decryptSession(await getSessionToken());
  if (!payload?.sessionId || !payload.userId) return null;

  const now = new Date();
  const session = await prisma.session.findUnique({
    where: { id: payload.sessionId },
    select: {
      expiresAt: true,
      activeDistrictId: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          districtId: true,
          district: { select: { name: true, status: true } },
          // Only ever non-empty for an EXTERNAL_USER. Fetched in the same round-trip as the
          // session so resolving the active district costs no extra query.
          externalAccess: {
            where: liveGrantWhere(now),
            select: {
              districtId: true,
              level: true,
              expiresAt: true,
              district: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!session || session.expiresAt < now) return null;

  const u = session.user;
  if (u.status !== UserStatus.ACTIVE) return null;
  // District users can't act while their district is inactive. (This is a no-op for external
  // users, whose User.districtId is NULL — their district-status check lives in the grant
  // query above, via liveGrantWhere().)
  if (u.districtId && u.district?.status !== DistrictStatus.ACTIVE) return null;

  const base = {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
  };

  if (u.role === Role.EXTERNAL_USER) {
    // Their district is whichever LIVE grant the session points at. A session pointing at a
    // district they no longer have access to (revoked, expired, deactivated) simply resolves
    // to nothing — they are NOT logged out, because they still need to reach /districts to
    // see why. We never auto-pick another district for them.
    const active =
      u.externalAccess.find((g) => g.districtId === session.activeDistrictId) ?? null;

    return {
      ...base,
      districtId: active?.districtId ?? null,
      districtName: active?.district.name ?? null,
      accessLevel: active?.level ?? null,
      accessExpiresAt: active?.expiresAt ?? null,
    };
  }

  return {
    ...base,
    districtId: u.districtId,
    districtName: u.district?.name ?? null,
    accessLevel: null,
    accessExpiresAt: null,
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
  if (!roles.includes(user.role)) redirect(homePathForUser(user));
  return user;
}

export async function requirePermission(
  permission: Permission,
): Promise<CurrentUser> {
  const user = await requireAuth();
  if (!userCan(user, permission)) redirect(homePathForUser(user));
  return user;
}

/** Optimistic UI helper: does the current user hold this permission? */
export async function can(permission: Permission): Promise<boolean> {
  const user = await getCurrentUser();
  return user ? userCan(user, permission) : false;
}

/** Ensures the user may act within `districtId` (platform admins may act on any). */
export async function requireDistrictAccess(
  districtId: string,
): Promise<CurrentUser> {
  const user = await requireAuth();
  if (user.role === Role.PLATFORM_ADMIN) return user;
  // For an external user `districtId` is their active LIVE grant, so this comparison
  // already encodes "has a current, unexpired grant on this district".
  if (user.districtId !== districtId) redirect(homePathForUser(user));
  return user;
}

/**
 * District-scoped client for the signed-in user's OWN (or, for an external user, currently
 * active) district. Redirects rather than throwing when there is no district context: an
 * external user whose grant lapses mid-session must land on /districts, not a 500.
 */
export async function getTenantDb(): Promise<{
  db: TenantDb;
  user: CurrentUser;
  districtId: string;
}> {
  const user = await requireAuth();
  if (!user.districtId) redirect(homePathForUser(user));
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

  // No district context: a district user should be impossible here, but an EXTERNAL_USER
  // whose grant expired or was revoked mid-session lands here on their next submit. Send
  // them home rather than throwing an unhandled 500.
  if (!user.districtId) redirect(homePathForUser(user));
  if (requestedDistrictId && requestedDistrictId !== user.districtId) {
    throw new Error("Cross-district access denied.");
  }
  return { db: tenantDb(user.districtId), user, districtId: user.districtId };
}
