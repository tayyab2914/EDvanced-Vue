import { redirect } from "next/navigation";
import { getTenantDb, userCan } from "@/lib/auth/dal";
import { resolveScope } from "@/lib/dashboard/scope";
import { loadCore, revenueVarianceThresholds, periodAxisLabels } from "@/lib/dashboard/load";
import { revenueBySource, revenueByType, topMovers, foldTail } from "@/lib/finance/breakdown";
import { ladder } from "@/lib/dashboard/status";
import { revenuePace } from "@/lib/dashboard/pace";
import { daysIntoFiscalYear } from "@/lib/finance/variance";
import {
  compactMoney,
  accounting,
  percent,
  signedPercent,
  toNumber,
  deltaTone,
  changePercent,
  sharePercent,
} from "@/lib/dashboard/format";
import { PageHeader } from "@/components/page-header";
import { KpiTile, KpiRow } from "@/components/dashboard/kpi-tile";
import { SectionCard, DataAsOf, FooterInfoBar } from "@/components/dashboard/section-card";
import { DataTable, MoverList } from "@/components/dashboard/data-table";
import { AlertList } from "@/components/dashboard/alert-list";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { EmptyState, SubstitutionNotice, Row, PolicyEchoCard } from "@/components/dashboard/shared";
import { ScopeBar } from "@/components/dashboard/scope-bar";
import { LineChart } from "@/components/dashboard/charts/line-chart";
import { ColumnChart } from "@/components/dashboard/charts/column-chart";
import { ShareBars, MetricStrip } from "@/components/dashboard/charts/budget-bars";
import { scopeOptions } from "@/lib/dashboard/options";
import { SERIES_SLOTS } from "@/lib/dashboard/palette";

