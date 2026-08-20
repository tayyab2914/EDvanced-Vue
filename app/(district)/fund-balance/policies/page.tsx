import { redirect } from "next/navigation";
import { getTenantDb, userCan } from "@/lib/auth/dal";
import { resolveScope } from "@/lib/dashboard/scope";
import { labelMode } from "@/lib/dashboard/label-mode";
import { loadCore, reserveThresholds, forecastReserveThresholds } from "@/lib/dashboard/load";
import { ladder, bands as statusBands, ruleOf } from "@/lib/dashboard/status";
import { reserveCaption } from "@/lib/dashboard/reserve";
import { percent, toNumber } from "@/lib/dashboard/format";
import { MANAGE } from "@/lib/dashboard/cta";
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
  const scope = await resolveScope(db, districtId, sp, await labelMode());
  const core = await loadCore(db, districtId, scope);
  const { policy, alerts, reserve } = core;
  const fbAlerts = (alerts?.alerts ?? []).filter((a) => a.group === "fundBalance");

  const reserveT = reserveThresholds(policy);
  const fcT = forecastReserveThresholds(policy);
  const reservePct = toNumber(reserve?.percent);

  return (
    <FundBalanceShell scope={scope} active="/fund-balance/policies" alertCount={fbAlerts.length}>
      <Row cols="2">
        <SectionCard
          title="Fund Balance Goals"
          info="What the district aims to hold, and what it is required to hold."
        >
          <PolicyEchoCard
            rows={[
              {
                label: "District Target",
                value: `${Number(policy.fundBalance.target).toFixed(2)}%`,
                note: "Long-term unassigned fund balance target.",
              },
              {
                label: "Board Policy Minimum",
                value: `${Number(policy.fundBalance.boardPolicyMinimum).toFixed(2)}%`,
                note: "Minimum unassigned fund balance required by Board policy.",
              },
              {
                label: "State Required Reserve",
                value: `${Number(policy.fundBalance.stateMinimum).toFixed(2)}%`,
                note: "Minimum reserve required under Florida law.",
              },
              {
                // The one setting on this screen that is not a threshold — it decides what
                // every OTHER number here is a percentage of. See lib/enums.ts.
                label: "Measurement Basis",
                value: reserve?.basis === "EXPENDITURE" ? "Expenditures" : "Revenue",
                note:
                  reserve?.basis === "EXPENDITURE"
                    ? "Measured against budgeted General Fund expenditures."
                    : "Measured against General Fund revenue, per Florida s. 1011.051.",
              },
            ]}
            manageHref={userCan(user, "configure_district") ? "/policies" : undefined}
            manageLabel={MANAGE.fundBalancePolicies}
          />
        </SectionCard>

        <SectionCard
          title="Alert Thresholds"
          info="When the platform raises a warning or a critical alert."
        >
          <PolicyEchoCard
            groups={[
              {
                label: "Current Position",
                note: "Evaluates the district’s current unassigned fund balance.",
                rows: [
                  { label: "Warning", value: `${reserveT.warning.toFixed(2)}%` },
                  { label: "Critical", value: `${reserveT.critical.toFixed(2)}%` },
                ],
              },
              {
                label: "Forecast",
                note: "Evaluates projected unassigned fund balance in future years.",
                rows: [
                  { label: "Warning", value: `${fcT.warning.toFixed(2)}%` },
                  { label: "Critical", value: `${fcT.critical.toFixed(2)}%` },
                ],
              },
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
          <span className="text-[26px] font-semibold tabular-nums text-[#060606]">
            {percent(reserve?.percent)}
          </span>
          <StatusBadge status={ladder(reservePct, reserveT)} />
        </div>
        <BenchmarkBand
          value={reservePct}
          bands={statusBands(reserveT)}
          format={(v) => `${v.toFixed(v % 1 === 0 ? 0 : 2)}%`}
          // NOT `reserveSubject()`. That helper names the reserve on every tile in the
          // product, where "Projected unassigned fund balance" is the right length; this
          // strip is the one place the reader is being shown the ruler, so it spells out
          // that the figure is a YEAR-END position and states the ratio as a percentage
          // rather than "a share" — the wording the district's board papers use.
          label={`${
            reserve?.actual ? "Year-end" : "Projected year-end"
          } unassigned fund balance as a % ${reserveCaption(reserve)}.`}
        />
      </SectionCard>
    </FundBalanceShell>
  );
}
