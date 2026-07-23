import { redirect } from "next/navigation";
import { getTenantDb, userCan } from "@/lib/auth/dal";
import { resolveScope } from "@/lib/dashboard/scope";
import {
  loadCore,
  reserveThresholds,
  daysCashThresholds,
  utilisationThresholds,
  revenueVarianceThresholds,
  periodAxisLabels,
} from "@/lib/dashboard/load";
import { revenueBySource, expenditureByFunction, topMovers } from "@/lib/finance/breakdown";
import { buildInsights } from "@/lib/alerts/insights";
import { ladder, bands as statusBands } from "@/lib/dashboard/status";
import {
  compactMoney,
  accounting,
  percent,
  days as fmtDays,
  toNumber,
  NOT_AVAILABLE,
  deltaTone,
  deltaArrow,
  signedPercent,
} from "@/lib/dashboard/format";
import { PageHeader } from "@/components/page-header";
import { KpiTile, KpiRow } from "@/components/dashboard/kpi-tile";
import { SectionCard, DataAsOf, FooterInfoBar } from "@/components/dashboard/section-card";
import { DataTable } from "@/components/dashboard/data-table";
import { AlertSummary, InsightList } from "@/components/dashboard/alert-list";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { EmptyState, SubstitutionNotice, Row } from "@/components/dashboard/shared";
import { ScopeBar } from "@/components/dashboard/scope-bar";
import { LineChart } from "@/components/dashboard/charts/line-chart";
import { HBarChart } from "@/components/dashboard/charts/hbar-chart";
import { Gauge } from "@/components/dashboard/charts/gauge";
import { Sparkline } from "@/components/dashboard/charts/sparkline";
import { scopeOptions } from "@/lib/dashboard/options";

/**
 * The Executive dashboard — the cross-domain summary (Spec §3).
 *
 * Everything on this page comes from committed data. The version that shipped in Milestone
 * 1 showed hardcoded sample figures behind a banner; nothing here is invented, and where a
 * figure cannot be computed it shows an em-dash and a grey N/A badge rather than a zero.
 */
