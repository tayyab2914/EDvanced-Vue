import Link from "next/link";
import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Role } from "@/lib/enums";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 text-3xl font-semibold text-ink">{value}</div>
    </Card>
  );
}

export default async function PlatformHome() {
  await requireRole(Role.PLATFORM_ADMIN);
  const [districts, activeDistricts, users] = await Promise.all([
    prisma.district.count(),
    prisma.district.count({ where: { status: "ACTIVE" } }),
    prisma.user.count(),
  ]);

  return (
    <div>
      <PageHeader
        title="Platform overview"
        description="Manage districts, users, and configuration across the platform."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Districts" value={districts} />
        <Stat label="Active districts" value={activeDistricts} />
        <Stat label="Total users" value={users} />
      </div>
      <div className="mt-6">
        <Link
          href="/platform/districts"
          className="text-sm font-medium text-brand hover:text-brand-dark"
        >
          Manage districts →
        </Link>
      </div>
    </div>
  );
}
