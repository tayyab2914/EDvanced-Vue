import { redirect } from "next/navigation";
import { getTenantDb, userCan } from "@/lib/auth/dal";
import { resolveScope } from "@/lib/dashboard/scope";
import { loadCore, reserveThresholds, forecastReserveThresholds } from "@/lib/dashboard/load";
import { ladder, bands as statusBands, ruleOf } from "@/lib/dashboard/status";
import { percent, toNumber } from "@/lib/dashboard/format";
import { SectionCard } from "@/components/dashboard/section-card";
import { Row, PolicyEchoCard } from "@/components/dashboard/shared";
import { BenchmarkBand } from "@/components/dashboard/charts/benchmark-band";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { FundBalanceShell } from "../shell";

/**
 * Fund Balance — Policies (Spec §6.3).
 *
 * Read-only, and deliberately so. The editing form already exists at /policies and is the
 * one place a threshold changes; duplicating it here would be a second way to write the
 * same row, which is how two screens end up disagreeing about what was saved.
 */
export default async function FundBalancePoliciesTab({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string; period?: string; fund?: string }>;
}) {
  const { db, user, districtId } = await getTenantDb();
  if (!userCan(user, "view_dashboards")) redirect("/master-data");

  const sp = await searchParams;
  const scope = await resolveScope(db, districtId, sp);
  const core = await loadCore(db, districtId, scope);
  const { policy, alerts, reserve } = core;
  const fbAlerts = (alerts?.alerts ?? []).filter((a) => a.group === "fundBalance");

  const reserveT = reserveThresholds(policy);
  const fcT = forecastReserveThresholds(policy);
  const reservePct = toNumber(reserve?.percent);

  return (
    <FundBalanceShell scope={scope} active="/fund-balance/policies" alertCount={fbAlerts.length}>
      <Row cols="2">
        <SectionCard title="Reserve goals" info="What the district aims to hold, and what it is required to hold.">
          <PolicyEchoCard
            rows={[
              {
                label: "District target",
                value: `${Number(policy.fundBalance.target).toFixed(2)}%`,
                note: "What the district strives to maintain for long-term stability.",
              },
              {
                label: "Board policy minimum",
                value: `${Number(policy.fundBalance.boardPolicyMinimum).toFixed(2)}%`,
                note: "Required by board policy.",
              },
              {
                label: "State minimum",
                value: `${Number(policy.fundBalance.stateMinimum).toFixed(2)}%`,
                note: "Required by state law.",
              },
            ]}
            manageHref={userCan(user, "configure_district") ? "/policies" : undefined}
          />
        </SectionCard>

        <SectionCard title="Alert thresholds" info="When the platform raises a warning or a critical alert.">
          <PolicyEchoCard
            rows={[
              {
                label: "Current position — warning",
                value: `${reserveT.warning.toFixed(2)}%`,
                note: "From the reserve as it stands today.",
              },
              { label: "Current position — critical", value: `${reserveT.critical.toFixed(2)}%` },
              {
                label: "Forecast — warning",
                value: `${fcT.warning.toFixed(2)}%`,
                note: "From the projected year-end reserve.",
              },
              { label: "Forecast — critical", value: `${fcT.critical.toFixed(2)}%` },
            ]}
          />
        </SectionCard>
      </Row>

      <SectionCard
        title="Where you stand"
        subtitle={ruleOf(reserveT)}
        info="The bands are your own thresholds — the same ones every badge and alert on these dashboards reads."
      >
        <div className="mb-4 flex items-center gap-3">
          <span className="text-[24px] font-semibold tabular-nums text-ink">
            {percent(reserve?.percent)}
          </span>
          <StatusBadge status={ladder(reservePct, reserveT)} />
        </div>
        <BenchmarkBand
          value={reservePct}
          bands={statusBands(reserveT)}
          format={(v) => `${v.toFixed(v % 1 === 0 ? 0 : 2)}%`}
          label="Unassigned fund balance as a share of budgeted general fund expenditures."
        />
      </SectionCard>
    </FundBalanceShell>
  );
}
