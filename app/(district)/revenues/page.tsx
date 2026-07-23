import { redirect } from "next/navigation";
import { getTenantDb, userCan } from "@/lib/auth/dal";
import { resolveScope } from "@/lib/dashboard/scope";
import { loadCore, revenueVarianceThresholds, periodAxisLabels } from "@/lib/dashboard/load";
import { revenueBySource, revenueByType, topMovers, foldTail } from "@/lib/finance/breakdown";
import { ladder } from "@/lib/dashboard/status";
import { daysIntoFiscalYear } from "@/lib/finance/variance";
import {
  compactMoney,
  money,
  accounting,
  percent,
  signedPercent,
  toNumber,
  deltaTone,
  changePercent,
} from "@/lib/dashboard/format";
import { PageHeader } from "@/components/page-header";
import { KpiTile, KpiRow } from "@/components/dashboard/kpi-tile";
import { SectionCard, DataAsOf, FooterInfoBar } from "@/components/dashboard/section-card";
import { DataTable, MoverList } from "@/components/dashboard/data-table";
import { AlertList } from "@/components/dashboard/alert-list";
import { EmptyState, SubstitutionNotice, Row, PolicyEchoCard } from "@/components/dashboard/shared";
import { ScopeBar } from "@/components/dashboard/scope-bar";
import { LineChart } from "@/components/dashboard/charts/line-chart";
import { ColumnChart } from "@/components/dashboard/charts/column-chart";
import { DonutChart } from "@/components/dashboard/charts/donut-chart";
import { scopeOptions } from "@/lib/dashboard/options";
import { SERIES_SLOTS } from "@/lib/dashboard/palette";

