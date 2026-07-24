import { redirect } from "next/navigation";
import Link from "next/link";
import { getTenantDb, userCan } from "@/lib/auth/dal";
import { resolveScope } from "@/lib/dashboard/scope";
import { loadCore, reserveThresholds, periodAxisLabels } from "@/lib/dashboard/load";
import { byFund, primaryClassification } from "@/lib/finance/breakdown";
import { activityTotals } from "@/lib/finance/engine";
import { ladder, bands as statusBands } from "@/lib/dashboard/status";
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
import { SectionCard, FooterInfoBar } from "@/components/dashboard/section-card";
import { KpiTile, KpiRow } from "@/components/dashboard/kpi-tile";
import { DataTable } from "@/components/dashboard/data-table";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { EmptyState, Row, KeyInsightBar } from "@/components/dashboard/shared";
import { LineChart } from "@/components/dashboard/charts/line-chart";
import { ShareBars, MetricStrip } from "@/components/dashboard/charts/budget-bars";
import { WaterfallChart, waterfallFoots } from "@/components/dashboard/charts/waterfall-chart";
import { BenchmarkBand } from "@/components/dashboard/charts/benchmark-band";
import { FundBalanceShell } from "./shell";
import { COMPONENT_COLORS } from "@/lib/dashboard/palette";
import { PageHeader } from "@/components/page-header";

