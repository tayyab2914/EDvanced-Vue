import "server-only";
import { prisma } from "@/lib/db";
import { ExternalAccessStatus, Role, UserStatus } from "@/lib/enums";
import { liveGrantWhere } from "@/lib/external-access";

/** Every grant that currently confers access to this user, newest district first. */
export function listLiveGrants(userId: string, now: Date = new Date()) {
  return prisma.externalAccess.findMany({
    where: { userId, ...liveGrantWhere(now) },
    select: {
      id: true,
      districtId: true,
      level: true,
      expiresAt: true,
      district: { select: { name: true } },
    },
    orderBy: { district: { name: "asc" } },
  });
}

/** Every grant for this user regardless of state — powers the /districts landing page. */
export function listGrantsForUser(userId: string) {
  return prisma.externalAccess.findMany({
    where: { userId },
    select: {
      id: true,
      districtId: true,
      status: true,
      level: true,
      expiresAt: true,
      decidedAt: true,
      createdAt: true,
      district: { select: { name: true, status: true } },
    },
    orderBy: { district: { name: "asc" } },
  });
}

/** Every external grant a district has a say in — powers the district's External tab. */
export function listGrantsForDistrict(districtId: string) {
  return prisma.externalAccess.findMany({
    where: { districtId },
    select: {
      id: true,
      status: true,
      level: true,
      expiresAt: true,
      decidedAt: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
          email: true,
          status: true,
          lastLoginAt: true,
        },
      },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
}

/** How many access requests are waiting on this district (drives the badge + bell). */
export function pendingRequestCount(districtId: string): Promise<number> {
  return prisma.externalAccess.count({
    where: { districtId, status: ExternalAccessStatus.PENDING },
  });
}

/**
 * The district admins who should be told about a new access request. Falls back to
 * platform admins when a district has no active admin of its own — otherwise the request
 * would sit unseen forever (a district's first admin is optional at creation time).
 */
export async function accessRequestRecipients(
  districtId: string,
): Promise<{ email: string; name: string }[]> {
  const admins = await prisma.user.findMany({
    where: {
      districtId,
      role: Role.DISTRICT_ADMIN,
      status: { not: UserStatus.DISABLED },
    },
    select: { email: true, name: true },
  });
  if (admins.length) return admins;

  return prisma.user.findMany({
    where: { role: Role.PLATFORM_ADMIN, status: UserStatus.ACTIVE },
    select: { email: true, name: true },
  });
}
