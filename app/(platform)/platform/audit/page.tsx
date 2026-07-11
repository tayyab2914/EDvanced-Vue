import { requireRole } from "@/lib/auth/dal";
import { getAuditRows, getAuditFilterOptions } from "@/lib/audit";
import { PageHeader } from "@/components/page-header";
import { AuditView } from "@/components/audit/audit-view";
import { Role } from "@/lib/enums";

export default async function PlatformAuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    days?: string;
    district?: string;
    user?: string;
    action?: string;
  }>;
}) {
  await requireRole(Role.PLATFORM_ADMIN);
  const sp = await searchParams;
  const days = sp.days ?? "30";

  const [rows, options] = await Promise.all([
    getAuditRows({
      districtId: sp.district || undefined,
      q: sp.q || undefined,
      days: Number(days) || 0,
      actorUserId: sp.user || undefined,
      action: sp.action || undefined,
    }),
    getAuditFilterOptions({ platform: true }),
  ]);

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Platform-wide activity: sign-ins, user and district changes, and more."
      />
      <AuditView
        rows={rows}
        options={options}
        showDistrict
        current={{
          q: sp.q ?? "",
          days,
          districtId: sp.district ?? "",
          actorUserId: sp.user ?? "",
          action: sp.action ?? "",
        }}
      />
    </div>
  );
}
