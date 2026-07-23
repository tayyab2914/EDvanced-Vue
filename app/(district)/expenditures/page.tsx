import { redirect } from "next/navigation";
import { getTenantDb, userCan } from "@/lib/auth/dal";
import { resolveScope } from "@/lib/dashboard/scope";
import {
  loadCore,
  utilisationThresholds,
  expenditureForecastThresholds,
  periodAxisLabels,
} from "@/lib/dashboard/load";
import { expenditureByFunction, expenditureByObjectType, topMovers, foldTail } from "@/lib/finance/breakdown";
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
import { SectionCard, DataAsOf, FooterInfoBar, StatStrip } from "@/components/dashboard/section-card";
import { DataTable, MoverList } from "@/components/dashboard/data-table";
import { AlertList } from "@/components/dashboard/alert-list";
import { EmptyState, SubstitutionNotice, Row, PolicyEchoCard } from "@/components/dashboard/shared";
import { ScopeBar } from "@/components/dashboard/scope-bar";
import { LineChart } from "@/components/dashboard/charts/line-chart";
import { ColumnChart } from "@/components/dashboard/charts/column-chart";
import { DonutChart } from "@/components/dashboard/charts/donut-chart";
import { scopeOptions } from "@/lib/dashboard/options";
import { SERIES_SLOTS } from "@/lib/dashboard/palette";