/** The Revenue dashboard (Spec §4) — performance against budget and forecast. */
export default async function RevenueDashboard({
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
        <PageHeader title="Revenue Dashboard" description="Track revenue performance against budget and forecast." />
        <EmptyState title="No revenue data yet" action="Upload revenue detail" href="/data/upload">
          Upload a revenue detail file for a reporting period and this dashboard will show
          collections against budget, by source and by category.
        </EmptyState>
      </div>
    );
  }

  const core = await loadCore(db, districtId, scope);
  const { series, point, previous, policy, alerts } = core;
  const facts = alerts?.facts ?? null;
  const version = core.versions.get("REVENUE_DETAIL");

  if (!version) {
    return (
      <div className="animate-fade-up space-y-[18px]">
        <PageHeader title="Revenue Dashboard" description="Track revenue performance against budget and forecast." />
        <EmptyState title={`No revenue detail for ${scope.label}`} action="Upload revenue detail" href="/data/upload">
          Other periods may have data — use the period selector, or upload this one.
        </EmptyState>
      </div>
    );
  }

  const args = { versionId: version, fundId: scope.fundId, periodsElapsed: scope.period };
  const [bySource, byType] = await Promise.all([
    revenueBySource(db, args),
    revenueByType(db, args),
  ]);
  const movers = topMovers(bySource, 4);
  const donut = foldTail(byType, scope.period, 5);

  const revT = revenueVarianceThresholds(policy);
  const varPct = toNumber(facts?.revenueVariancePercent);
  const forecastPct = toNumber(facts?.revenueForecastVariancePercent);
  const momPct = changePercent(point?.revenueMtd, previous?.revenueMtd);
  const daysIn = daysIntoFiscalYear(scope.period);

  const labels = periodAxisLabels(scope, series.points.length);
  const fullYearBudget = toNumber(bySource.total.budget) ?? 0;

  const options = scopeOptions(scope);

  return (
    <div className="animate-fade-up space-y-[18px]">
      <PageHeader
        title="Revenue Dashboard"
        description="Track revenue performance against budget and forecast."
        actions={
          <ScopeBar
            periods={options.periods}
            period={options.period}
            funds={options.funds}
            fund={scope.fundId ?? ""}
            exportHref={options.exportHref("/revenues/export")}
          />
        }
      />
      {scope.substituted && <SubstitutionNotice asked={scope.substituted.asked} showing={scope.substituted.showing} />}
      <DataAsOf date={scope.dataAsOf} note={scope.fund ? scope.fund.name : "All funds"} />

      <KpiRow count={6}>
        <KpiTile
          icon="chart"
          tone="green"
          label="Total revenues (YTD)"
          value={compactMoney(bySource.total.actualYtd)}
          sub={`${percent(bySource.total.consumption.percent)} of full-year budget`}
        />
        <KpiTile
          icon="activity"
          tone="blue"
          label="Revenue variance (YTD)"
          value={accounting(facts?.revenueVariancePercent === null ? null : bySource.total.pace.amount, { compact: true })}
          sub="against the budget expected by now"
          delta={varPct === null ? undefined : { text: signedPercent(varPct), tone: deltaTone(varPct, "up") }}
        />
        <KpiTile
          icon="reports"
          tone="purple"
          label="Forecast variance (year end)"
          value={signedPercent(forecastPct)}
          sub="projected collections against budget"
          unavailableReason="Needs a revenue budget for the year."
        />
        <KpiTile
          icon="upload"
          tone="teal"
          label="Month over month"
          value={compactMoney(point?.revenueMtd)}
          sub={previous ? `vs period ${previous.period}` : "no earlier period with data"}
          delta={momPct === null ? undefined : { text: signedPercent(momPct), tone: deltaTone(momPct, "up") }}
        />
        <KpiTile
          icon="shield"
          tone="amber"
          label="Revenue status"
          value={ladder(varPct === null ? null : Math.abs(varPct), revT)}
          sub={`Policy ± ${revT.warning.toFixed(2)}%`}
          status={ladder(varPct === null ? null : Math.abs(varPct), revT)}
        />
        <KpiTile
          icon="book"
          tone="blue"
          label="Days in fiscal year"
          value={String(daysIn.elapsed)}
          sub={`of ${daysIn.total} days`}
        />
      </KpiRow>

      <Row cols="2-1">
        <SectionCard title="Revenues — budget vs actual" subtitle={`Year to date through ${scope.label}`}>
          <LineChart
            title="Revenues, budget against actual"
            summary={`Actual collections year to date against the budget expected by now, for fiscal year ${scope.fiscalYear}.`}
            categories={labels}
            format={(v) => compactMoney(v, 0)}
            height={260}
            series={[
              {
                key: "actual",
                label: "Actual (YTD)",
                color: "var(--color-viz-actual)",
                labelLast: true,
                points: series.points.map((p) => ({
                  value: toNumber(p.revenueYtd),
                  label: compactMoney(p.revenueYtd),
                })),
              },
              {
                key: "budget",
                label: "Budget (to date)",
                color: "var(--color-viz-budget)",
                dashed: true,
                points: series.points.map((p) => ({
                  value: p.hasData ? ((toNumber(p.revenueBudget) ?? 0) * p.period) / 12 : null,
                })),
              },
              {
                key: "full",
                label: "Budget (full year)",
                color: "var(--color-viz-reference)",
                dashed: true,
                markers: false,
                points: series.points.map(() => ({ value: fullYearBudget })),
              },
            ]}
          />
        </SectionCard>

        <SectionCard
          title="Revenue policy"
          subtitle="Your own thresholds"
          info="Every revenue alert on this page is judged against these."
        >
          <PolicyEchoCard
            rows={[
              { label: "Variance — warning", value: `± ${Number(policy.revenue.varianceWarning).toFixed(2)}%` },
              { label: "Variance — critical", value: `± ${Number(policy.revenue.varianceCritical).toFixed(2)}%` },
              { label: "Forecast — warning", value: `± ${Number(policy.revenue.forecastVarianceWarning).toFixed(2)}%` },
              { label: "Forecast — critical", value: `± ${Number(policy.revenue.forecastVarianceCritical).toFixed(2)}%` },
              { label: "Month-over-month change", value: `± ${Number(policy.revenue.significantChange).toFixed(2)}%` },
            ]}
            manageHref={userCan(user, "configure_district") ? "/policies" : undefined}
            manageLabel="Manage revenue policies"
          />
        </SectionCard>
      </Row>

      <Row cols="2-1">
        <SectionCard
          title="Revenue by major source"
          footer="Browse revenue detail"
          footerHref={`/data/revenue-detail?fy=${scope.fiscalYear}&period=${scope.period}`}
        >
          <DataTable
            columns={[
              { key: "source", label: "Revenue source" },
              { key: "budget", label: "Budget (full year)", align: "right" },
              { key: "actual", label: "Actual (YTD)", align: "right" },
              { key: "pctBudget", label: "% of budget", align: "right" },
              { key: "variance", label: "Variance $", align: "right" },
              { key: "variancePct", label: "Variance %", align: "right" },
            ]}
            rows={bySource.rows.map((r) => ({
              id: r.id,
              cells: {
                source: `${r.code} — ${r.name}`,
                budget: money(r.budget),
                actual: money(r.actualYtd),
                pctBudget: percent(r.consumption.percent),
                variance: {
                  value: accounting(r.pace.amount),
                  tone: r.pace.amount.isNegative() ? "negative" : "positive",
                },
                variancePct: {
                  value: signedPercent(r.pace.percent),
                  tone: r.pace.amount.isNegative() ? "negative" : "positive",
                },
              },
            }))}
            total={{
              id: "total",
              total: true,
              cells: {
                source: "Total revenues",
                budget: money(bySource.total.budget),
                actual: money(bySource.total.actualYtd),
                pctBudget: percent(bySource.total.consumption.percent),
                variance: {
                  value: accounting(bySource.total.pace.amount),
                  tone: bySource.total.pace.amount.isNegative() ? "negative" : "positive",
                },
                variancePct: {
                  value: signedPercent(bySource.total.pace.percent),
                  tone: bySource.total.pace.amount.isNegative() ? "negative" : "positive",
                },
              },
            }}
          />
        </SectionCard>

        <div className="grid gap-4">
          <SectionCard title="Top positive variances" bodyClassName="min-h-0">
            <MoverList
              items={movers.positive.map((r) => ({
                id: r.id,
                name: r.name,
                value: accounting(r.pace.amount, { compact: true }),
                tone: "positive" as const,
              }))}
            />
          </SectionCard>
          <SectionCard title="Top negative variances" bodyClassName="min-h-0">
            <MoverList
              items={movers.negative.map((r) => ({
                id: r.id,
                name: r.name,
                value: accounting(r.pace.amount, { compact: true }),
                tone: "negative" as const,
              }))}
            />
          </SectionCard>
        </div>
      </Row>

      <Row cols="2">
        <SectionCard title="Revenue variance trend" subtitle="Actual against the budget expected by each month">
          <ColumnChart
            title="Revenue variance by month"
            summary="How far collections ran ahead of or behind the pro-rated budget in each month of the year."
            format={(v) => `${v.toFixed(0)}%`}
            height={230}
            columns={series.points
              .filter((p) => p.hasData)
              .map((p) => {
                const b = toNumber(p.revenueBudget) ?? 0;
                const a = toNumber(p.revenueYtd) ?? 0;
                const expected = (b * p.period) / 12;
                const v = expected ? ((a - expected) / expected) * 100 : 0;
                return { label: labels[p.period - 1], value: v, display: `${v.toFixed(1)}%` };
              })}
          />
        </SectionCard>

        <SectionCard title="Revenue by category (YTD)" footer="View full breakdown" footerHref={`/data/revenue-detail?fy=${scope.fiscalYear}&period=${scope.period}`}>
          <DonutChart
            title="Revenue by category"
            summary="Share of year-to-date collections by revenue type."
            centerValue={compactMoney(byType.total.actualYtd)}
            centerLabel="Total actual (YTD)"
            slices={donut.rows.map((r, i) => ({
              label: r.name,
              value: toNumber(r.actualYtd) ?? 0,
              color: SERIES_SLOTS[i % SERIES_SLOTS.length],
              display: compactMoney(r.actualYtd),
            }))}
          />
        </SectionCard>
      </Row>

      <SectionCard title={`Revenue alerts (${alerts?.alerts.filter((a) => a.group === "revenue").length ?? 0})`} footer="View all alerts" footerHref="/alerts">
        <AlertList
          alerts={(alerts?.alerts ?? [])
            .filter((a) => a.group === "revenue")
            .map((a) => ({ id: a.id, severity: a.severity, title: a.title, message: a.message }))}
          empty="No revenue thresholds have been crossed this period."
        />
      </SectionCard>

      <FooterInfoBar action="Manage policies" href="/policies">
        Revenue figures are drawn from the detail file committed for this period. Adjust the
        thresholds above to change when these alerts fire.
      </FooterInfoBar>
    </div>
  );
}
