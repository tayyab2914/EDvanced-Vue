import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { DistrictSettingsForm } from "@/components/district/settings-form";
import { setDistrictStatus } from "@/app/actions/districts";
import { Role } from "@/lib/enums";

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-muted">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-ink">{value}</div>
    </Card>
  );
}

export default async function DistrictDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ districtId: string }>;
  searchParams: Promise<{ invite?: string }>;
}) {
  await requireRole(Role.PLATFORM_ADMIN);
  const { districtId } = await params;
  const { invite } = await searchParams;

  const district = await prisma.district.findUnique({
    where: { id: districtId },
    select: {
      id: true,
      name: true,
      code: true,
      status: true,
      fiscalYearStartMonth: true,
      state: true,
      _count: {
        select: { users: true, schools: true, grants: true, funds: true },
      },
    },
  });
  if (!district) notFound();

  const active = district.status === "ACTIVE";

  return (
    <div className="space-y-6">
      <PageHeader
        title={district.name}
        description={`Code: ${district.code}`}
        actions={
          <div className="flex gap-2">
            <Link href="/platform/districts">
              <Button variant="ghost">← All districts</Button>
            </Link>
            <Link href={`/platform/districts/${district.id}/users`}>
              <Button variant="secondary">
                Manage users ({district._count.users})
              </Button>
            </Link>
          </div>
        }
      />

      {invite && (
        <Alert tone="info">
          <div className="space-y-1">
            <div className="font-medium">Admin invite created (dev link)</div>
            <div className="break-all text-xs">{invite}</div>
          </div>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <SummaryStat label="Users" value={district._count.users} />
        <SummaryStat label="Schools" value={district._count.schools} />
        <SummaryStat label="Grants" value={district._count.grants} />
        <SummaryStat label="Funds" value={district._count.funds} />
      </div>

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-ink">
          District settings
        </h2>
        <DistrictSettingsForm
          district={{
            id: district.id,
            name: district.name,
            fiscalYearStartMonth: district.fiscalYearStartMonth,
            state: district.state,
          }}
        />
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-ink">Status</h2>
            <p className="mt-1 text-sm text-muted">
              {active
                ? "This district is active. Its users can sign in."
                : "This district is inactive. Its users cannot sign in."}
            </p>
          </div>
          <form action={setDistrictStatus}>
            <input type="hidden" name="districtId" value={district.id} />
            <input
              type="hidden"
              name="status"
              value={active ? "INACTIVE" : "ACTIVE"}
            />
            <Button type="submit" variant={active ? "danger" : "primary"}>
              {active ? "Deactivate" : "Activate"}
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
