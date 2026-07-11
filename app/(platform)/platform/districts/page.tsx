import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import {
  DistrictManager,
  type DistrictRow,
} from "@/components/platform/district-manager";
import { Role } from "@/lib/enums";

export default async function DistrictsPage() {
  await requireRole(Role.PLATFORM_ADMIN);
  const rows = await prisma.district.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      code: true,
      state: true,
      status: true,
      _count: { select: { users: true } },
    },
  });

  const districts: DistrictRow[] = rows.map((d) => ({
    id: d.id,
    name: d.name,
    code: d.code,
    state: d.state,
    status: d.status,
    users: d._count.users,
  }));

  return (
    <div>
      <PageHeader
        title="District Management"
        description="Create and manage district tenants. Each new district starts empty and enters its own account data."
      />
      <DistrictManager districts={districts} />
    </div>
  );
}
