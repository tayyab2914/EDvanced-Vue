import { redirect } from "next/navigation";
import Link from "next/link";
import { getTenantDb, userCan } from "@/lib/auth/dal";
import { resolveScope } from "@/lib/dashboard/scope";
import { loadCore, reserveThresholds, periodAxisLabels } from "@/lib/dashboard/load";
import { byFund } from "@/lib/finance/breakdown";
import { activityTotals, transferIds } from "@/lib/finance/engine";
import { ladder, bands as statusBands } from "@/lib/dashboard/status";
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
import { SectionCard, FooterInfoBar } from "@/components/dashboard/section-card";
import { KpiTile, KpiRow } from "@/components/dashboard/kpi-tile";
import { DataTable } from "@/components/dashboard/data-table";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { EmptyState, Row } from "@/components/dashboard/shared";
import { LineChart } from "@/components/dashboard/charts/line-chart";
import { DonutChart } from "@/components/dashboard/charts/donut-chart";
import { WaterfallChart, waterfallFoots } from "@/components/dashboard/charts/waterfall-chart";
import { BenchmarkBand } from "@/components/dashboard/charts/benchmark-band";
import { FundBalanceShell } from "./shell";
import { COMPONENT_COLORS } from "@/lib/dashboard/palette";
import { PageHeader } from "@/components/page-header";