export default async function ExecutiveDashboard({
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
        <PageHeader
          title="Executive Dashboard"
          description="Financial summary and key indicators of fiscal health."
        />
        <EmptyState
          title="No financial data yet"
          action={userCan(user, "upload_data") ? "Upload data" : undefined}
          href="/data/upload"
        >
          Once a reporting period has been uploaded and committed, this dashboard shows your
          district&apos;s revenues, spending, reserves and cash position against the thresholds you
          have set.
        </EmptyState>
      </div>
    );
  }

  const core = await loadCore(db, districtId, scope);
  const { series, point, policy, alerts, reserve } = core;
  const facts = alerts?.facts ?? null;

  const revVersion = core.versions.get("REVENUE_DETAIL");
  const expVersion = core.versions.get("EXPENDITURE_DETAIL");

  const [revenue, expenditure] = await Promise.all([
    revVersion
      ? revenueBySource(db, { versionId: revVersion, fundId: scope.fundId, periodsElapsed: scope.period })
      : null,
    expVersion
      ? expenditureByFunction(db, { versionId: expVersion, fundId: scope.fundId, periodsElapsed: scope.period })
      : null,
  ]);

  // ---------- the ladders, all from the district's own thresholds ----------
  const reserveT = reserveThresholds(policy);
  const cashT = daysCashThresholds(policy);
  const utilT = utilisationThresholds(policy);
  const revT = revenueVarianceThresholds(policy);

  const reservePct = toNumber(reserve?.percent);
  const daysCash = toNumber(facts?.daysCashOnHand);
  const utilPct = toNumber(facts?.utilizationPercent);
  const revVarPct = toNumber(facts?.revenueVariancePercent);
  const expVarPct = toNumber(facts?.expenditureForecastVariancePercent);

  const reserveRung = ladder(reservePct, reserveT);
  const cashRung = ladder(daysCash, cashT);

  // ---------- trend series ----------
  const labels = periodAxisLabels(scope, series.points.length);
  const fundBalanceTrend = series.points.map((p) => ({
    value: toNumber(p.fundBalance),
    label: compactMoney(p.fundBalance),
  }));
  const unassignedTrend = series.points.map((p) => ({
    value: toNumber(p.unassignedFundBalance),
    label: compactMoney(p.unassignedFundBalance),
  }));

  const spark = (pick: (i: number) => number | null) =>
    series.points.map((_, i) => pick(i));

  // ---------- §3.2a financial health summary ----------
  const health = [
    {
      id: "reserve",
      indicator: "Unassigned fund balance %",
      current: percent(reserve?.percent),
      target: `≥ ${reserveT.target.toFixed(2)}%`,
      rung: reserveRung,
      trend: spark((i) => {
        const p = series.points[i];
        const budget = toNumber(series.adoptedExpenditureBudget);
        const u = toNumber(p.unassignedFundBalance);
        return u !== null && budget ? (u / budget) * 100 : null;
      }),
    },
    {
      id: "days-cash",
      indicator: "Days of operating cash",
      current: daysCash === null ? NOT_AVAILABLE : `${fmtDays(daysCash)} days`,
      target: `≥ ${cashT.warning} days`,
      rung: cashRung,
      trend: spark((i) => {
        const c = toNumber(series.points[i].endingCash);
        const budget = toNumber(series.adoptedExpenditureBudget);
        return c !== null && budget ? c / (budget / 365) : null;
      }),
    },
    {
      id: "utilisation",
      indicator: "Budget utilisation",
      current: percent(facts?.utilizationPercent),
      target: `≤ ${utilT.warning.toFixed(2)}%`,
      rung: ladder(utilPct, utilT),
      trend: spark((i) => {
        const p = series.points[i];
        const b = toNumber(p.expenditureBudget);
        const a = toNumber(p.expenditureYtd);
        const e = toNumber(p.encumbrances);
        return b && a !== null && e !== null ? ((a + e) / b) * 100 : null;
      }),
    },
    {
      id: "revenue-variance",
      indicator: "Revenue variance (YTD)",
      current: signedPercent(facts?.revenueVariancePercent),
      target: `± ${revT.warning.toFixed(2)}%`,
      rung: ladder(revVarPct === null ? null : Math.abs(revVarPct), revT),
      trend: spark((i) => {
        const p = series.points[i];
        const b = toNumber(p.revenueBudget);
        const a = toNumber(p.revenueYtd);
        if (!b || a === null) return null;
        const expected = (b * p.period) / 12;
        return expected ? ((a - expected) / expected) * 100 : null;
      }),
    },
    {
      id: "expenditure-forecast",
      indicator: "Expenditure forecast variance",
      current: signedPercent(facts?.expenditureForecastVariancePercent),
      target: `± ${Number(policy.expenditure.forecastVarianceWarning).toFixed(2)}%`,
      rung: ladder(
        expVarPct === null ? null : Math.abs(expVarPct),
        {
          warning: Number(policy.expenditure.forecastVarianceWarning),
          critical: Number(policy.expenditure.forecastVarianceCritical),
          direction: "rising",
        },
      ),
      trend: spark(() => null),
    },
  ];

  // ---------- §3.3a/b top-five comparisons ----------
  const topRevenue = (revenue?.rows ?? []).slice(0, 5).map((r) => ({
    label: r.name,
    values: [toNumber(r.actualYtd) ?? 0, toNumber(r.pace.budget) ?? 0, toNumber(r.budget) ?? 0],
    displays: [compactMoney(r.actualYtd)],
  }));
  const topExpenditure = (expenditure?.rows ?? []).slice(0, 5).map((r) => ({
    label: r.name,
    values: [toNumber(r.actualYtd) ?? 0, toNumber(r.pace.budget) ?? 0, toNumber(r.budget) ?? 0],
    displays: [compactMoney(r.actualYtd)],
  }));

  const insights = facts
    ? buildInsights({
        facts,
        policy,
        revenueMovers: revenue ? topMovers(revenue).positive.concat(topMovers(revenue).negative) : [],
        expenditureMovers: expenditure ? topMovers(expenditure).positive : [],
      })
    : [];

  const options = scopeOptions(scope);

  return (
    <div className="animate-fade-up space-y-[18px]">
      <PageHeader
        title="Executive Dashboard"
        description="Financial summary and key indicators of fiscal health."
        actions={
          <ScopeBar
            periods={options.periods}
            period={options.period}
            funds={options.funds}
            fund={scope.fundId ?? ""}
            exportHref={options.exportHref("/dashboard/export")}
          />
        }
      />

      {scope.substituted && (
        <SubstitutionNotice asked={scope.substituted.asked} showing={scope.substituted.showing} />
      )}
      <DataAsOf date={scope.dataAsOf} note={scope.fund ? scope.fund.name : "All funds"} />

      {/* ---------- §3.1 KPI row ---------- */}
      <KpiRow count={6}>
        <KpiTile
          icon="chart"
          tone="green"
          label="Total revenues (YTD)"
          value={compactMoney(point?.revenueYtd)}
          sub={
            point && toNumber(point.revenueBudget)
              ? `${percent(((toNumber(point.revenueYtd) ?? 0) / (toNumber(point.revenueBudget) || 1)) * 100)} of budget`
              : "No revenue budget uploaded"
          }
          delta={
            revVarPct === null
              ? undefined
              : {
                  text: `${deltaArrow(revVarPct)} ${signedPercent(revVarPct)} vs pace`,
                  tone: deltaTone(revVarPct, "up"),
                }
          }
          href="/revenues"
          hrefLabel="Detail"
        />

        <KpiTile
          icon="database"
          tone="blue"
          label="Total expenditures (YTD)"
          value={compactMoney(point?.expenditureYtd)}
          sub={
            point && toNumber(point.expenditureBudget)
              ? `${percent(((toNumber(point.expenditureYtd) ?? 0) / (toNumber(point.expenditureBudget) || 1)) * 100)} of budget`
              : "No expenditure budget uploaded"
          }
          delta={
            utilPct === null
              ? undefined
              : { text: `${percent(utilPct)} committed`, tone: "neutral" }
          }
          href="/expenditures"
          hrefLabel="Detail"
        />

        <KpiTile
          icon="shield"
          tone="purple"
          label="Unassigned fund balance %"
          value={percent(reserve?.percent)}
          sub={
            core.generalFund
              ? `of budgeted ${core.generalFund.name} expenditures`
              : "no General Fund identified"
          }
          status={reserveRung}
          statusNote={`Target ≥ ${reserveT.target.toFixed(2)}%`}
          unavailableReason="Needs a fund typed General, an opening fund balance and an adopted expenditure budget."
          href="/fund-balance"
          hrefLabel="Detail"
        />

        <KpiTile
          icon="activity"
          tone="amber"
          label="Days of operating cash"
          value={daysCash === null ? NOT_AVAILABLE : fmtDays(daysCash)}
          sub="days in reserve"
          status={cashRung}
          statusNote={`Policy ≥ ${cashT.warning} days`}
          unavailableReason="Needs a cash position file and an adopted expenditure budget."
          href="/cash"
          hrefLabel="Detail"
        />

        <KpiTile
          icon="reports"
          tone="teal"
          label="Available budget"
          value={accounting(facts?.availableBudget, { compact: true })}
          sub="budget less spend and encumbrances"
          delta={
            facts && toNumber(facts.availableBudget) !== null
              ? {
                  text: toNumber(facts.availableBudget)! < 0 ? "Overcommitted" : "Remaining",
                  tone: deltaTone(toNumber(facts.availableBudget), "up"),
                }
              : undefined
          }
        />

        <KpiTile
          icon="mail"
          tone="red"
          label="Alerts"
          value={String(alerts?.alerts.length ?? 0)}
          sub="require attention"
          href="/alerts"
          hrefLabel="View all"
        />
      </KpiRow>

      {/* ---------- §3.2 health · trend · cash ---------- */}
      <Row cols="3">
        <SectionCard
          title="Financial health summary"
          subtitle="Key indicators compared to policy targets"
          footer="Go to financial policies"
          footerHref="/policies"
        >
          <DataTable
            dense
            columns={[
              { key: "indicator", label: "Indicator" },
              { key: "current", label: "Current", align: "right" },
              { key: "target", label: "Target", align: "right" },
              { key: "status", label: "Status", align: "right" },
              { key: "trend", label: "Trend", align: "right" },
            ]}
            rows={health.map((h) => ({
              id: h.id,
              cells: {
                indicator: h.indicator,
                current: h.current,
                target: h.target,
                status: <StatusBadge status={h.rung} size="sm" dot={false} />,
                trend: <Sparkline values={h.trend} label={`${h.indicator} trend`} />,
              },
            }))}
          />
        </SectionCard>

        <SectionCard
          title="Fund balance trend"
          subtitle={scope.fund ? scope.fund.name : "All funds"}
          footer="View full analysis"
          footerHref="/fund-balance"
        >
          <LineChart
            title="Fund balance trend"
            summary={`Total and unassigned fund balance by month for fiscal year ${scope.fiscalYear}.`}
            categories={labels}
            format={(v) => compactMoney(v, 0)}
            height={230}
            series={[
              {
                key: "total",
                label: "Total fund balance",
                color: "var(--color-viz-budget)",
                points: fundBalanceTrend,
                labelLast: true,
              },
              {
                key: "unassigned",
                label: "Unassigned",
                color: "var(--color-viz-actual)",
                points: unassignedTrend,
                labelLast: true,
              },
            ]}
          />
        </SectionCard>

        <SectionCard
          title="Cash position"
          subtitle={`As of ${scope.label}`}
          footer="Go to cash position"
          footerHref="/cash"
        >
          <div className="flex flex-col items-center">
            <Gauge
              value={daysCash}
              bands={statusBands(cashT)}
              rung={cashRung}
              unit="days on hand"
              title="Days cash on hand"
              summary={
                daysCash === null
                  ? "Days cash on hand cannot be computed for this period."
                  : `${fmtDays(daysCash)} days of cash on hand, against a policy minimum of ${cashT.warning}.`
              }
            />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-line-soft pt-3.5">
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-2">
                Cash balance
              </dt>
              <dd className="mt-1 text-[15px] font-semibold tabular-nums text-ink">
                {compactMoney(point?.endingCash)}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-2">
                Avg monthly spend
              </dt>
              <dd className="mt-1 text-[15px] font-semibold tabular-nums text-ink">
                {compactMoney(toNumber(series.adoptedExpenditureBudget)! / 12)}
              </dd>
            </div>
          </dl>
        </SectionCard>
      </Row>

      {/* ---------- §3.3 comparisons and alert summary ---------- */}
      <Row cols="3">
        <SectionCard
          title="Revenues vs budget (YTD)"
          subtitle="Top five sources"
          footer="Go to revenues"
          footerHref="/revenues"
        >
          <HBarChart
            title="Revenues against budget"
            summary="Actual year-to-date revenue against the budget expected by now and the full-year budget, for the five largest sources."
            rows={topRevenue}
            gutter={130}
            series={[
              { label: "Actual (YTD)", color: "var(--color-viz-actual)" },
              { label: "Budget (to date)", color: "var(--color-viz-budget)" },
              { label: "Budget (full year)", color: "var(--color-viz-reference)", outline: true },
            ]}
          />
        </SectionCard>

        <SectionCard
          title="Expenditures vs budget (YTD)"
          subtitle="Top five functions"
          footer="Go to expenditures"
          footerHref="/expenditures"
        >
          <HBarChart
            title="Expenditures against budget"
            summary="Actual year-to-date spending against the budget expected by now and the full-year budget, for the five largest functions."
            rows={topExpenditure}
            gutter={130}
            series={[
              { label: "Actual (YTD)", color: "var(--color-viz-actual)" },
              { label: "Budget (to date)", color: "var(--color-viz-budget)" },
              { label: "Budget (full year)", color: "var(--color-viz-reference)", outline: true },
            ]}
          />
        </SectionCard>

        <SectionCard title="Alert summary" footer="View all alerts" footerHref="/alerts">
          <AlertSummary
            critical={alerts?.criticalCount ?? 0}
            warning={alerts?.warningCount ?? 0}
            informational={alerts?.informationalCount ?? 0}
            href="/alerts"
          />
        </SectionCard>
      </Row>

      {/* ---------- §3.4 key insights ---------- */}
      {insights.length > 0 && (
        <SectionCard title="Key insights">
          <InsightList insights={insights} />
        </SectionCard>
      )}

      {!point && (
        <FooterInfoBar>
          This period has no committed detail data. The figures above are drawn from the periods
          that do, and the cards that need this period show as unavailable.
        </FooterInfoBar>
      )}
    </div>
  );
}
