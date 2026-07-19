import { redirect } from "next/navigation";
import { getTenantDb, userCan } from "@/lib/auth/dal";
import { loadPolicy } from "@/lib/policies/load";
import { POLICY_GROUPS } from "@/lib/policies/registry";
import { PageHeader } from "@/components/page-header";
import { PolicyForm } from "@/components/policies/policy-form";

export default async function PoliciesPage() {
  const { db, user, districtId } = await getTenantDb();
  if (!userCan(user, "view_dashboards")) redirect("/dashboard");

  const values = await loadPolicy(db, districtId);

  return (
    <div className="animate-fade-up space-y-[18px]">
      <PageHeader
        title="Financial Policies"
        description="Configure the policies, thresholds, and validation rules that determine import warnings, dashboard alerts, and financial status indicators."
      />
      <PolicyForm
        groups={POLICY_GROUPS}
        values={values}
        districtId={districtId}
        // Viewers and Finance Users can read the rules they are being measured against;
        // changing them is a district-settings act.
        canEdit={userCan(user, "configure_district")}
      />
    </div>
  );
}
