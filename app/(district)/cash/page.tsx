import { redirect } from "next/navigation";
import { getTenantDb, userCan } from "@/lib/auth/dal";
import { resolveScope } from "@/lib/dashboard/scope";
import { loadCore, daysCashThresholds, periodAxisLabels } from "@/lib/dashboard/load";
import { byFund } from "@/lib/finance/breakdown";
import { cashSummary, cashComposition, cashStats, thirtyDayForecast, daysCashOnHand, negativeCashFlowRun } from "@/lib/finance/cash";
import { ladder, bands as statusBands } from "@/lib/dashboard/status";
import {
  compactMoney,
  money,
  accounting,
  percent,
  signedPercent,
  days as fmtDays,
  toNumber,
  deltaTone,
  changePercent,
  sharePercent,
  NOT_AVAILABLE,
} from "@/lib/dashboard/format";
import { PageHeader } from "@/components/page-header";
import { KpiTile, KpiRow } from "@/components/dashboard/kpi-tile";
import { SectionCard, DataAsOf, FooterInfoBar, StatStrip } from "@/components/dashboard/section-card";
import { DataTable } from "@/components/dashboard/data-table";
import { AlertList } from "@/components/dashboard/alert-list";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { EmptyState, SubstitutionNotice, Row, PolicyEchoCard } from "@/components/dashboard/shared";
import { ScopeBar } from "@/components/dashboard/scope-bar";
import { LineChart } from "@/components/dashboard/charts/line-chart";
import { DonutChart } from "@/components/dashboard/charts/donut-chart";
import { scopeOptions } from "@/lib/dashboard/options";
import { CASH_COLORS } from "@/lib/dashboard/palette";

