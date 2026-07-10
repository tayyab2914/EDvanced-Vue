import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/dal";
import { getRecentAuditRows } from "@/lib/audit";
import { PageHeader } from "@/components/page-header";
import { AuditTable } from "@/components/audit-table";

export default async function DistrictAuditPage() {
  const me = await requirePermission("view_audit");
  if (!me.districtId) redirect("/platform");

  const rows = await getRecentAuditRows({ districtId: me.districtId });
  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Recent activity within your district."
      />
      <AuditTable rows={rows} />
    </div>
  );
}