/** Fund Balance — Current Position (Spec §6.1). */
export default async function FundBalancePage({
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
        <PageHeader title="Fund Balance" description="Track fund balance, reserve levels, and plan for the future." />
        <EmptyState title="No fund balance yet" action="Upload data" href="/data/upload">
          Fund balance is derived from your opening balance plus the year&apos;s revenue and
          spending. Upload an opening fund balance and a monthly detail file to see it.
        </EmptyState>
      </div>
    );
  }

  const core = await loadCore(db, districtId, scope);
  const { series, point, previous, policy, alerts, codes, reserve } = core;
  const facts = alerts?.facts ?? null;
  const fbAlerts = (alerts?.alerts ?? []).filter((a) => a.group === "fundBalance");

  const reserveT = reserveThresholds(policy);
  const reservePct = toNumber(reserve?.percent);
  const reserveRung = ladder(reservePct, reserveT);

  const totalNow = point?.fundBalance ?? null;
  const totalPrev = previous?.fundBalance ?? null;
  const change = totalNow && totalPrev ? totalNow.minus(totalPrev) : null;
  const unassignedNow = point?.unassignedFundBalance ?? null;

  const labels = periodAxisLabels(scope, series.points.length);

  // The waterfall's movements, taken from the engine rather than assembled by hand.
  const totals = await activityTotals(
    db,
    { fiscalYear: scope.fiscalYear, period: scope.period, fundId: scope.fundId },
    codes,
  );
  const opening = toNumber(series.opening?.total) ?? 0;
  const steps = [
    { label: "Beginning", value: opening, anchor: true, display: compactMoney(series.opening?.total) },
    {
      label: "Operating revenue",
      value: toNumber(totals.operatingRevenueYtd) ?? 0,
      display: compactMoney(totals.operatingRevenueYtd),
    },
    { label: "Transfers in", value: toNumber(totals.transfersInYtd) ?? 0, display: compactMoney(totals.transfersInYtd) },
    {
      label: "Other financing",
      value: toNumber(totals.otherFinancingYtd) ?? 0,
      display: compactMoney(totals.otherFinancingYtd),
    },
    {
      label: "Operating spend",
      value: -(toNumber(totals.operatingExpenditureYtd) ?? 0),
      display: accounting(totals.operatingExpenditureYtd.negated(), { compact: true }),
    },
    {
      label: "Transfers out",
      value: -(toNumber(totals.transfersOutYtd) ?? 0),
      display: accounting(totals.transfersOutYtd.negated(), { compact: true }),
    },
    { label: "Ending", value: toNumber(totalNow) ?? 0, anchor: true, display: compactMoney(totalNow) },
  ];
  // Seven components, not the reference's six — other financing sources are a real
  // movement and dropping them would stop the last bar equalling the running total.
  const foots = waterfallFoots(steps, toNumber(totalNow) ?? 0);

  const fundRows = await byFund(db, {
    revenueVersionId: core.versions.get("REVENUE_DETAIL"),
    expenditureVersionId: core.versions.get("EXPENDITURE_DETAIL"),
    cashVersionId: core.versions.get("CASH_POSITION"),
    openingVersionId: core.versions.get("OPENING_FUND_BALANCE"),
  });

  const o = series.opening;
  const components = o
    ? [
        { label: "Nonspendable", value: toNumber(o.nonspendable) ?? 0, amount: o.nonspendable },
        { label: "Restricted", value: toNumber(o.restricted) ?? 0, amount: o.restricted },
        { label: "Committed", value: toNumber(o.committed) ?? 0, amount: o.committed },
        { label: "Assigned", value: toNumber(o.assigned) ?? 0, amount: o.assigned },
        { label: "Unassigned", value: toNumber(unassignedNow) ?? 0, amount: unassignedNow },
      ].filter((c) => c.value > 0)
    : [];

  return (
    <FundBalanceShell scope={scope} active="/fund-balance" alertCount={fbAlerts.length}>
      <KpiRow count={5}>
        <KpiTile
          icon="database"
          tone="blue"
          label="Total fund balance"
          value={compactMoney(totalNow)}
          sub={previous ? `vs period ${previous.period}` : "no earlier period"}
          delta={
            change === null
              ? undefined
              : {
                  text: accounting(change, { compact: true }),
                  tone: deltaTone(toNumber(change), "up"),
                }
          }
          unavailableReason="Needs an opening fund balance for the year."
        />
        <KpiTile
          icon="chart"
          tone="teal"
          label="Change from prior month"
          value={accounting(change, { compact: true })}
          sub={previous ? `since period ${previous.period}` : "no earlier period with data"}
          delta={
            change === null
              ? undefined
              : {
                  text: signedPercent(changePercent(totalNow, totalPrev)),
                  tone: deltaTone(toNumber(change), "up"),
                }
          }
        />
        <KpiTile
          icon="shield"
          tone="purple"
          label="Unassigned fund balance"
          value={compactMoney(unassignedNow)}
          sub={scope.generalFund ? `${scope.generalFund.name} basis` : "general fund only"}
        />
        <KpiTile
          icon="activity"
          tone="amber"
          label="Unassigned fund balance %"
          value={percent(reserve?.percent)}
          sub="of budgeted expenditures"
          status={reserveRung}
          statusNote={`Target ≥ ${reserveT.target.toFixed(2)}%`}
        />
        <KpiTile
          icon="reports"
          tone={reserveRung === "Action Required" ? "red" : reserveRung === "Monitor" ? "amber" : "green"}
          label="Reserve status"
          value={reserveRung}
          sub={`Warning below ${reserveT.warning}% · critical below ${reserveT.critical}%`}
          status={reserveRung}
        />
      </KpiRow>

      <Row cols="2-1">
        <SectionCard title="Fund balance trend" subtitle={scope.fund ? scope.fund.name : "All funds"}>
          <LineChart
            title="Fund balance trend"
            summary={`Total and unassigned fund balance by month for fiscal year ${scope.fiscalYear}.`}
            categories={labels}
            format={(v) => compactMoney(v, 0)}
            height={250}
            series={[
              {
                key: "total",
                label: "Total fund balance",
                color: "var(--color-viz-budget)",
                labelLast: true,
                points: series.points.map((p) => ({ value: toNumber(p.fundBalance), label: compactMoney(p.fundBalance) })),
              },
              {
                key: "unassigned",
                label: "Unassigned",
                color: "var(--color-viz-actual)",
                labelLast: true,
                points: series.points.map((p) => ({
                  value: toNumber(p.unassignedFundBalance),
                  label: compactMoney(p.unassignedFundBalance),
                })),
              },
            ]}
          />
        </SectionCard>

        <SectionCard
          title="Reserve against policy"
          info="The bands are your own thresholds, so this strip and the badge above it cannot disagree."
        >
          <BenchmarkBand
            value={reservePct}
            bands={statusBands(reserveT)}
            format={(v) => `${v.toFixed(v % 1 === 0 ? 0 : 2)}%`}
            label={`Policy target: maintain unassigned fund balance at ${reserveT.target.toFixed(2)}% of budgeted general fund expenditures.`}
          />
        </SectionCard>
      </Row>

      <Row cols="2-1">
        <SectionCard
          title="Fund balance waterfall"
          subtitle={foots ? undefined : "Components do not reconcile to the ending balance"}
          info="Beginning balance, this year's movements, and where the balance now stands."
        >
          <WaterfallChart
            title="Fund balance waterfall"
            summary={`How the fund balance moved from ${compactMoney(series.opening?.total)} at the start of the year to ${compactMoney(totalNow)}.`}
            steps={steps}
            format={(v) => compactMoney(v, 0)}
            height={260}
          />
          {!foots && (
            <p className="mt-2 text-[11.5px] text-monitor">
              The movements shown do not add up to the ending balance. This usually means a
              period is missing from the year.
            </p>
          )}
        </SectionCard>

        <SectionCard title="Fund balance composition" info="Components are as reported on the opening fund balance; unassigned moves with the year's activity.">
          {components.length > 0 ? (
            <DonutChart
              title="Fund balance composition"
              summary="How the fund balance splits between its designated components and the unassigned reserve."
              centerValue={compactMoney(totalNow)}
              centerLabel="Total fund balance"
              slices={components.map((c) => ({
                label: c.label,
                value: c.value,
                color: COMPONENT_COLORS[c.label],
                display: compactMoney(c.amount),
              }))}
            />
          ) : (
            <p className="py-8 text-center text-[12.5px] text-muted-2">
              No opening fund balance has been committed for this year.
            </p>
          )}
        </SectionCard>
      </Row>

      <SectionCard
        title="Fund balance by fund"
        info="Unassigned fund balance and its percentage apply to the General Fund only."
      >
        <DataTable
          columns={[
            { key: "fund", label: "Fund" },
            { key: "type", label: "Classification" },
            { key: "revenue", label: "Revenue (YTD)", align: "right" },
            { key: "spend", label: "Spending (YTD)", align: "right" },
            { key: "balance", label: "Fund balance", align: "right" },
            { key: "action", label: "", align: "right" },
          ]}
          rows={fundRows.map((f) => ({
            id: f.fundId,
            cells: {
              fund: `${f.code} — ${f.name}`,
              type: f.typeName ?? "—",
              revenue: money(f.revenueYtd),
              spend: money(f.expenditureYtd),
              balance: money(f.fundBalance),
              action: userCan(user, "configure_district") ? (
                <Link
                  href={`/fund-balance/override?fy=${scope.fiscalYear}&period=${scope.period}&fund=${f.fundId}`}
                  className="text-[11.5px] font-medium text-brand hover:underline"
                >
                  Correct
                </Link>
              ) : null,
            },
          }))}
          total={{
            id: "total",
            total: true,
            cells: {
              fund: "Total all funds",
              type: "",
              revenue: money(point?.revenueYtd),
              spend: money(point?.expenditureYtd),
              balance: money(totalNow),
              action: null,
            },
          }}
          empty="No fund has committed data for this period."
        />
      </SectionCard>

      <FooterInfoBar action="Go to forecast and planning" href={`/fund-balance/forecast?fy=${scope.fiscalYear}&period=${scope.period}`}>
        Want to see the future? Build a three-year projection from your own growth assumptions
        and see how reserves hold up.
      </FooterInfoBar>
    </FundBalanceShell>
  );
}
