import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/db";
import { Role } from "@/lib/enums";
import { PageHeader } from "@/components/page-header";
import {
  ActivityCodesManager,
  type ActivityCodeRow,
} from "@/components/platform/activity-codes-manager";

export default async function ActivityCodesPage() {
  await requireRole(Role.PLATFORM_ADMIN);

  const rows = await prisma.financialActivityCode.findMany({
    where: { active: true },
    orderBy: [{ activityClass: "asc" }, { codeFrom: "asc" }],
  });

  return (
    <div className="animate-fade-up space-y-[18px]">
      <PageHeader
        title="Financial activity codes"
        description="Which object codes mean 'transfer'. Shared by every district, because the Red Book chart of accounts is the standardised core."
      />
      <ActivityCodesManager rows={rows as ActivityCodeRow[]} />
    </div>
  );
}