/** The Expenditures dashboard (Spec §5) — spending against budget and forecast. */
export default async function ExpenditureDashboard({
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
        <PageHeader title="Expenditures Dashboard" description="Track spending performance against budget and forecast." />
        <EmptyState title="No expenditure data yet" action="Upload expenditure detail" href="/data/upload">
          Upload an expenditure detail file and this dashboard will show spending, encumbrances
          and available budget by function and object.
        </EmptyState>
      </div>
    );
  }

  const core = await loadCore(db, districtId, scope);
  const { series, point, previous, policy, alerts } = core;
  const facts = alerts?.facts ?? null;
  const version = core.versions.get("EXPENDITURE_DETAIL");

  if (!version) {
    return (
      <div className="animate-fade-up space-y-[18px]">
        <PageHeader title="Expenditures Dashboard" description="Track spending performance against budget and forecast." />
        <EmptyState title={`No expenditure detail for ${scope.label}`} action="Upload expenditure detail" href="/data/upload">
          Other periods may have data — use the period selector, or upload this one.
        </EmptyState>
      </div>
    );
  }

  const args = { versionId: version, fundId: scope.fundId, periodsElapsed: scope.period };
  const [byFunction, byObjectType] = await Promise.all([
    expenditureByFunction(db, args),
    expenditureByObjectType(db, args),
  ]);
  const movers = topMovers(byFunction, 4);
  const donut = foldTail(byObjectType, scope.period, 5);

  const utilT = utilisationThresholds(policy);
  const fcT = expenditureForecastThresholds(policy);

  const utilPct = toNumber(byFunction.total.utilisation.percent);
  const forecastPct = toNumber(facts?.expenditureForecastVariancePercent);
  const momPct = changePercent(point?.expenditureMtd, previous?.expenditureMtd);
  const daysIn = daysIntoFiscalYear(scope.period);
  const utilRung = ladder(utilPct, utilT);

  const labels = periodAxisLabels(scope, series.points.length);
  const fullYearBudget = toNumber(byFunction.total.budget) ?? 0;
  const options = scopeOptions(scope);

  return (
    <div className="animate-fade-up space-y-[18px]">
      <PageHeader
        title="Expenditures Dashboard"
        description="Track spending performance against budget and forecast."
        actions={
          <ScopeBar
            periods={options.periods}
            period={options.period}
            funds={options.funds}
            fund={scope.fundId ?? ""}
            exportHref={options.exportHref("/expenditures/export")}
          />
        }
      />
      {scope.substituted && <SubstitutionNotice asked={scope.substituted.asked} showing={scope.substituted.showing} />}
      <DataAsOf date={scope.dataAsOf} note={scope.fund ? scope.fund.name : "All funds"} />

      <KpiRow count={6}>
        <KpiTile
          icon="database"
          tone="blue"
          label="Total expenditures (YTD)"
          value={compactMoney(byFunction.total.actualYtd)}
          sub={`${percent(byFunction.total.consumption.percent)} of full-year budget`}
        />
        <KpiTile
          icon="chart"
          tone={utilRung === "Action Required" ? "red" : utilRung === "Monitor" ? "amber" : "green"}
          label="Budget utilisation"
          value={percent(byFunction.total.utilisation.percent)}
          sub="spend plus encumbrances"
          status={utilRung}
          statusNote={`Warning at ${utilT.warning.toFixed(0)}%`}
        />
        <KpiTile
          icon="reports"
          tone="purple"
          label="Forecast variance (year end)"
          value={signedPercent(forecastPct)}
          sub="projected spending against budget"
          status={ladder(forecastPct === null ? null : Math.abs(forecastPct), fcT)}
        />
        <KpiTile
          icon="upload"
          tone="teal"
          label="Month over month"
          value={compactMoney(point?.expenditureMtd)}
          sub={previous ? `vs period ${previous.period}` : "no earlier period with data"}
          delta={momPct === null ? undefined : { text: signedPercent(momPct), tone: deltaTone(momPct, "down") }}
        />
        <KpiTile
          icon="shield"
          tone="amber"
          label="Available budget"
          value={accounting(byFunction.total.available, { compact: true })}
          sub="budget less spend and encumbrances"
          delta={
            byFunction.total.available.isNegative()
              ? { text: "Overcommitted", tone: "negative" }
              : { text: "Remaining", tone: "positive" }
          }
        />
        <KpiTile icon="book" tone="blue" label="Days in fiscal year" value={String(daysIn.elapsed)} sub={`of ${daysIn.total} days`} />
      </KpiRow>

      <Row cols="2-1">
        <SectionCard title="Expenditures — budget vs actual" subtitle={`Year to date through ${scope.label}`}>
          <LineChart
            title="Expenditures, budget against actual"
            summary={`Actual spending year to date against the budget expected by now, for fiscal year ${scope.fiscalYear}.`}
            categories={labels}
            format={(v) => compactMoney(v, 0)}
            height={250}
            series={[
              {
                key: "actual",
                label: "Actual (YTD)",
                color: "var(--color-viz-actual)",
                labelLast: true,
                points: series.points.map((p) => ({ value: toNumber(p.expenditureYtd), label: compactMoney(p.expenditureYtd) })),
              },
              {
                key: "budget",
                label: "Budget (to date)",
                color: "var(--color-viz-budget)",
                dashed: true,
                points: series.points.map((p) => ({
                  value: p.hasData ? ((toNumber(p.expenditureBudget) ?? 0) * p.period) / 12 : null,
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
            <StatStrip
              items={[
                { label: "Actual (YTD)", value: money(byFunction.total.actualYtd) },
                { label: "Budget (to date)", value: money(byFunction.total.pace.budget) },
                { label: "Variance (YTD)", value: accounting(byFunction.total.pace.amount) },
                { label: "Variance %", value: signedPercent(byFunction.total.pace.percent) },
              ]}
            />
          </div>
        </SectionCard>

        <SectionCard title="Expenditure policy" subtitle="Your own thresholds">
          <PolicyEchoCard
            rows={[
              { label: "Budget utilisation — warning", value: `${Number(policy.expenditure.utilizationWarning).toFixed(2)}%` },
              { label: "Budget utilisation — critical", value: `${Number(policy.expenditure.utilizationCritical).toFixed(2)}%` },
              { label: "Forecast variance — warning", value: `± ${Number(policy.expenditure.forecastVarianceWarning).toFixed(2)}%` },
              { label: "Forecast variance — critical", value: `± ${Number(policy.expenditure.forecastVarianceCritical).toFixed(2)}%` },
              { label: "Month-over-month — warning", value: `${Number(policy.expenditure.momIncreaseWarning).toFixed(2)}%` },
              { label: "Month-over-month — critical", value: `${Number(policy.expenditure.momIncreaseCritical).toFixed(2)}%` },
            ]}
            manageHref={userCan(user, "configure_district") ? "/policies" : undefined}
            manageLabel="Manage expenditure policies"
          />
        </SectionCard>
      </Row>

      <Row cols="2-1">
        <SectionCard
          title="Expenditures by function"
          footer="Browse expenditure detail"
          footerHref={`/data/expenditure-detail?fy=${scope.fiscalYear}&period=${scope.period}`}
        >
          <DataTable
            columns={[
              { key: "fn", label: "Function" },
              { key: "budget", label: "Budget", align: "right" },
              { key: "actual", label: "Actual (YTD)", align: "right" },
              { key: "enc", label: "Encumbered", align: "right" },
              { key: "avail", label: "Available", align: "right" },
              { key: "util", label: "Utilised", align: "right" },
            ]}
            rows={byFunction.rows.map((r) => ({
              id: r.id,
              cells: {
                fn: `${r.code} — ${r.name}`,
                budget: money(r.budget),
                actual: money(r.actualYtd),
                enc: money(r.encumbrances),
                avail: {
                  value: accounting(r.available),
                  tone: r.available.isNegative() ? "negative" : "neutral",
                },
                util: {
                  value: percent(r.utilisation.percent),
                  tone:
                    ladder(toNumber(r.utilisation.percent), utilT) === "Action Required"
                      ? "negative"
                      : "neutral",
                },
              },
            }))}
            total={{
              id: "total",
              total: true,
              cells: {
                fn: "Total expenditures",
                budget: money(byFunction.total.budget),
                actual: money(byFunction.total.actualYtd),
                enc: money(byFunction.total.encumbrances),
                avail: {
                  value: accounting(byFunction.total.available),
                  tone: byFunction.total.available.isNegative() ? "negative" : "neutral",
                },
                util: percent(byFunction.total.utilisation.percent),
              },
            }}
          />
        </SectionCard>

        <div className="grid gap-4">
          <SectionCard title="Largest overspends" bodyClassName="min-h-0">
            <MoverList
              items={movers.positive.map((r) => ({
                id: r.id,
                name: r.name,
                value: accounting(r.pace.amount, { compact: true }),
                tone: "negative" as const,
              }))}
              empty="Nothing is running ahead of budget."
            />
          </SectionCard>
          <SectionCard title="Largest underspends" bodyClassName="min-h-0">
            <MoverList
              items={movers.negative.map((r) => ({
                id: r.id,
                name: r.name,
                value: accounting(r.pace.amount, { compact: true }),
                tone: "positive" as const,
              }))}
              empty="Nothing is running behind budget."
            />
          </SectionCard>
        </div>
      </Row>

      <Row cols="2">
        <SectionCard title="Budget utilisation trend" subtitle="Spend plus encumbrances, against your thresholds">
          <ColumnChart
            title="Budget utilisation by month"
            summary={`Budget utilisation each month against warning at ${utilT.warning}% and critical at ${utilT.critical}%.`}
            mode="threshold"
            format={(v) => `${v.toFixed(0)}%`}
            height={240}
            color="var(--color-viz-budget)"
            thresholds={[
              { at: utilT.warning, label: `Warning ${utilT.warning}%`, color: "var(--color-monitor-mark)" },
              { at: utilT.critical, label: `Critical ${utilT.critical}%`, color: "var(--color-action-mark)" },
            ]}
            columns={series.points
              .filter((p) => p.hasData)
              .map((p) => {
                const b = toNumber(p.expenditureBudget) ?? 0;
                const a = toNumber(p.expenditureYtd) ?? 0;
                const e = toNumber(p.encumbrances) ?? 0;
                const v = b ? ((a + e) / b) * 100 : 0;
                return { label: labels[p.period - 1], value: v, display: `${v.toFixed(0)}%` };
              })}
          />
        </SectionCard>

        <SectionCard title="Expenditures by object (YTD)">
          <DonutChart
            title="Expenditures by object type"
            summary="Share of year-to-date spending by object type."
            centerValue={compactMoney(byObjectType.total.actualYtd)}
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

      <SectionCard
        title={`Expenditure alerts (${alerts?.alerts.filter((a) => a.group === "expenditure").length ?? 0})`}
        footer="View all alerts"
        footerHref="/alerts"
      >
        <AlertList
          alerts={(alerts?.alerts ?? [])
            .filter((a) => a.group === "expenditure")
            .map((a) => ({ id: a.id, severity: a.severity, title: a.title, message: a.message }))}
          empty="No expenditure thresholds have been crossed this period."
        />
      </SectionCard>

      <FooterInfoBar action="Go to forecast and planning" href="/fund-balance/forecast">
        Adjust your growth assumptions to see how changes in spending flow through to fund
        balance and reserves over the next three years.
      </FooterInfoBar>
    </div>
  );
}
