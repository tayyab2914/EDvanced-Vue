import { redirect } from "next/navigation";
import { getTenantDb, userCan } from "@/lib/auth/dal";
import { resolveScope } from "@/lib/dashboard/scope";
import { loadCore, reserveThresholds, forecastReserveThresholds } from "@/lib/dashboard/load";
import { projectFundBalance, districtGrowth } from "@/lib/forecast/engine";
import { ladder } from "@/lib/dashboard/status";
import { compactMoney, accounting, percent, toNumber, signedPercent } from "@/lib/dashboard/format";
import { SectionCard, FooterInfoBar } from "@/components/dashboard/section-card";
import { DataTable } from "@/components/dashboard/data-table";
import { AlertList } from "@/components/dashboard/alert-list";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { EmptyState, Row, PolicyEchoCard } from "@/components/dashboard/shared";
import { LineChart } from "@/components/dashboard/charts/line-chart";
import { KpiTile, KpiRow } from "@/components/dashboard/kpi-tile";
import { FundBalanceShell } from "../shell";
import { AssumptionsForm } from "./assumptions-form";
import { PageHeader } from "@/components/page-header";

/** Fund Balance — Forecast & Planning (Spec §6.2). */
export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string; period?: string; fund?: string }>;
}) {
  const { db, user, districtId } = await getTenantDb();
  if (!userCan(user, "view_dashboards")) redirect("/master-data");

  const sp = await searchParams;
  const scope = await resolveScope(db, districtId, sp);

  if (scope.empty) {
    return (
      <div className="animate-fade-up space-y-[18px]">
        <PageHeader title="Fund Balance" description="Plan for the future." />
        <EmptyState title="Nothing to project yet" action="Upload data" href="/data/upload">
          A projection needs at least one committed period to extrapolate from.
        </EmptyState>
      </div>
    );
  }

  const core = await loadCore(db, districtId, scope);
  const { policy, alerts, codes } = core;
  const fbAlerts = (alerts?.alerts ?? []).filter((a) => a.group === "fundBalance");

  // The multi-year projection is General-Fund-only, per the workbook's own note. Without a
  // General Fund there is no coherent reserve percentage to project.
  const fund = scope.fund ?? scope.generalFund;

  if (!fund) {
    return (
      <FundBalanceShell scope={scope} active="/fund-balance/forecast" alertCount={fbAlerts.length}>
        <EmptyState title="No General Fund identified" icon="database" action="Manage funds" href="/master-data?tab=funds">
          Multi-year projection and the projected unassigned reserve apply to the General Fund
          only. Set one of your funds to the &ldquo;General&rdquo; fund type to see this view.
        </EmptyState>
      </FundBalanceShell>
    );
  }

  const [growth, projection] = await Promise.all([
    districtGrowth(db, scope.fiscalYear),
    projectFundBalance(
      db,
      { fiscalYear: scope.fiscalYear, period: scope.period, fundId: fund.id, years: 4 },
      codes,
    ),
  ]);

  const reserveT = reserveThresholds(policy);
  const fcT = forecastReserveThresholds(policy);

  const first = projection[0];
  const last = projection[projection.length - 1];
  const change = first && last ? last.unassigned.minus(first.unassigned) : null;
  const lowest = projection.reduce(
    (lo, y) => (lo === null || (y.reservePercent && lo.reservePercent && y.reservePercent.lessThan(lo.reservePercent)) ? y : lo),
    null as (typeof projection)[number] | null,
  );

  const canEdit = userCan(user, "edit_forecast_assumptions");

  return (
    <FundBalanceShell scope={scope} active="/fund-balance/forecast" alertCount={fbAlerts.length}>
      <SectionCard
        title="Forecast assumptions"
        subtitle={`Used to project revenues, expenditures and fund balance for ${fund.name}`}
        info="A district that enters nothing gets 0% on both, which holds this year's figures flat."
      >
        <AssumptionsForm
          fiscalYear={scope.fiscalYear}
          revenueGrowth={toNumber(growth.revenuePercent)}
          expenditureGrowth={toNumber(growth.expenditurePercent)}
          canEdit={canEdit}
        />
      </SectionCard>

      <KpiRow count={4}>
        <KpiTile
          icon="chart"
          tone="purple"
          label={`Projected ${projection.length - 1}-year change`}
          value={accounting(change, { compact: true })}
          sub={first && last ? `from ${compactMoney(first.unassigned)} to ${compactMoney(last.unassigned)}` : undefined}
          delta={
            change === null
              ? undefined
              : {
                  text: signedPercent(
                    first && !first.unassigned.isZero()
                      ? change.dividedBy(first.unassigned.abs()).times(100)
                      : null,
                  ),
                  tone: change.isNegative() ? "negative" : "positive",
                }
          }
        />
        <KpiTile
          icon="activity"
          tone="amber"
          label="Projected lowest point"
          value={percent(lowest?.reservePercent)}
          sub={lowest ? `FY ${lowest.fiscalYear}` : undefined}
          status={ladder(toNumber(lowest?.reservePercent), fcT)}
        />
        <KpiTile
          icon="shield"
          tone="blue"
          label="Reserve at year one"
          value={percent(first?.reservePercent)}
          sub="unassigned as % of projected spending"
          status={ladder(toNumber(first?.reservePercent), reserveT)}
        />
        <KpiTile
          icon="reports"
          tone="teal"
          label="Cumulative reserve used"
          value={compactMoney(last?.cumulativeFundBalanceUsed)}
          sub="fund balance consumed across the plan"
        />
      </KpiRow>

      <Row cols="2-1">
        <SectionCard title="Budget forecast" subtitle="Can we balance the budget?">
          <DataTable
            dense
            columns={[
              { key: "row", label: "" },
              ...projection.map((y) => ({
                key: y.fiscalYear,
                label: y.index === 0 ? `FY ${y.fiscalYear} (current)` : `FY ${y.fiscalYear}`,
                align: "right" as const,
              })),
            ]}
            rows={[
              row("Projected revenues", projection, (y) => compactMoney(y.projectedRevenue)),
              row("Projected expenditures", projection, (y) => compactMoney(y.projectedExpenditure)),
              {
                id: "surplus",
                cells: {
                  row: "Surplus / (deficit)",
                  ...Object.fromEntries(
                    projection.map((y) => [
                      y.fiscalYear,
                      {
                        value: accounting(y.netChange, { compact: true }),
                        tone: y.netChange.isNegative() ? ("negative" as const) : ("positive" as const),
                      },
                    ]),
                  ),
                },
              },
              row("Fund balance used", projection, (y) => compactMoney(y.fundBalanceUsed)),
              row("Cumulative used", projection, (y) => compactMoney(y.cumulativeFundBalanceUsed)),
              row("Used as % of revenues", projection, (y) => percent(y.fundBalanceUsedPercentOfRevenue)),
            ]}
          />
          <p className="mt-3 text-[11.5px] leading-relaxed text-muted-2">
            A deficit means fund balance is needed to balance the budget. Growth is applied from
            the current year&apos;s projected pace, not from the adopted budget.
          </p>
        </SectionCard>

        <SectionCard title="Board policy" subtitle="General fund only">
          <PolicyEchoCard
            rows={[
              { label: "District target", value: `${reserveT.target.toFixed(2)}%` },
              { label: "Warning below", value: `${reserveT.warning.toFixed(2)}%` },
              { label: "Critical below", value: `${reserveT.critical.toFixed(2)}%` },
              { label: "Forecast warning", value: `${fcT.warning.toFixed(2)}%` },
              { label: "Forecast critical", value: `${fcT.critical.toFixed(2)}%` },
            ]}
            manageHref={userCan(user, "configure_district") ? "/policies" : undefined}
          />
        </SectionCard>
      </Row>

      <SectionCard title="Fund balance forecast" subtitle="Will our reserves remain healthy?">
        <DataTable
          dense
          columns={[
            { key: "row", label: "" },
            ...projection.map((y) => ({
              key: y.fiscalYear,
              label: y.index === 0 ? `FY ${y.fiscalYear} (current)` : `FY ${y.fiscalYear}`,
              align: "right" as const,
            })),
          ]}
          rows={[
            row("Beginning fund balance", projection, (y) => compactMoney(y.beginning)),
            row("Net surplus / (deficit)", projection, (y) => accounting(y.netChange, { compact: true })),
            row("Estimated ending balance", projection, (y) => compactMoney(y.total)),
            row("Less: designated components", projection, (y) => accounting(y.components.negated(), { compact: true })),
            row("Projected unassigned", projection, (y) => compactMoney(y.unassigned)),
            row("Unassigned % of expenditures", projection, (y) => percent(y.reservePercent)),
            {
              id: "status",
              cells: {
                row: "Reserve status",
                ...Object.fromEntries(
                  projection.map((y) => [
                    y.fiscalYear,
                    {
                      value: (
                        <StatusBadge
                          status={ladder(toNumber(y.reservePercent), y.index === 0 ? reserveT : fcT)}
                          size="sm"
                          dot={false}
                        />
                      ),
                    },
                  ]),
                ),
              },
            },
          ]}
        />
      </SectionCard>

      <Row cols="2">
        <SectionCard title="Reserve trend" subtitle="Unassigned fund balance as a share of expenditures">
          <LineChart
            title="Projected reserve percentage"
            summary={`Projected unassigned reserve across ${projection.length} fiscal years, against the district's own thresholds.`}
            categories={projection.map((y) => `FY${y.fiscalYear.slice(2)}`)}
            format={(v) => `${v.toFixed(1)}%`}
            height={240}
            zeroBased={false}
            legend={false}
            thresholds={[
              { at: reserveT.target, label: `Target ${reserveT.target}%`, color: "var(--color-strong-mark)" },
              { at: fcT.warning, label: `Warning ${fcT.warning}%`, color: "var(--color-monitor-mark)" },
              { at: fcT.critical, label: `Critical ${fcT.critical}%`, color: "var(--color-action-mark)" },
            ]}
            series={[
              {
                key: "reserve",
                label: "Projected reserve %",
                color: "var(--color-viz-forecast)",
                labelLast: true,
                points: projection.map((y) => ({
                  value: toNumber(y.reservePercent),
                  label: percent(y.reservePercent, 1),
                })),
              },
            ]}
          />
        </SectionCard>

        <SectionCard title="Forecast alerts" footer="View all alerts" footerHref="/alerts">
          <AlertList
            alerts={fbAlerts
              .filter((a) => a.id.startsWith("FORECAST"))
              .map((a) => ({ id: a.id, severity: a.severity, title: a.title, message: a.message }))}
            empty="The projected reserve stays within your thresholds across the plan."
          />
        </SectionCard>
      </Row>

      <FooterInfoBar>
        These projections extrapolate the current year&apos;s pace and apply your own growth
        assumptions. They are a planning aid, not a budget.
      </FooterInfoBar>
    </FundBalanceShell>
  );
}

/** One row of a year-by-year table, formatted the same way across every column. */
function row<T extends { fiscalYear: string }>(
  label: string,
  years: T[],
  pick: (y: T) => string,
) {
  return {
    id: label,
    cells: {
      row: label,
      ...Object.fromEntries(years.map((y) => [y.fiscalYear, pick(y)])),
    },
  };
}
