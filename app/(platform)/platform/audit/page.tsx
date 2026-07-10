import { requireRole } from "@/lib/auth/dal";
import { getRecentAuditRows } from "@/lib/audit";
import { PageHeader } from "@/components/page-header";
import { AuditTable } from "@/components/audit-table";
import { Role } from "@/lib/enums";

export default async function PlatformAuditPage() {
  await requireRole(Role.PLATFORM_ADMIN);
  const rows = await getRecentAuditRows({});
  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Platform-wide activity: sign-ins, user and district changes, and more."
      />
      <AuditTable rows={rows} showDistrict />
    </div>
  );
}
