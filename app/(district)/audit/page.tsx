import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/dal";
import { homePathForUser } from "@/lib/auth/routes";
import { getAuditRows, getAuditFilterOptions } from "@/lib/audit";
import { PageHeader } from "@/components/page-header";
import { AuditView } from "@/components/audit/audit-view";

export default async function DistrictAuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    days?: string;
    user?: string;
    action?: string;
  }>;
}) {
  const me = await requirePermission("view_audit");
  if (!me.districtId) redirect(homePathForUser(me));
  const sp = await searchParams;
  const days = sp.days ?? "30";

  const [rows, options] = await Promise.all([
    getAuditRows({
      districtId: me.districtId,
      q: sp.q || undefined,
      days: Number(days) || 0,
      actorUserId: sp.user || undefined,
      action: sp.action || undefined,
    }),
    getAuditFilterOptions({ districtId: me.districtId, platform: false }),
  ]);

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Recent activity within your district."
      />
      <AuditView
        rows={rows}
        options={options}
        showDistrict={false}
        current={{
          q: sp.q ?? "",
          days,
          districtId: "",
          actorUserId: sp.user ?? "",
          action: sp.action ?? "",
        }}
      />
    </div>
  );
}
