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
        title="Financial policies"
        description="Your own thresholds for when a number is worth worrying about. They drive the import warnings and every alert on your dashboards."
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