/** The Cash Position dashboard (Spec §7) — availability, liquidity and flow. */
export default async function CashDashboard({
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
        <PageHeader title="Cash Position" description="Monitor cash availability, liquidity and cash flow." />
        <EmptyState title="No cash data yet" action="Upload cash position" href="/data/upload">
          Upload a cash position file and this dashboard will show balances by fund, days of
          cash on hand and month-to-month flow.
        </EmptyState>
      </div>
    );
  }

  const core = await loadCore(db, districtId, scope);
  const { series, point, previous, policy, alerts } = core;
  const options = scopeOptions(scope);

  const cashT = daysCashThresholds(policy);
  const summary = cashSummary(point, previous, series.adoptedExpenditureBudget);
  const composition = cashComposition(point);
  const stats = cashStats(series.points);
  const forecast = thirtyDayForecast(series.points);
  const run = negativeCashFlowRun(series.points);

  const daysCash = toNumber(summary.daysCashOnHand);
  const cashRung = ladder(daysCash, cashT);
  const momPct = changePercent(summary.endingCash, summary.previousEndingCash);
  const labels = periodAxisLabels(scope, series.points.length);

  // Per-fund cash, with an estimated days-cash apiece.
  const fundRows = core.versions.get("CASH_POSITION")
    ? await byFund(db, {
        cashVersionId: core.versions.get("CASH_POSITION"),
        expenditureVersionId: core.versions.get("EXPENDITURE_DETAIL"),
      })
    : [];
  const totalCash = toNumber(point?.endingCash);

  const trend = series.points.map((p) => ({
    value: toNumber(p.endingCash),
    label: compactMoney(p.endingCash),
  }));
  // The forecast is a single point beyond the last actual, drawn dashed so it never reads
  // as reported data.
  const forecastSeries = forecast
    ? [...series.points.map(() => ({ value: null as number | null })), { value: toNumber(forecast.value) }]
    : [];
  const forecastLabels = forecast ? [...labels, "+30d"] : labels;

  return (
    <div className="animate-fade-up space-y-[18px]">
      <PageHeader
        title="Cash Position"
        description="Monitor cash availability, liquidity and cash flow."
        actions={
          <ScopeBar
            periods={options.periods}
            period={options.period}
            funds={options.funds}
            fund={scope.fundId ?? ""}
            exportHref={options.exportHref("/cash/export")}
          />
        }
      />
      {scope.substituted && <SubstitutionNotice asked={scope.substituted.asked} showing={scope.substituted.showing} />}
      <DataAsOf date={scope.dataAsOf} note={scope.fund ? scope.fund.name : "All funds"} />

      <KpiRow count={6}>
        <KpiTile
          icon="database"
          tone="green"
          label="Cash balance"
          value={compactMoney(summary.endingCash)}
          sub={previous ? `vs period ${previous.period}` : "no earlier period"}
          delta={momPct === null ? undefined : { text: signedPercent(momPct), tone: deltaTone(momPct, "up") }}
          unavailableReason="No cash position file was committed for this period."
        />
        <KpiTile
          icon="activity"
          tone="amber"
          label="Days cash on hand"
          value={daysCash === null ? NOT_AVAILABLE : fmtDays(daysCash)}
          sub="days of operating cost covered"
          status={cashRung}
          statusNote={`Policy ≥ ${cashT.warning} days`}
          unavailableReason="Needs a cash file and an adopted expenditure budget."
        />
        <KpiTile
          icon="chart"
          tone="blue"
          label="Net cash flow (MTD)"
          value={accounting(summary.netCashFlowMtd, { compact: true })}
          sub={
            summary.receiptsMtd !== null
              ? `Receipts ${compactMoney(summary.receiptsMtd)} · Paid ${compactMoney(summary.disbursementsMtd)}`
              : undefined
          }
          delta={
            summary.netCashFlowMtd === null
              ? undefined
              : {
                  text: summary.netCashFlowMtd.isNegative() ? "Outflow" : "Inflow",
                  tone: deltaTone(toNumber(summary.netCashFlowMtd), "up"),
                }
          }
        />
        <KpiTile icon="upload" tone="teal" label="Cash receipts (MTD)" value={compactMoney(summary.receiptsMtd)} sub="collected this month" />
        <KpiTile icon="reports" tone="purple" label="Cash disbursements (MTD)" value={compactMoney(summary.disbursementsMtd)} sub="paid out this month" />
        <KpiTile
          icon="shield"
          tone={cashRung === "Action Required" ? "red" : cashRung === "Monitor" ? "amber" : "green"}
          label="Cash status"
          value={cashRung}
          sub={`Policy ≥ ${cashT.warning} days`}
          status={cashRung}
        />
      </KpiRow>

      <Row cols="2-1">
        <SectionCard title="Cash balance trend" subtitle={scope.fund ? scope.fund.name : "All funds"}>
          <LineChart
            title="Cash balance trend"
            summary={`Ending cash balance by month for fiscal year ${scope.fiscalYear}${forecast ? ", with a straight-line 30-day projection" : ""}.`}
            categories={forecastLabels}
            format={(v) => compactMoney(v, 0)}
            height={250}
            series={[
              {
                key: "cash",
                label: "Ending cash balance",
                color: "var(--color-viz-actual)",
                labelLast: true,
                points: forecast ? [...trend, { value: null }] : trend,
              },
              ...(forecast
                ? [
                    {
                      key: "forecast",
                      label: "30-day projection",
                      color: "var(--color-viz-forecast)",
                      dashed: true,
                      points: forecastSeries,
                    },
                  ]
                : []),
            ]}
          />
          <div className="mt-4">
            <StatStrip
              items={[
                {
                  label: "Period high",
                  value: compactMoney(stats.high?.value),
                  note: stats.high ? labels[stats.high.period - 1] : undefined,
                },
                {
                  label: "Period low",
                  value: compactMoney(stats.low?.value),
                  note: stats.low ? labels[stats.low.period - 1] : undefined,
                },
                { label: "Average balance", value: compactMoney(stats.average) },
                {
                  label: "Volatility",
                  value: stats.volatility ?? NOT_AVAILABLE,
                  note: stats.volatility ? `over ${stats.observations} months` : "needs 3 months",
                },
              ]}
            />
          </div>
        </SectionCard>

        <div className="grid gap-4">
          <SectionCard title="Cash policy" subtitle="Your own thresholds">
            <PolicyEchoCard
              rows={[
                { label: "Days cash — warning", value: `${Number(policy.cash.daysCashWarning)} days` },
                { label: "Days cash — critical", value: `${Number(policy.cash.daysCashCritical)} days` },
                { label: "Cash decrease — warning", value: `${Number(policy.cash.decreaseWarning).toFixed(2)}%` },
                { label: "Cash decrease — critical", value: `${Number(policy.cash.decreaseCritical).toFixed(2)}%` },
              ]}
              manageHref={userCan(user, "configure_district") ? "/policies" : undefined}
              manageLabel="Manage cash policies"
            />
          </SectionCard>

          <SectionCard title="Monthly cash summary">
            <DataTable
              dense
              columns={[
                { key: "metric", label: "Metric" },
                { key: "value", label: scope.label, align: "right" },
              ]}
              rows={[
                { id: "beg", cells: { metric: "Beginning cash balance", value: money(summary.beginningCash) } },
                { id: "rec", cells: { metric: "Cash receipts (MTD)", value: money(summary.receiptsMtd) } },
                {
                  id: "dis",
                  cells: {
                    metric: "Cash disbursements (MTD)",
                    value: { value: accounting(summary.disbursementsMtd?.negated()), tone: "negative" as const },
                  },
                },
                {
                  id: "net",
                  cells: {
                    metric: "Net cash flow (MTD)",
                    value: {
                      value: accounting(summary.netCashFlowMtd),
                      tone: summary.netCashFlowMtd?.isNegative() ? ("negative" as const) : ("positive" as const),
                    },
                  },
                },
              ]}
              total={{
                id: "end",
                total: true,
                cells: { metric: "Ending cash balance", value: money(summary.endingCash) },
              }}
            />
          </SectionCard>
        </div>
      </Row>

      <Row cols="2-1">
        <SectionCard
          title="Cash balance by fund"
          footer="Browse cash position"
          footerHref={`/data/cash-position?fy=${scope.fiscalYear}&period=${scope.period}`}
        >
          <DataTable
            columns={[
              { key: "fund", label: "Fund" },
              { key: "cash", label: "Cash balance", align: "right" },
              { key: "share", label: "% of total", align: "right" },
              { key: "days", label: "Days cash (est.)", align: "right" },
              { key: "status", label: "Status", align: "right" },
            ]}
            rows={fundRows
              .filter((f) => f.endingCash !== null)
              .map((f) => {
                // Days-cash PER FUND is estimated from that fund's own spending pace
                // annualised, not from the district-wide adopted budget: dividing a small
                // fund's balance by the whole district's spend would report decades of
                // cover. Marked "(est.)" in the column head because it is a different
                // calculation from the headline figure, which uses the adopted budget.
                const spentYtd = toNumber(f.expenditureYtd);
                const cash = toNumber(f.endingCash);
                const annualised = spentYtd ? (spentYtd / scope.period) * 12 : null;
                const est = annualised && cash !== null ? cash / (annualised / 365) : null;
                const rung = ladder(est, cashT);
                return {
                  id: f.fundId,
                  cells: {
                    fund: `${f.code} — ${f.name}`,
                    cash: money(f.endingCash),
                    share: percent(sharePercent(f.endingCash, totalCash), 1),
                    days: est === null ? NOT_AVAILABLE : fmtDays(est),
                    status: <StatusBadge status={est === null ? "N/A" : rung} size="sm" dot={false} />,
                  },
                };
              })}
            total={{
              id: "total",
              total: true,
              cells: {
                fund: "Total all funds",
                cash: money(point?.endingCash),
                share: "100.0%",
                days: daysCash === null ? NOT_AVAILABLE : fmtDays(daysCash),
                status: <StatusBadge status={cashRung} size="sm" dot={false} />,
              },
            }}
            empty="No cash position was committed for this period."
          />
        </SectionCard>

        <SectionCard title="Cash composition" info="Where the balance is held, as reported on the cash file.">
          {composition ? (
            <DonutChart
              title="Cash composition"
              summary="How the ending cash balance is split between operating, investment and restricted accounts."
              centerValue={compactMoney(composition.total)}
              centerLabel="Total cash"
              slices={[
                { label: "Operating", value: toNumber(composition.operating) ?? 0, color: CASH_COLORS.Operating, display: compactMoney(composition.operating) },
                { label: "Investment", value: toNumber(composition.investment) ?? 0, color: CASH_COLORS.Investment, display: compactMoney(composition.investment) },
                { label: "Restricted", value: toNumber(composition.restricted) ?? 0, color: CASH_COLORS.Restricted, display: compactMoney(composition.restricted) },
                { label: "Other", value: toNumber(composition.other) ?? 0, color: CASH_COLORS.Other, display: compactMoney(composition.other) },
              ]}
            />
          ) : (
            <p className="py-8 text-center text-[12.5px] text-muted-2">
              This period&apos;s cash file did not break the balance down by account type.
            </p>
          )}
        </SectionCard>
      </Row>

      <SectionCard title={`Cash alerts (${alerts?.alerts.filter((a) => a.group === "cash").length ?? 0})`} footer="View all alerts" footerHref="/alerts">
        <AlertList
          alerts={[
            ...(alerts?.alerts ?? [])
              .filter((a) => a.group === "cash")
              .map((a) => ({ id: a.id, severity: a.severity as "WARNING" | "CRITICAL", title: a.title, message: a.message })),
            ...(run && run.negative > 1
              ? [
                  {
                    id: "NEGATIVE_RUN",
                    severity: "INFORMATIONAL" as const,
                    title: "Cash flow trend",
                    message: `Net cash flow has been negative in ${run.negative} of the last ${run.of} months with data.`,
                  },
                ]
              : []),
          ]}
          empty="No cash thresholds have been crossed this period."
        />
      </SectionCard>

      <FooterInfoBar>
        Cash balances are unaudited and reflect the file committed for {scope.label}. The 30-day
        projection is straight-lined from recent months and no alert reads it.
      </FooterInfoBar>
    </div>
  );
}
