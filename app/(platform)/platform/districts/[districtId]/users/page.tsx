import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { UsersManager } from "@/components/users/users-manager";
import { Role } from "@/lib/enums";

export default async function DistrictUsersPage({
  params,
}: {
  params: Promise<{ districtId: string }>;
}) {
  const admin = await requireRole(Role.PLATFORM_ADMIN);
  const { districtId } = await params;

  const district = await prisma.district.findUnique({
    where: { id: districtId },
    select: { id: true, name: true },
  });
  if (!district) notFound();

  const users = await prisma.user.findMany({
    where: { districtId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
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
        title={`Users — ${district.name}`}
        description="Invite users and manage their roles and access."
        actions={
          <Link
            href={`/platform/districts/${district.id}`}
            className="text-sm text-brand hover:text-brand-dark"
          >
            ← Back to district
          </Link>
        }
      />
      <UsersManager
        districtId={districtId}
        users={users}
        currentUserId={admin.id}
      />
    </div>
  );
}
