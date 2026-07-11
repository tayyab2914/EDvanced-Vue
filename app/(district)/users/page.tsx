import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/dal";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { UsersManager } from "@/components/users/users-manager";

export default async function DistrictUsersPage() {
  const me = await requirePermission("manage_users_own");
  if (!me.districtId) redirect("/platform");

  const users = await prisma.user.findMany({
    where: { districtId: me.districtId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      status: true,
      lastLoginAt: true,
      lockedUntil: true,
    },
  });

  return (
    <div>
      <PageHeader
        title="Users"
        description="Invite users to your district and manage their roles and access."
      />
      <UsersManager
        districtId={me.districtId}
        users={users}
        currentUserId={me.id}
      />
    </div>
  );
}
