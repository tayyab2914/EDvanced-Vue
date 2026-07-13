import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { PlatformExternalUsers } from "@/components/external/platform-external-users";
import { Role } from "@/lib/enums";

export default async function PlatformExternalUsersPage() {
  await requireRole(Role.PLATFORM_ADMIN);

  const [users, districts] = await Promise.all([
    prisma.user.findMany({
      where: { role: Role.EXTERNAL_USER },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        lastLoginAt: true,
        lockedUntil: true,
        externalAccess: {
          select: {
            id: true,
            status: true,
            level: true,
            expiresAt: true,
            district: { select: { id: true, name: true } },
          },
          orderBy: { district: { name: "asc" } },
        },
      },
    }),
    prisma.district.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="External users"
        description="People outside any district — auditors, consultants, reviewers. Assign them districts; each district approves the access and sets its own permission level and expiry."
      />
      <PlatformExternalUsers
        districts={districts}
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          status: u.status,
          lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
          locked: !!u.lockedUntil && u.lockedUntil > new Date(),
          grants: u.externalAccess.map((g) => ({
            id: g.id,
            status: g.status,
            level: g.level,
            expiresAt: g.expiresAt ? g.expiresAt.toISOString() : null,
            districtId: g.district.id,
            districtName: g.district.name,
          })),
        }))}
      />
    </div>
  );
}
