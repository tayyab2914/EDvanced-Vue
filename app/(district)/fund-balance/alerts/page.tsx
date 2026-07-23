import { redirect } from "next/navigation";
import { getTenantDb, userCan } from "@/lib/auth/dal";
import { resolveScope } from "@/lib/dashboard/scope";
import { loadCore } from "@/lib/dashboard/load";
import { SectionCard } from "@/components/dashboard/section-card";
import { AlertList } from "@/components/dashboard/alert-list";
import { FundBalanceShell } from "../shell";

/** Fund Balance — Alerts (Spec §6.4). */
export default async function FundBalanceAlertsTab({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string; period?: string; fund?: string }>;
}) {
  const { db, user, districtId } = await getTenantDb();
  if (!userCan(user, "view_dashboards")) redirect("/master-data");

  const sp = await searchParams;
  const scope = await resolveScope(db, districtId, sp);
  const core = await loadCore(db, districtId, scope);
  const fbAlerts = (core.alerts?.alerts ?? []).filter((a) => a.group === "fundBalance");

  const current = fbAlerts.filter((a) => !a.id.startsWith("FORECAST"));
  const forecast = fbAlerts.filter((a) => a.id.startsWith("FORECAST"));

  return (
    <FundBalanceShell scope={scope} active="/fund-balance/alerts" alertCount={fbAlerts.length}>
      <SectionCard
        title="Current position"
        subtitle="Raised from the reserve as it stands"
        footer="Review your thresholds"
        footerHref="/policies"
      >
        <AlertList
          alerts={current.map((a) => ({ id: a.id, severity: a.severity, title: a.title, message: a.message }))}
          empty="The reserve is within every threshold you have set."
        />
      </SectionCard>

      <SectionCard
        title="Forecast"
        subtitle="Raised from the projected year-end reserve"
        footer="Go to forecast and planning"
        footerHref={`/fund-balance/forecast?fy=${scope.fiscalYear}&period=${scope.period}`}
      >
        <AlertList
          alerts={forecast.map((a) => ({ id: a.id, severity: a.severity, title: a.title, message: a.message }))}
          empty="The projected reserve stays within your thresholds."
        />
      </SectionCard>
    </FundBalanceShell>
  );
}
