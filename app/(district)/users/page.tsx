import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/dal";
import { homePathForUser } from "@/lib/auth/routes";
import { prisma } from "@/lib/db";
import { listGrantsForDistrict } from "@/lib/external-access-db";
import { PageHeader } from "@/components/page-header";
import { UsersManager } from "@/components/users/users-manager";
import { UsersTabs } from "@/components/users/users-tabs";
import { ExternalAccessManager } from "@/components/external/external-access-manager";
import { ExternalAccessStatus } from "@/lib/enums";

export default async function DistrictUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const me = await requirePermission("manage_users_own");
  if (!me.districtId) redirect(homePathForUser(me));

  const { tab } = await searchParams;
  const isExternal = tab === "external";

  // Both counts are needed regardless of tab — the tab bar shows the pending badge.
  const [users, grants] = await Promise.all([
    prisma.user.findMany({
      // External users have districtId = NULL, so they can never appear in this list.
      where: { districtId: me.districtId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        status: true,
        emailVerifiedAt: true,
        lastLoginAt: true,
        lockedUntil: true,
      },
    }),
    listGrantsForDistrict(me.districtId),
  ]);

  const pending = grants.filter(
    (g) => g.status === ExternalAccessStatus.PENDING,
  ).length;

  return (
    <div>
      <PageHeader
        title="Users"
        description={
          isExternal
            ? "People outside your district who have — or have requested — access to your data."
            : "Invite users to your district and manage their roles and access."
        }
      />

      <UsersTabs
        active={isExternal ? "external" : "internal"}
        internalCount={users.length}
        pendingCount={pending}
      />

      {isExternal ? (
        <ExternalAccessManager
          districtId={me.districtId}
          grants={grants.map((g) => ({
            id: g.id,
            status: g.status,
            level: g.level,
            expiresAt: g.expiresAt ? g.expiresAt.toISOString() : null,
            createdAt: g.createdAt.toISOString(),
            user: {
              name: g.user.name,
              email: g.user.email,
              status: g.user.status,
              lastLoginAt: g.user.lastLoginAt
                ? g.user.lastLoginAt.toISOString()
                : null,
            },
          }))}
        />
      ) : (
        <UsersManager
          districtId={me.districtId}
          users={users}
          currentUserId={me.id}
        />
      )}
    </div>
  );
}
