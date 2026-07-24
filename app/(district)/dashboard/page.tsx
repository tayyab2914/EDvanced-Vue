import { redirect } from "next/navigation";
import { getTenantDb, userCan } from "@/lib/auth/dal";
import { resolveScope } from "@/lib/dashboard/scope";
import {
  loadCore,
  reserveThresholds,
  daysCashThresholds,
  utilisationThresholds,
  revenueVarianceThresholds,
  expenditureForecastThresholds,
  periodAxisLabels,
} from "@/lib/dashboard/load";
import {
  revenueBySource,
  expenditureByObjectType,
  topMovers,
  foldTail,
} from "@/lib/finance/breakdown";
import { buildInsights, trendNarrative } from "@/lib/alerts/insights";
import { ladder, bands as statusBands } from "@/lib/dashboard/status";
import { revenuePace, expenditurePace } from "@/lib/dashboard/pace";
import { cashFlowYtd, cashPercentOfExpenditures } from "@/lib/finance/cash";
import {
  compactMoney,
  accounting,
  percent,
  days as fmtDays,
  toNumber,
  NOT_AVAILABLE,
  deltaTone,
  signedPercent,
  changePercent,
} from "@/lib/dashboard/format";
import { PageHeader } from "@/components/page-header";
import { KpiTile, KpiRow } from "@/components/dashboard/kpi-tile";
import { SectionCard, DataAsOf, FooterInfoBar } from "@/components/dashboard/section-card";
import { DataTable } from "@/components/dashboard/data-table";
import { AlertSummary, InsightList } from "@/components/dashboard/alert-list";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { EmptyState, SubstitutionNotice, Row, KeyInsightBar } from "@/components/dashboard/shared";
import { ScopeBar } from "@/components/dashboard/scope-bar";
import { LineChart } from "@/components/dashboard/charts/line-chart";
import { BudgetBars, MetricStrip } from "@/components/dashboard/charts/budget-bars";
import { Gauge } from "@/components/dashboard/charts/gauge";
import { Sparkline } from "@/components/dashboard/charts/sparkline";
import { scopeOptions } from "@/lib/dashboard/options";
import { SummaryPrint } from "./summary-print";

/**
 * The Executive dashboard — the cross-domain summary (Spec §3).
 *
 * Everything on this page comes from committed data. The version that shipped in Milestone
 * 1 showed hardcoded sample figures behind a banner; nothing here is invented, and where a
 * figure cannot be computed it shows an em-dash and a grey N/A badge rather than a zero.
 *
 * `?view=summary` renders the same components as the client's one-page landscape Executive
 * Summary: the KPI row, both budget charts, the fund balance trend, the financial health
 * summary and the key insights, with the page chrome and the deep-dive cards suppressed. It
 * is the same server render, not a second implementation — a summary that could disagree
 * with the dashboard it summarises would be worse than no summary.
 */
