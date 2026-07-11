import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/dal";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { DistrictSettingsForm } from "@/components/district/settings-form";

export default async function DistrictSettingsPage() {
  const me = await requirePermission("configure_district");
  if (!me.districtId) redirect("/platform");

  const district = await prisma.district.findUnique({
    where: { id: me.districtId },
    select: {
      id: true,
      name: true,
      code: true,
      fiscalYearStartMonth: true,
      state: true,
    },
  });
  if (!district) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <PageHeader
        title="District settings"
        description={`Code: ${district.code} · Managed by your platform administrator.`}
      />
      <Card>
        <DistrictSettingsForm
          district={{
            id: district.id,
            name: district.name,
            fiscalYearStartMonth: district.fiscalYearStartMonth,
            state: district.state,
          }}
          editable={false}
        />
      </Card>
    </div>
  );
}