/**
 * The Revenue dashboard (Spec §4) — performance against budget.
 *
 * TWO M4 CHANGES WORTH THE COMMENT
 *
 * 1. "Forecast" is gone, replaced by REMAINING TO COLLECT — current budget less actual
 *    revenue year to date. The client's reasoning is exactly right and worth preserving:
 *    "for the MVP, this will provide a clear and transparent view of revenue collection
 *    progress without introducing forecasting assumptions". A straight-lined year-end
 *    projection dressed as a forecast invites a district to plan against it, and this
 *    product does not yet have an engine that earns that. Remaining-to-collect is
 *    arithmetic, not a prediction.
 *
 * 2. "Budget (to date)" is now "Budget (YTD)" everywhere on this page, matching the
 *    vocabulary the rest of the dashboards use.
 *
 * The layout follows the client's own diagram: two chart columns and a narrower rail
 * carrying the policy echo, the movers and the alerts.
 */
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
        <PageHeader title="Revenue Dashboard" description="Track revenue performance against budget." />
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
        <PageHeader title="Revenue Dashboard" description="Track revenue performance against budget." />
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
  const categories = foldTail(byType, scope.period, 5);

  const revT = revenueVarianceThresholds(policy);
  const varPct = toNumber(facts?.revenueVariancePercent);
  const momPct = changePercent(point?.revenueMtd, previous?.revenueMtd);
  const daysIn = daysIntoFiscalYear(scope.period);
  const statusRung = ladder(varPct === null ? null : Math.abs(varPct), revT);

  const labels = periodAxisLabels(scope, series.points.length);
  const fullYearBudget = toNumber(bySource.total.budget) ?? 0;

  /**
   * REMAINING TO COLLECT — current budget less actual revenue YTD.
   *
   * Clamped at zero on the display side only: a district that has over-collected has
   * nothing left to collect, and a negative "remaining" would read as a shortfall when it
   * is the opposite. The over-collection is stated in the sub-line instead.
   */
  const remaining = bySource.total.budget.minus(bySource.total.actualYtd);
  const overCollected = remaining.isNegative();
  const collectedPct = toNumber(bySource.total.consumption.percent);

  const options = scopeOptions(scope);
  const revenueAlerts = (alerts?.alerts ?? []).filter((a) => a.group === "revenue");

  return (
    <div className="animate-fade-up space-y-[18px]">
      <PageHeader
        title="Revenue Dashboard"
        description="Track revenue performance against budget."
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

      {/* ---------- KPI CARDS ---------- */}
      <KpiRow count={6}>
        <KpiTile
          icon="dollar"
          tone="green"
          label="Total revenues"
          caption="Year to date"
          value={compactMoney(bySource.total.actualYtd)}
          sub={`${percent(bySource.total.consumption.percent)} of full-year budget`}
          delta={
            collectedPct === null
              ? undefined
              : {
                  text: `${percent(collectedPct)} collected`,
                  tone: "neutral",
                }
          }
        />

        <KpiTile
          icon="pie"
          tone="blue"
          label="Revenue variance"
          caption="Year to date"
          info="Actual collections against the budget expected by now, pro-rated across the year."
          value={accounting(bySource.total.pace.amount, { compact: true })}
          sub="against the budget expected by now"
          delta={
            varPct === null
              ? undefined
              : {
                  text: `${signedPercent(varPct)} ${varPct < 0 ? "below" : "above"} budget`,
                  tone: deltaTone(varPct, "up"),
                  direction: varPct < 0 ? "down" : varPct > 0 ? "up" : "flat",
                }
          }
        />

        <KpiTile
          icon="chart"
          tone="purple"
          label="Remaining to collect"
          caption="Current budget less collections"
          info="Current budget − actual revenue year to date. Not a forecast: no growth or seasonality is assumed."
          value={compactMoney(overCollected ? remaining.abs() : remaining)}
          sub={
            overCollected
              ? "collected above the full-year budget"
              : `of ${compactMoney(bySource.total.budget)} budgeted`
          }
          delta={
            overCollected
              ? { text: "Over-collected", tone: "positive" }
              : { text: `${percent(100 - (collectedPct ?? 0))} outstanding`, tone: "neutral" }
          }
        />

        <KpiTile
          icon="trend-up"
          tone="amber"
          label="Month over month change"
          caption={previous ? `vs period ${previous.period}` : "no earlier period"}
          value={compactMoney(point?.revenueMtd)}
          sub="collected this period"
          delta={
            momPct === null
              ? undefined
              : {
                  text: `${signedPercent(momPct)} ${momPct < 0 ? "decrease" : "increase"}`,
                  tone: deltaTone(momPct, "up"),
                  direction: momPct < 0 ? "down" : momPct > 0 ? "up" : "flat",
                }
          }
        />

        <KpiTile
          icon="target"
          tone={statusRung === "Action Required" ? "red" : statusRung === "Monitor" ? "amber" : "green"}
          label="Revenue status"
          caption="Year to date"
          value={statusRung === "N/A" ? "Not available" : statusRung}
          valueStatus={statusRung}
          sub={
            varPct === null
              ? "needs a revenue budget for the year"
              : Math.abs(varPct) < revT.warning
                ? `Within policy (± ${revT.warning.toFixed(2)}%)`
                : `Outside policy (± ${revT.warning.toFixed(2)}%)`
          }
          statusNote={`Policy ± ${revT.warning.toFixed(2)}%`}
        />

        <KpiTile
          icon="calendar"
          tone="teal"
          label="Days in fiscal year"
          caption={`Through ${scope.label}`}
          value={String(daysIn.elapsed)}
          sub={`of ${daysIn.total} days`}
          delta={{
            text: `${((daysIn.elapsed / daysIn.total) * 100).toFixed(1)}% elapsed`,
            tone: "neutral",
          }}
        />
      </KpiRow>

      {/* ---------- ROW 2: budget vs actual · by major source · policy + top positives ---------- */}
      <Row cols="2-2-1">
        <SectionCard
          title="Revenues — budget vs actual"
          subtitle={`Year to date through ${scope.label}`}
          info="Actual collections against the budget expected by now, with the full-year budget drawn as a reference."
        >
          <LineChart
            title="Revenues, budget against actual"
            summary={`Actual collections year to date against the budget expected by now, for fiscal year ${scope.fiscalYear}.`}
            categories={labels}
            format={(v) => compactMoney(v, 0)}
            height={280}
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
                // The client's terminology change: "Budget (to date)" → "Budget (YTD)".
                label: "Budget (YTD)",
                color: "var(--color-viz-budget)",
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
          <div className="mt-4">
            <MetricStrip
              items={[
                { label: "Actual (YTD)", value: compactMoney(bySource.total.actualYtd) },
                { label: "Budget (YTD)", value: compactMoney(bySource.total.pace.budget) },
                {
                  label: "Variance (YTD)",
                  value: accounting(bySource.total.pace.amount, { compact: true }),
                  note: signedPercent(bySource.total.pace.percent),
                  tone: bySource.total.pace.amount.isNegative() ? "negative" : "positive",
                },
                {
                  label: "Remaining to collect",
                  value: compactMoney(overCollected ? remaining.abs() : remaining),
                  note: overCollected ? "over-collected" : "current budget less actual",
                },
              ]}
            />
          </div>
        </SectionCard>

        <SectionCard
          title="Revenue by major source"
          info="Ranked by budget. Variance is measured against the budget expected by now."
          footer="View all revenue sources"
          footerHref={`/data/revenue-detail?fy=${scope.fiscalYear}&period=${scope.period}`}
        >
          <DataTable
            dense
            columns={[
              { key: "source", label: "Revenue source" },
              { key: "budget", label: "Budget (full year)", align: "right" },
              { key: "actual", label: "Actual (YTD)", align: "right" },
              { key: "pctBudget", label: "% of budget", align: "right" },
              { key: "variance", label: "Variance $", align: "right" },
              { key: "variancePct", label: "Variance %", align: "right" },
              { key: "status", label: "Status", align: "right" },
            ]}
            rows={bySource.rows.map((r) => {
              const pace = revenuePace(toNumber(r.pace.percent), revT);
              const negative = r.pace.amount.isNegative();
              return {
                id: r.id,
                flag: pace.label === "Critical" ? ("negative" as const) : undefined,
                cells: {
                  source: { value: `${r.code} — ${r.name}`, strong: true },
                  budget: compactMoney(r.budget),
                  actual: compactMoney(r.actualYtd),
                  pctBudget: percent(r.consumption.percent),
                  variance: {
                    value: accounting(r.pace.amount, { compact: true }),
                    tone: negative ? ("negative" as const) : ("positive" as const),
                    strong: true,
                  },
                  variancePct: {
                    value: signedPercent(r.pace.percent),
                    tone: negative ? ("negative" as const) : ("positive" as const),
                  },
                  status: (
                    <span className="flex justify-end">
                      <StatusBadge status={pace.rung} label={pace.label} size="sm" dot={false} />
                    </span>
                  ),
                },
              };
            })}
            total={{
              id: "total",
              total: true,
              cells: {
                source: "Total revenues",
                budget: compactMoney(bySource.total.budget),
                actual: compactMoney(bySource.total.actualYtd),
                pctBudget: percent(bySource.total.consumption.percent),
                variance: {
                  value: accounting(bySource.total.pace.amount, { compact: true }),
                  tone: bySource.total.pace.amount.isNegative()
                    ? ("negative" as const)
                    : ("positive" as const),
                },
                variancePct: {
                  value: signedPercent(bySource.total.pace.percent),
                  tone: bySource.total.pace.amount.isNegative()
                    ? ("negative" as const)
                    : ("positive" as const),
                },
                status: (
                  <span className="flex justify-end">
                    <StatusBadge
                      status={revenuePace(toNumber(bySource.total.pace.percent), revT).rung}
                      label={revenuePace(toNumber(bySource.total.pace.percent), revT).label}
                      size="sm"
                      dot={false}
                    />
                  </span>
                ),
              },
            }}
          />
        </SectionCard>

        <div className="grid content-start gap-4">
          <SectionCard
            title="Revenue policy"
            subtitle="Your own thresholds"
            info="Every revenue alert and status badge on this page is judged against these."
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

          <SectionCard title="Top positive variances" bodyClassName="min-h-0">
            <MoverList
              items={movers.positive.map((r) => ({
                id: r.id,
                name: r.name,
                value: accounting(r.pace.amount, { compact: true }),
                percent: signedPercent(r.pace.percent),
                tone: "positive" as const,
                status: (
                  <StatusBadge
                    status={revenuePace(toNumber(r.pace.percent), revT).rung}
                    label={revenuePace(toNumber(r.pace.percent), revT).label}
                    size="sm"
                    dot={false}
                  />
                ),
              }))}
              empty="Nothing is running ahead of budget."
            />
          </SectionCard>
        </div>
      </Row>

      {/* ---------- ROW 3: variance trend · by category · top negatives + alerts ---------- */}
      <Row cols="2-2-1">
        <SectionCard
          title="Revenue variance trend"
          subtitle="Actual against the budget expected by each month"
          info="A bar above the line means collections ran ahead of the pro-rated budget that month."
        >
          <ColumnChart
            title="Revenue variance by month"
            summary="How far collections ran ahead of or behind the pro-rated budget in each month of the year."
            format={(v) => `${v.toFixed(0)}%`}
            height={280}
            thresholds={[
              { at: revT.warning, label: `Warning +${revT.warning}%`, color: "var(--color-monitor-mark)" },
              { at: -revT.warning, label: `Warning −${revT.warning}%`, color: "var(--color-monitor-mark)" },
            ]}
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

        <SectionCard
          title="Revenue by category (YTD)"
          subtitle="Share of collections by revenue type"
          footer="View full breakdown"
          footerHref={`/data/revenue-detail?fy=${scope.fiscalYear}&period=${scope.period}`}
        >
          <ShareBars
            title="Revenue by category"
            summary="Share of year-to-date collections by revenue type."
            rows={categories.rows.map((r, i) => ({
              id: r.id,
              label: r.name,
              value: toNumber(r.actualYtd) ?? 0,
              display: compactMoney(r.actualYtd),
              share: percent(sharePercent(r.actualYtd, byType.total.actualYtd), 1),
              color: SERIES_SLOTS[i % SERIES_SLOTS.length],
            }))}
          />
          <div className="mt-4">
            <MetricStrip
              cols={3}
              items={[
                { label: "Total actual (YTD)", value: compactMoney(byType.total.actualYtd) },
                { label: "Total budget", value: compactMoney(byType.total.budget) },
                { label: "Categories", value: String(byType.rows.length) },
              ]}
            />
          </div>
        </SectionCard>

        <div className="grid content-start gap-4">
          <SectionCard title="Top negative variances" bodyClassName="min-h-0">
            <MoverList
              items={movers.negative.map((r) => ({
                id: r.id,
                name: r.name,
                value: accounting(r.pace.amount, { compact: true }),
                percent: signedPercent(r.pace.percent),
                tone: "negative" as const,
                status: (
                  <StatusBadge
                    status={revenuePace(toNumber(r.pace.percent), revT).rung}
                    label={revenuePace(toNumber(r.pace.percent), revT).label}
                    size="sm"
                    dot={false}
                  />
                ),
              }))}
              empty="Nothing is running behind budget."
            />
          </SectionCard>

          <SectionCard
            title={`Revenue alerts (${revenueAlerts.length})`}
            footer="View all alerts"
            footerHref="/alerts"
          >
            <AlertList
              alerts={revenueAlerts.map((a) => ({
                id: a.id,
                severity: a.severity,
                title: a.title,
                message: a.message,
              }))}
              href="/alerts"
              empty="No revenue thresholds have been crossed this period."
            />
          </SectionCard>
        </div>
      </Row>

      <FooterInfoBar action="Manage policies" href="/policies">
        Revenue figures are drawn from the detail file committed for this period. Remaining to
        collect is current budget less actual revenue — it assumes no growth and is not a
        forecast. Adjust the thresholds above to change when these alerts fire.
      </FooterInfoBar>
    </div>
  );
}