export default async function ExecutiveDashboard({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string; period?: string; fund?: string; view?: string }>;
}) {
  const { db, user, districtId } = await getTenantDb();
  if (!userCan(user, "view_dashboards")) redirect("/master-data");

  const sp = await searchParams;
  const summary = sp.view === "summary";
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
  const { series, point, previous, policy, alerts, reserve } = core;
  const facts = alerts?.facts ?? null;

  const revVersion = core.versions.get("REVENUE_DETAIL");
  const expVersion = core.versions.get("EXPENDITURE_DETAIL");

  const [revenue, expenditure] = await Promise.all([
    revVersion
      ? revenueBySource(db, { versionId: revVersion, fundId: scope.fundId, periodsElapsed: scope.period })
      : null,
    // BY OBJECT, not by function — the client's note on §3.3b: "change to objects easier to
    // scan (Salaries, Employee Benefits, Purchased Svc, Energy Svc, Materials & Supplies,
    // Capital Outlay, Other)". Those are the object TYPES, so the executive card folds to
    // the same seven a business office reads, and the Expenditures dashboard keeps the
    // function breakdown for the drill-down.
    expVersion
      ? expenditureByObjectType(db, {
          versionId: expVersion,
          fundId: scope.fundId,
          periodsElapsed: scope.period,
          // Chart-of-accounts order, so the card reads Salaries · Employee Benefits ·
          // Purchased Svc · Energy Svc · Materials & Supplies · Capital Outlay · Other —
          // the client's list, in their sequence — and does not reshuffle each month.
          order: "chart",
        })
      : null,
  ]);

  // ---------- the ladders, all from the district's own thresholds ----------
  const reserveT = reserveThresholds(policy);
  const cashT = daysCashThresholds(policy);
  const utilT = utilisationThresholds(policy);
  const revT = revenueVarianceThresholds(policy);
  const expT = expenditureForecastThresholds(policy);

  const reservePct = toNumber(reserve?.percent);
  const daysCash = toNumber(facts?.daysCashOnHand);
  const utilPct = toNumber(facts?.utilizationPercent);
  const revVarPct = toNumber(facts?.revenueVariancePercent);

  /**
   * Spending against the budget expected by now, as a percentage.
   *
   * Not `expenditureForecastVariancePercent`, which measures the projected YEAR-END figure
   * against the full-year budget. Both are legitimate; only one of them is a year-to-date
   * variance, and this row is labelled as one.
   */
  const expectedSpend = point
    ? ((toNumber(point.expenditureBudget) ?? 0) * point.period) / 12
    : 0;
  const expenditurePacePct =
    point && expectedSpend
      ? (((toNumber(point.expenditureYtd) ?? 0) - expectedSpend) / expectedSpend) * 100
      : null;

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

  const spark = (pick: (i: number) => number | null) => series.points.map((_, i) => pick(i));

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
      indicator: "Budget utilisation (spend + enc.)",
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
      // Spending against the budget expected BY NOW, not the year-end forecast variance.
      // The two are different numbers and the client's mockup labels this one "(YTD)", so
      // it is computed from the same pace arithmetic the revenue row above it uses rather
      // than borrowed from the forecast fact, which would have been mislabelled.
      id: "expenditure-variance",
      indicator: "Expenditure variance (YTD)",
      current: signedPercent(expenditurePacePct),
      target: `± ${expT.warning.toFixed(2)}%`,
      rung: ladder(expenditurePacePct === null ? null : Math.abs(expenditurePacePct), expT),
      trend: spark((i) => {
        const p = series.points[i];
        const b = toNumber(p.expenditureBudget);
        const a = toNumber(p.expenditureYtd);
        if (!b || a === null) return null;
        const expected = (b * p.period) / 12;
        return expected ? ((a - expected) / expected) * 100 : null;
      }),
    },
  ];

  // ---------- §3.3a/b the budget comparisons, now with a status per row ----------
  const revenueRows = (revenue?.rows ?? []).slice(0, 5).map((r) => ({
    id: r.id,
    label: r.name,
    actual: toNumber(r.actualYtd) ?? 0,
    budgetToDate: toNumber(r.pace.budget) ?? 0,
    budgetFullYear: toNumber(r.budget) ?? 0,
    actualDisplay: compactMoney(r.actualYtd),
    budgetToDateDisplay: compactMoney(r.pace.budget),
    budgetFullYearDisplay: compactMoney(r.budget),
    status: revenuePace(toNumber(r.pace.percent), revT),
  }));

  // Seven objects, then "Other" — exactly the client's list.
  const objects = expenditure ? foldTail(expenditure, scope.period, 6) : null;
  const expenditureRows = (objects?.rows ?? []).map((r) => ({
    id: r.id,
    label: r.name,
    actual: toNumber(r.actualYtd) ?? 0,
    budgetToDate: toNumber(r.pace.budget) ?? 0,
    budgetFullYear: toNumber(r.budget) ?? 0,
    actualDisplay: compactMoney(r.actualYtd),
    budgetToDateDisplay: compactMoney(r.pace.budget),
    budgetFullYearDisplay: compactMoney(r.budget),
    status: expenditurePace(toNumber(r.pace.percent), expT),
  }));

  // ---------- §3.2b fund balance trend ----------
  // The client split this card in two: with the General Fund selected it shows the policy
  // target, the statutory minimum and a status; with any other fund — or All Funds — those
  // are HIDDEN, because a reserve percentage only means anything against the General Fund's
  // budget (see the note on `reserve` in lib/dashboard/load.ts).
  const isGeneralFund = Boolean(
    scope.fundId && core.generalFund && scope.fundId === core.generalFund.id,
  );
  const statutoryMinimum = Number(policy.fundBalance.boardPolicyMinimum);

  const endingFundBalance = point?.fundBalance ?? null;
  const openingFundBalance = series.opening?.total ?? null;
  const fbChange =
    endingFundBalance && previous?.fundBalance ? endingFundBalance.minus(previous.fundBalance) : null;
  const fbChangePct = changePercent(endingFundBalance, previous?.fundBalance);

  const fundBalanceMetrics = isGeneralFund
    ? [
        { label: "Ending fund balance", value: compactMoney(endingFundBalance) },
        {
          label: "Unassigned fund balance",
          value: compactMoney(point?.unassignedFundBalance),
          note: reservePct === null ? undefined : `${percent(reservePct)} of budget`,
        },
        {
          label: "Status",
          value: reserveRung === "N/A" ? "Not available" : reserveRung,
          note: reserveRung === "Strong" ? "At or above target" : "Below target",
          tone:
            reserveRung === "Strong"
              ? ("positive" as const)
              : reserveRung === "N/A"
                ? ("neutral" as const)
                : ("negative" as const),
        },
        { label: "Policy target", value: `${reserveT.target.toFixed(2)}%` },
        { label: "Statutory minimum", value: `${statutoryMinimum.toFixed(2)}%` },
      ]
    : [
        { label: "Ending fund balance", value: compactMoney(endingFundBalance) },
        { label: "Total fund balance", value: compactMoney(endingFundBalance) },
        {
          label: "Month over month change",
          value: accounting(fbChange, { compact: true }),
          note: fbChangePct === null ? undefined : `${signedPercent(fbChangePct)} vs prior period`,
          tone: fbChange?.isNegative() ? ("negative" as const) : ("positive" as const),
        },
        {
          label: "Opening balance",
          value: compactMoney(openingFundBalance),
          note: `Start of FY ${scope.fiscalYear}`,
        },
      ];

  const fundBalanceInsight = isGeneralFund
    ? reservePct === null
      ? null
      : `Unassigned fund balance is ${percent(reservePct)}, which is ${
          reservePct >= statutoryMinimum ? "above" : "below"
        } the ${statutoryMinimum.toFixed(2)}% statutory minimum and ${
          reservePct >= reserveT.target ? "at or above" : "below"
        } the district target of ${reserveT.target.toFixed(2)}%.`
    : trendNarrative({
        subject: `${scope.fund ? scope.fund.name : "All funds"} ending fund balance`,
        current: endingFundBalance,
        previous: previous?.fundBalance ?? null,
        periodLabel: scope.label,
        previousLabel: previous ? `period ${previous.period}` : "the prior period",
      });

  // ---------- §3.2c cash position ----------
  const flow = cashFlowYtd(series.points);
  const cashPctOfSpend = cashPercentOfExpenditures(
    point?.endingCash ?? null,
    point?.expenditureYtd ?? null,
  );
  const avgMonthlySpend = toNumber(series.adoptedExpenditureBudget)
    ? toNumber(series.adoptedExpenditureBudget)! / 12
    : null;
  const cashTrendPct = changePercent(point?.endingCash, previous?.endingCash);

  // ---------- §3.4 key insights ----------
  const insights = facts
    ? buildInsights({
        facts,
        policy,
        revenueMovers: revenue ? topMovers(revenue).positive.concat(topMovers(revenue).negative) : [],
        expenditureMovers: expenditure ? topMovers(expenditure).positive : [],
      })
    : [];

  const alertRows = (alerts?.alerts ?? []).map((a) => ({
    id: a.id,
    severity: a.severity,
    title: a.title,
    message: a.message,
  }));

  const options = scopeOptions(scope);
  const summaryHref = options.query
    ? `/dashboard?${options.query}&view=summary`
    : "/dashboard?view=summary";

  // ===================== the cards, declared once and placed twice =====================
  // The summary view is a re-arrangement of these, not a re-implementation.

  const kpis = (
    <KpiRow count={6}>
      <KpiTile
        icon="dollar"
        tone="green"
        label="Total revenues (YTD)"
        value={compactMoney(point?.revenueYtd)}
        sub={
          point && toNumber(point.revenueBudget)
            ? `${percent(((toNumber(point.revenueYtd) ?? 0) / (toNumber(point.revenueBudget) || 1)) * 100)} of full-year budget`
            : "No revenue budget uploaded"
        }
        delta={
          revVarPct === null
            ? undefined
            : {
                text: signedPercent(revVarPct),
                tone: deltaTone(revVarPct, "up"),
                direction: revVarPct < 0 ? "down" : revVarPct > 0 ? "up" : "flat",
                note: "vs budget to date",
              }
        }
        href="/revenues"
        hrefLabel="Detail"
      />

      <KpiTile
        icon="receipt"
        tone="blue"
        label="Total expenditures (YTD)"
        value={compactMoney(point?.expenditureYtd)}
        sub={
          point && toNumber(point.expenditureBudget)
            ? `${percent(((toNumber(point.expenditureYtd) ?? 0) / (toNumber(point.expenditureBudget) || 1)) * 100)} of full-year budget`
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
        icon="clock"
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
        icon="wallet"
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
        icon="warning"
        tone="red"
        label="Alerts"
        value={String(alerts?.alerts.length ?? 0)}
        sub="require attention"
        delta={
          alerts && alerts.criticalCount > 0
            ? { text: `${alerts.criticalCount} critical`, tone: "negative" }
            : alerts && alerts.warningCount > 0
              ? { text: `${alerts.warningCount} warning`, tone: "neutral" }
              : { text: "All clear", tone: "positive" }
        }
        href="/alerts"
        hrefLabel="View all"
      />
    </KpiRow>
  );

  const revenueCard = (
    <SectionCard
      title="Revenues vs budget (YTD)"
      subtitle="Five largest sources, against the budget expected by now"
      footer="Go to revenues"
      footerHref="/revenues"
      info={`Status is judged against your revenue variance policy: warning at ${revT.warning.toFixed(2)}%, critical at ${revT.critical.toFixed(2)}%.`}
    >
      <BudgetBars
        title="Revenues against budget"
        summary="Actual year-to-date revenue against the budget expected by now and the full-year budget, for the five largest sources."
        rows={revenueRows}
        format={(v) => compactMoney(v, 0)}
      />
    </SectionCard>
  );

  const expenditureCard = (
    <SectionCard
      title="Expenditures vs budget (YTD)"
      subtitle="By object, against the budget expected by now"
      footer="Go to expenditures"
      footerHref="/expenditures"
      info={`Status is judged against your expenditure variance policy: warning at ${expT.warning.toFixed(2)}%, critical at ${expT.critical.toFixed(2)}%.`}
    >
      <BudgetBars
        title="Expenditures against budget"
        summary="Actual year-to-date spending against the budget expected by now and the full-year budget, by object type."
        rows={expenditureRows}
        format={(v) => compactMoney(v, 0)}
      />
    </SectionCard>
  );

  const fundBalanceCard = (
    <SectionCard
      title="Fund balance trend"
      subtitle={scope.fund ? scope.fund.name : "All funds"}
      badge={
        isGeneralFund ? (
          <StatusBadge status={reserveRung} size="sm" className="uppercase" />
        ) : (
          <span className="rounded-full border border-line bg-panel px-2 py-[2px] text-[9.5px] font-medium normal-case tracking-normal text-muted-2">
            Policy targets apply to the General Fund only
          </span>
        )
      }
      footer="View full analysis"
      footerHref="/fund-balance"
      footerNote="All amounts are unaudited"
    >
      <LineChart
        title="Fund balance trend"
        summary={`Total and unassigned fund balance by month for fiscal year ${scope.fiscalYear}.`}
        categories={labels}
        format={(v) => compactMoney(v, 0)}
        height={280}
        series={[
          {
            key: "total",
            label: isGeneralFund ? "Ending fund balance" : "Total fund balance",
            color: "var(--color-viz-budget)",
            points: fundBalanceTrend,
            labelLast: true,
          },
          ...(isGeneralFund
            ? [
                {
                  key: "unassigned",
                  label: "Unassigned fund balance",
                  color: "var(--color-viz-actual)",
                  points: unassignedTrend,
                  labelLast: true,
                },
              ]
            : []),
        ]}
      />
      <div className="mt-4 flex flex-col gap-3">
        <MetricStrip items={fundBalanceMetrics} cols={isGeneralFund ? 5 : 4} />
        {fundBalanceInsight && (
          <KeyInsightBar tone={isGeneralFund && reserveRung !== "Strong" ? "monitor" : "info"}>
            {fundBalanceInsight}
          </KeyInsightBar>
        )}
      </div>
    </SectionCard>
  );

  const cashCard = (
    <SectionCard
      title="Cash position"
      subtitle={`As of ${scope.label} (FY ${scope.fiscalYear})`}
      footer="Go to cash"
      footerHref="/cash"
    >
      <MetricStrip
        cols={5}
        items={[
          { label: "Beginning cash", value: compactMoney(flow.beginningCash) },
          { label: "Receipts (YTD)", value: compactMoney(flow.receipts), tone: "positive" },
          {
            label: "Disbursements (YTD)",
            value: accounting(flow.disbursements?.negated(), { compact: true }),
            tone: "negative",
          },
          {
            label: "Net cash flow",
            value: accounting(flow.net, { compact: true }),
            tone: flow.net?.isNegative() ? "negative" : "positive",
          },
          { label: "Ending cash", value: compactMoney(point?.endingCash) },
        ]}
      />

      <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)] sm:items-center">
        <div className="flex flex-col items-center">
          <Gauge
            value={daysCash}
            bands={statusBands(cashT)}
            rung={cashRung}
            unit="days of cash in reserve"
            size={170}
            title="Days cash on hand"
            summary={
              daysCash === null
                ? "Days cash on hand cannot be computed for this period."
                : `${fmtDays(daysCash)} days of cash on hand, against a policy minimum of ${cashT.warning}.`
            }
          />
          <StatusBadge status={cashRung} size="sm" className="mt-1" />
        </div>

        <MetricStrip
          items={[
            { label: "Cash balance", value: compactMoney(point?.endingCash) },
            { label: "Avg monthly spend", value: compactMoney(avgMonthlySpend) },
            {
              label: "Cash % of expenditures",
              value: percent(cashPctOfSpend, 1),
              note: cashPctOfSpend === null ? "Needs spending detail" : undefined,
            },
            {
              label: "Trend",
              value: cashTrendPct === null ? NOT_AVAILABLE : signedPercent(cashTrendPct),
              note: cashTrendPct === null ? "Needs an earlier period" : "vs prior period",
              tone: cashTrendPct === null ? "neutral" : cashTrendPct < 0 ? "negative" : "positive",
            },
          ]}
        />
      </div>
    </SectionCard>
  );

  const healthCard = (
    <SectionCard
      title="Financial health summary"
      subtitle="Key indicators compared to policy targets"
      footer="View full financial health"
      footerHref="/policies"
    >
      <DataTable
        spacious
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
            indicator: { value: h.indicator, strong: true },
            current: h.current,
            target: h.target,
            status: (
              <span className="flex justify-end">
                <StatusBadge status={h.rung} size="lg" dot={false} />
              </span>
            ),
            trend: (
              <span className="flex justify-end">
                <Sparkline values={h.trend} label={`${h.indicator} trend`} />
              </span>
            ),
          },
        }))}
      />
    </SectionCard>
  );

  const insightsCard = (
    <SectionCard title="Key insights" footer="View all insights" footerHref="/alerts">
      {insights.length > 0 ? (
        <InsightList insights={insights} layout="column" />
      ) : (
        <p className="py-6 text-center text-[12.5px] text-muted-2">
          Nothing stands out this period. Insights appear once there is enough committed data
          to compare against your policies.
        </p>
      )}
    </SectionCard>
  );

  const alertsCard = (
    <SectionCard
      title={`Alert summary (${alerts?.alerts.length ?? 0})`}
      footer="View all alerts"
      footerHref="/alerts"
    >
      <AlertSummary
        alerts={alertRows}
        critical={alerts?.criticalCount ?? 0}
        warning={alerts?.warningCount ?? 0}
        informational={alerts?.informationalCount ?? 0}
        href="/alerts"
      />
    </SectionCard>
  );

  // ===================== the one-page landscape summary =====================
  if (summary) {
    return (
      <div data-summary className="animate-fade-up space-y-3">
        {/* Scoped to this view only, so the multi-page detailed print stays portrait. */}
        <style>{`@media print { @page { size: A4 landscape; margin: 8mm; } }`}</style>
        <SummaryPrint />

        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
          <div>
            <h1 className="text-[19px] font-semibold tracking-[-0.3px] text-ink">
              {user.districtName ?? "District"} — Executive Summary
            </h1>
            <p className="mt-0.5 text-[12px] text-muted">
              {scope.label} · FY {scope.fiscalYear} ·{" "}
              {scope.fund ? scope.fund.name : "All funds"} · all amounts unaudited
            </p>
          </div>
          <a
            href={options.query ? `/dashboard?${options.query}` : "/dashboard"}
            className="rounded-lg border border-line bg-white px-3 py-1.5 text-[12.5px] font-medium text-ink-soft print:hidden"
          >
            ← Back to dashboard
          </a>
        </div>

        {kpis}

        <div className="grid gap-3 lg:grid-cols-3">
          {revenueCard}
          {expenditureCard}
          {fundBalanceCard}
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          {healthCard}
          {insightsCard}
        </div>
      </div>
    );
  }

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
            summaryHref={summaryHref}
          />
        }
      />

      {scope.substituted && (
        <SubstitutionNotice asked={scope.substituted.asked} showing={scope.substituted.showing} />
      )}
      <DataAsOf date={scope.dataAsOf} note={scope.fund ? scope.fund.name : "All funds"} />

      {/* ---------- §3.1 KPI row ---------- */}
      {kpis}

      {/* ---------- §3.2/3.3 the budget comparisons ---------- */}
      <Row cols="2">
        {revenueCard}
        {expenditureCard}
      </Row>

      <Row cols="2-1">
        {fundBalanceCard}
        {alertsCard}
      </Row>

      <Row cols="2-1">
        {cashCard}
        {insightsCard}
      </Row>

      {healthCard}

      {!point && (
        <FooterInfoBar>
          This period has no committed detail data. The figures above are drawn from the periods
          that do, and the cards that need this period show as unavailable.
        </FooterInfoBar>
      )}
    </div>
  );
}