/**
 * Fund Balance — Current Position (Spec §6.1), rebuilt to the client's M4 layout.
 *
 * Two substantive changes behind the rearrangement:
 *
 *   The by-fund table now shows the ENDING FUND BALANCE and nothing else per fund. The
 *   client's reasoning: "from an executive/CFO perspective, the primary focus is the ending
 *   fund balance for each fund and status." Revenue and spending YTD per fund were columns
 *   answering a question this page does not ask — they live on the Revenue and Expenditures
 *   dashboards, which is where someone comparing them would be.
 *
 *   "Reserve against policy" is now "Fund balance %", and the strip beneath it prints each
 *   band's name and range rather than cramming the name inside the band.
 */
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
  const fbAlerts = (alerts?.alerts ?? []).filter((a) => a.group === "fundBalance");

  const reserveT = reserveThresholds(policy);
  const reservePct = toNumber(reserve?.percent);
  const reserveRung = ladder(reservePct, reserveT);
  const statutoryMinimum = Number(policy.fundBalance.boardPolicyMinimum);

  const totalNow = point?.fundBalance ?? null;
  const totalPrev = previous?.fundBalance ?? null;
  const change = totalNow && totalPrev ? totalNow.minus(totalPrev) : null;
  const changePct = changePercent(totalNow, totalPrev);
  const unassignedNow = point?.unassignedFundBalance ?? null;
  const unassignedPrev = previous?.unassignedFundBalance ?? null;
  const unassignedChange =
    unassignedNow && unassignedPrev ? unassignedNow.minus(unassignedPrev) : null;

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
  const withBalance = fundRows.filter((f) => f.fundBalance !== null);
  const allFundsTotal = withBalance.reduce(
    (a, f) => (f.fundBalance ? a + (toNumber(f.fundBalance) ?? 0) : a),
    0,
  );

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
  const componentTotal = components.reduce((a, c) => a + c.value, 0);

  return (
    <FundBalanceShell scope={scope} active="/fund-balance" alertCount={fbAlerts.length}>
      {/* ---------- KPI CARDS ---------- */}
      <KpiRow count={5}>
        <KpiTile
          icon="dollar"
          tone="green"
          label="Total fund balance"
          caption={scope.fund ? scope.fund.name : "All funds"}
          value={compactMoney(totalNow)}
          sub={previous ? `vs period ${previous.period}` : "no earlier period"}
          delta={
            change === null
              ? undefined
              : {
                  text: `${accounting(change, { compact: true })}${changePct === null ? "" : ` (${signedPercent(changePct)})`}`,
                  tone: deltaTone(toNumber(change), "up"),
                  direction: change.isNegative() ? "down" : "up",
                }
          }
          unavailableReason="Needs an opening fund balance for the year."
        />

        <KpiTile
          icon="trend-up"
          tone="teal"
          label="Change from prior month"
          caption={previous ? `Since period ${previous.period}` : "No earlier period"}
          value={accounting(change, { compact: true })}
          sub="movement in total fund balance"
          delta={
            change === null
              ? undefined
              : {
                  text: signedPercent(changePct),
                  tone: deltaTone(toNumber(change), "up"),
                  direction: change.isNegative() ? "down" : "up",
                }
          }
        />

        <KpiTile
          icon="shield"
          tone="blue"
          label="Unassigned fund balance"
          caption={core.generalFund ? `${core.generalFund.name} only` : "General fund only"}
          value={compactMoney(unassignedNow)}
          sub="the reserve a board asks about"
          delta={
            unassignedChange === null
              ? undefined
              : {
                  text: accounting(unassignedChange, { compact: true }),
                  tone: deltaTone(toNumber(unassignedChange), "up"),
                  direction: unassignedChange.isNegative() ? "down" : "up",
                  note: previous ? `vs period ${previous.period}` : undefined,
                }
          }
        />

        <KpiTile
          icon="pie"
          tone="purple"
          label="Unassigned fund balance %"
          caption={core.generalFund ? `${core.generalFund.name} only` : "General fund only"}
          value={percent(reserve?.percent)}
          sub="of budgeted general fund expenditures"
          status={reserveRung}
          statusNote={`Target ≥ ${reserveT.target.toFixed(2)}%`}
          unavailableReason="Needs a fund typed General, an opening fund balance and an adopted expenditure budget."
        />

        <KpiTile
          icon="scale"
          tone={reserveRung === "Action Required" ? "red" : reserveRung === "Monitor" ? "amber" : "green"}
          label="Reserve status"
          caption={core.generalFund ? `${core.generalFund.name} only` : "General fund only"}
          value={reserveRung === "N/A" ? "Not available" : reserveRung}
          valueStatus={reserveRung}
          sub={`Policy range: ${statutoryMinimum.toFixed(2)}% – ${reserveT.target.toFixed(2)}%`}
          statusNote={`Warning below ${reserveT.warning.toFixed(2)}%`}
        />
      </KpiRow>

      {/* ---------- ROW 2: by fund · trend ---------- */}
      <Row cols="1-2">
        <SectionCard
          title="Fund balance by fund"
          info="Unassigned fund balance and its percentage apply to the General Fund only. Other funds are shown with their primary fund balance classification."
          footerNote="All amounts are unaudited"
        >
          <DataTable
            columns={[
              { key: "fund", label: "Fund" },
              { key: "balance", label: "Ending fund balance", align: "right" },
              { key: "class", label: "Primary classification" },
              { key: "status", label: "Status", align: "right" },
            ]}
            rows={withBalance.map((f) => {
              const isGeneral = core.generalFund?.id === f.fundId;
              const balance = toNumber(f.fundBalance);
              const rung = isGeneral
                ? reserveRung
                : balance === null
                  ? "N/A"
                  : balance < 0
                    ? "Action Required"
                    : "Strong";
              const label = isGeneral
                ? reserveRung === "Strong"
                  ? "Healthy"
                  : reserveRung === "N/A"
                    ? undefined
                    : reserveRung
                : balance !== null && balance < 0
                  ? "Deficit"
                  : "Healthy";

              return {
                id: f.fundId,
                flag: balance !== null && balance < 0 ? ("negative" as const) : undefined,
                cells: {
                  fund: { value: `${f.code} — ${f.name}`, strong: true },
                  balance: { value: compactMoney(f.fundBalance), strong: true },
                  class: isGeneral ? (
                    <span>
                      Unassigned
                      <span className="block text-[11px] text-muted-2">
                        {compactMoney(unassignedNow)}
                        {reservePct === null ? "" : ` (${percent(reservePct)})`}
                      </span>
                    </span>
                  ) : (
                    (primaryClassification(f) ?? "—")
                  ),
                  status: (
                    <span className="flex justify-end">
                      <StatusBadge status={rung} label={label} size="sm" dot={false} />
                    </span>
                  ),
                },
              };
            })}
            total={{
              id: "total",
              total: true,
              cells: {
                fund: "Total all funds",
                balance: compactMoney(allFundsTotal),
                class: "—",
                status: "—",
              },
            }}
            empty="No fund has a committed opening balance for this year."
          />
          {userCan(user, "configure_district") && (
            <p className="mt-3 text-[11.5px] text-muted-2">
              A fund&apos;s balance can be corrected from{" "}
              <Link
                href={`/fund-balance/override?fy=${scope.fiscalYear}&period=${scope.period}`}
                className="font-medium text-brand hover:underline"
              >
                Corrections
              </Link>
              .
            </p>
          )}
        </SectionCard>

        <SectionCard
          title="Fund balance trend"
          subtitle={scope.fund ? scope.fund.name : "All funds"}
          badge={<StatusBadge status={reserveRung} size="sm" />}
          footer="Go to forecast and planning"
          footerHref={`/fund-balance/forecast?fy=${scope.fiscalYear}&period=${scope.period}`}
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
                label: "Ending fund balance",
                color: "var(--color-viz-budget)",
                labelLast: true,
                points: series.points.map((p) => ({
                  value: toNumber(p.fundBalance),
                  label: compactMoney(p.fundBalance),
                })),
              },
              {
                key: "unassigned",
                label: "Unassigned fund balance",
                color: "var(--color-viz-actual)",
                labelLast: true,
                points: series.points.map((p) => ({
                  value: toNumber(p.unassignedFundBalance),
                  label: compactMoney(p.unassignedFundBalance),
                })),
              },
            ]}
          />
          <div className="mt-4 flex flex-col gap-3">
            <MetricStrip
              cols={5}
              items={[
                { label: "Ending fund balance", value: compactMoney(totalNow) },
                {
                  label: "Unassigned fund balance",
                  value: compactMoney(unassignedNow),
                  note: reservePct === null ? undefined : percent(reservePct),
                },
                {
                  label: "Status",
                  value: reserveRung === "N/A" ? "Not available" : reserveRung,
                  tone:
                    reserveRung === "Strong"
                      ? "positive"
                      : reserveRung === "N/A"
                        ? "neutral"
                        : "negative",
                },
                { label: "Target", value: `${reserveT.target.toFixed(2)}%` },
                { label: "Minimum", value: `${statutoryMinimum.toFixed(2)}%` },
              ]}
            />
            {reservePct !== null && (
              <KeyInsightBar tone={reserveRung === "Strong" ? "info" : "monitor"}>
                Unassigned fund balance is {percent(reservePct)}, which is{" "}
                {reservePct >= statutoryMinimum ? "above" : "below"} the{" "}
                {statutoryMinimum.toFixed(2)}% statutory minimum and{" "}
                {reservePct >= reserveT.target ? "at or above" : "below"} the district target of{" "}
                {reserveT.target.toFixed(2)}%.
              </KeyInsightBar>
            )}
          </div>
        </SectionCard>
      </Row>

      {/* ---------- ROW 3: policy % · waterfall · composition ---------- */}
      <Row cols="3">
        <SectionCard
          title="Fund balance %"
          subtitle="Policy benchmark"
          info="The bands are your own thresholds, so this strip and the badge above it cannot disagree."
        >
          <div className="pt-7">
            <BenchmarkBand
              value={reservePct}
              bands={statusBands(reserveT)}
              target={reserveT.target}
              format={(v) => `${v.toFixed(v % 1 === 0 ? 0 : 2)}%`}
              label={`Policy target: maintain unassigned fund balance at ${reserveT.target.toFixed(2)}% of budgeted general fund expenditures. The dotted rule marks the target.`}
            />
          </div>
        </SectionCard>

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
            height={270}
          />
          {!foots && (
            <p className="mt-2 text-[11.5px] text-monitor">
              The movements shown do not add up to the ending balance. This usually means a
              period is missing from the year.
            </p>
          )}
        </SectionCard>

        <SectionCard
          title="Fund balance composition"
          info="Components are as reported on the opening fund balance; unassigned moves with the year's activity."
        >
          {components.length > 0 ? (
            <>
              <ShareBars
                title="Fund balance composition"
                summary="How the fund balance splits between its designated components and the unassigned reserve."
                rows={components.map((c) => ({
                  id: c.label,
                  label: c.label,
                  value: c.value,
                  display: compactMoney(c.amount),
                  share: percent(sharePercent(c.value, componentTotal), 1),
                  color: COMPONENT_COLORS[c.label],
                }))}
              />
              <div className="mt-4">
                <MetricStrip
                  cols={3}
                  items={[
                    { label: "Total fund balance", value: compactMoney(totalNow) },
                    { label: "Unassigned", value: compactMoney(unassignedNow) },
                    { label: "Components", value: String(components.length) },
                  ]}
                />
              </div>
            </>
          ) : (
            <p className="py-8 text-center text-[12.5px] text-muted-2">
              No opening fund balance has been committed for this year.
            </p>
          )}
        </SectionCard>
      </Row>

      <FooterInfoBar action="Go to forecast and planning" href={`/fund-balance/forecast?fy=${scope.fiscalYear}&period=${scope.period}`}>
        Want to see the future? Build a three-year projection from your own growth assumptions
        and see how reserves hold up.
      </FooterInfoBar>
    </FundBalanceShell>
  );
}
