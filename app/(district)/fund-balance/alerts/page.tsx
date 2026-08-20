import { redirect } from "next/navigation";
import { getTenantDb, userCan } from "@/lib/auth/dal";
import { resolveScope } from "@/lib/dashboard/scope";
import { labelMode } from "@/lib/dashboard/label-mode";
import { loadCore } from "@/lib/dashboard/load";
import { SectionCard } from "@/components/dashboard/section-card";
import { AlertList } from "@/components/dashboard/alert-list";
import { alertFunds, scopeOptions } from "@/lib/dashboard/options";
import { GO_TO } from "@/lib/dashboard/cta";
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
  const scope = await resolveScope(db, districtId, sp, await labelMode());
  const core = await loadCore(db, districtId, scope);
  const fbAlerts = (core.alerts?.alerts ?? []).filter((a) => a.group === "fundBalance");

  const current = fbAlerts.filter((a) => !a.id.startsWith("FORECAST"));
  const forecast = fbAlerts.filter((a) => a.id.startsWith("FORECAST"));
  const options = scopeOptions(scope);

  return (
    <FundBalanceShell scope={scope} active="/fund-balance/alerts" alertCount={fbAlerts.length}>
      <SectionCard
        title="Current Position"
        subtitle="Based on the current fund balance position"
        footer={GO_TO.policies}
        footerHref="/policies"
      >
        {/*
          Most of these carry no "where" line, and that is deliberate rather than an
          omission: a reserve percentage has no honest per-fund analogue that three grouped
          aggregates can produce. The falling-balance alert does, and gets one. See the
          header of lib/alerts/attribution.ts.
        */}
        <AlertList
          mode={scope.labelMode}
          alerts={current.map((a) => ({
            id: a.id,
            severity: a.severity,
            title: a.title,
            message: a.message,
            funds: alertFunds(scope, "/fund-balance/alerts", a.funds),
          }))}
          empty="The reserve is within every threshold you have set."
        />
      </SectionCard>

      <SectionCard
        title="Forecast"
        subtitle="Based on the projected year-end fund balance"
        footer={GO_TO.forecast}
        footerHref={options.link(
          `/fund-balance/forecast?fy=${scope.fiscalYear}&period=${scope.period}`,
        )}
      >
        <AlertList
          mode={scope.labelMode}
          alerts={forecast.map((a) => ({ id: a.id, severity: a.severity, title: a.title, message: a.message }))}
          empty="The projected reserve stays within your thresholds."
        />
      </SectionCard>
    </FundBalanceShell>
  );
}
