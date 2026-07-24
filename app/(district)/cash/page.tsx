import { redirect } from "next/navigation";
import { getTenantDb, userCan } from "@/lib/auth/dal";
import { resolveScope } from "@/lib/dashboard/scope";
import { loadCore, daysCashThresholds, periodAxisLabels } from "@/lib/dashboard/load";
import { byFund } from "@/lib/finance/breakdown";
import {
  cashSummary,
  cashComposition,
  cashStats,
  thirtyDayForecast,
  negativeCashFlowRun,
} from "@/lib/finance/cash";
import { trendNarrative } from "@/lib/alerts/insights";
import { ladder, bands as statusBands } from "@/lib/dashboard/status";
import {
  compactMoney,
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
import { KpiTile, KpiRow, MiniStat } from "@/components/dashboard/kpi-tile";
import { SectionCard, DataAsOf, FooterInfoBar } from "@/components/dashboard/section-card";
import { DataTable } from "@/components/dashboard/data-table";
import { AlertList } from "@/components/dashboard/alert-list";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { EmptyState, SubstitutionNotice, KeyInsightBar } from "@/components/dashboard/shared";
import { ScopeBar } from "@/components/dashboard/scope-bar";
import { LineChart } from "@/components/dashboard/charts/line-chart";
import { Gauge } from "@/components/dashboard/charts/gauge";
import { ShareBars, MetricStrip } from "@/components/dashboard/charts/budget-bars";
import { scopeOptions } from "@/lib/dashboard/options";
import { CASH_COLORS } from "@/lib/dashboard/palette";

/**
 * The Cash Position dashboard (Spec §7) — availability, liquidity and flow.
 *
 * The client's M4 note rebuilt four of the five cards, and each change traded a generic
 * shape for one that answers the question the card exists for:
 *
 *   Cash Balance by Fund — was six columns including an estimated days-cash per fund, now
 *   three. The estimate was a different calculation from the headline figure (it annualised
 *   each fund's own spending rather than reading the adopted budget) and a column that has
 *   to be footnoted "(est.)" to be honest is a column that is doing harm on an executive
 *   screen.
 *
 *   Cash Policy Summary → CASH HEALTH. The policy echo listed four thresholds; the health
 *   card says where the district IS against the two that matter and by how many days it
 *   misses. The thresholds are still on the Policies page, which is where they are changed.
 *
 *   Monthly Cash Summary — a four-row table became five figure cards, because five figures
 *   read at a glance is what "monthly cash summary" is for.
 *
 *   Cash Composition — the donut became horizontal bars. A donut asks the reader to compare
 *   angles; a ranked bar asks them to compare lengths, which people are actually good at.
 *
 * The month-over-month KPI is deliberately absent: "we do not need month over month KPI".
 * The movement is still stated, on the Cash balance tile's trend pill and in the key
 * insight, where it is context rather than a headline.
 */
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
  const momAmount =
    summary.endingCash && summary.previousEndingCash
      ? summary.endingCash.minus(summary.previousEndingCash)
      : null;
  const labels = periodAxisLabels(scope, series.points.length);

  /** How far the district sits from its own board target, in days. */
  const daysVsTarget = daysCash === null ? null : daysCash - cashT.warning;

  const fundRows = core.versions.get("CASH_POSITION")
    ? await byFund(db, { cashVersionId: core.versions.get("CASH_POSITION") })
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

  const cashAlerts = [
    ...(alerts?.alerts ?? [])
      .filter((a) => a.group === "cash")
      .map((a) => ({
        id: a.id,
        severity: a.severity as "WARNING" | "CRITICAL",
        title: a.title,
        message: a.message,
      })),
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
  ];

  // ---------- the key insight narrative ----------
  const movement = trendNarrative({
    subject: `${scope.fund ? scope.fund.name : "All funds"} cash`,
    current: summary.endingCash,
    previous: summary.previousEndingCash,
    periodLabel: scope.label,
    previousLabel: previous ? `period ${previous.period}` : "the prior period",
  });
  const coverage =
    daysCash === null
      ? "Days cash on hand cannot be computed until a cash file and an adopted expenditure budget are both committed."
      : `The district currently has ${fmtDays(daysCash)} days of cash on hand, which is ${
          daysVsTarget !== null && daysVsTarget < 0 ? "below" : "at or above"
        } the board target of ${cashT.warning} days, and sits in ${cashRung} status.`;

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

      {/* ---------- KPI CARDS ---------- */}
      <KpiRow count={6}>
        <KpiTile
          icon="dollar"
          tone="green"
          label="Cash balance"
          caption={scope.fund ? scope.fund.name : "All funds"}
          value={compactMoney(summary.endingCash)}
          sub={previous ? `vs period ${previous.period}` : "no earlier period"}
          delta={
            momPct === null
              ? undefined
              : {
                  text: `${accounting(momAmount, { compact: true })} (${signedPercent(momPct)})`,
                  tone: deltaTone(momPct, "up"),
                  direction: momPct < 0 ? "down" : momPct > 0 ? "up" : "flat",
                }
          }
          unavailableReason="No cash position file was committed for this period."
        />

        <KpiTile
          icon="clock"
          tone={cashRung === "Action Required" ? "red" : cashRung === "Monitor" ? "amber" : "green"}
          label="Days cash on hand"
          caption={scope.fund ? scope.fund.name : "All funds"}
          value={daysCash === null ? NOT_AVAILABLE : `${fmtDays(daysCash)} days`}
          sub="of operating cost covered"
          status={cashRung}
          statusNote={`Policy ≥ ${cashT.warning} days`}
          unavailableReason="Needs a cash file and an adopted expenditure budget."
        />

        <KpiTile
          icon="trend-up"
          tone="blue"
          label="Net cash flow (MTD)"
          caption={scope.label}
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
                  direction: summary.netCashFlowMtd.isNegative() ? "down" : "up",
                }
          }
        />

        <KpiTile
          icon="arrow-down"
          tone="teal"
          label="Cash receipts (MTD)"
          caption="Collected this period"
          value={compactMoney(summary.receiptsMtd)}
          sub="into the district's accounts"
        />

        <KpiTile
          icon="arrow-up"
          tone="purple"
          label="Cash disbursements (MTD)"
          caption="Paid out this period"
          value={compactMoney(summary.disbursementsMtd)}
          sub="out of the district's accounts"
        />

        <KpiTile
          icon="target"
          tone={cashRung === "Action Required" ? "red" : cashRung === "Monitor" ? "amber" : "green"}
          label="Cash status"
          caption={scope.fund ? scope.fund.name : "All funds"}
          value={cashRung === "N/A" ? "Not available" : cashRung}
          valueStatus={cashRung}
          sub={`Policy ≥ ${cashT.warning} days · critical below ${cashT.critical}`}
          statusNote={
            daysVsTarget === null
              ? undefined
              : `${daysVsTarget < 0 ? "" : "+"}${Math.round(daysVsTarget)} days vs target`
          }
        />
      </KpiRow>

      {/* ---------- ROW 2: trend · by fund · cash health ---------- */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.85fr)]">
        <SectionCard
          title="Cash balance trend"
          subtitle={scope.fund ? scope.fund.name : "All funds"}
          footer="View full cash analysis"
          footerHref={`/data/cash-position?fy=${scope.fiscalYear}&period=${scope.period}`}
        >
          <LineChart
            title="Cash balance trend"
            summary={`Ending cash balance by month for fiscal year ${scope.fiscalYear}${forecast ? ", with a straight-line 30-day projection" : ""}.`}
            categories={forecastLabels}
            format={(v) => compactMoney(v, 0)}
            height={270}
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
            <MetricStrip
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

        <SectionCard
          title="Cash balance by fund"
          subtitle={scope.fund ? scope.fund.name : "All funds"}
          footer="View all funds"
          footerHref={`/data/cash-position?fy=${scope.fiscalYear}&period=${scope.period}`}
        >
          <DataTable
            columns={[
              { key: "fund", label: "Fund" },
              { key: "cash", label: "Ending cash balance", align: "right" },
              { key: "share", label: "% of total", align: "right" },
            ]}
            rows={fundRows
              .filter((f) => f.endingCash !== null)
              .map((f) => ({
                id: f.fundId,
                flag: f.endingCash!.isNegative() ? ("negative" as const) : undefined,
                cells: {
                  fund: { value: `${f.code} — ${f.name}`, strong: true },
                  cash: {
                    value: compactMoney(f.endingCash),
                    strong: true,
                    tone: f.endingCash!.isNegative() ? ("negative" as const) : undefined,
                  },
                  share: percent(sharePercent(f.endingCash, totalCash), 1),
                },
              }))}
            total={{
              id: "total",
              total: true,
              cells: {
                fund: "Total all funds",
                cash: compactMoney(point?.endingCash),
                share: "100.0%",
              },
            }}
            empty="No cash position was committed for this period."
          />
        </SectionCard>

        <SectionCard
          title="Cash health"
          subtitle={scope.fund ? scope.fund.name : "All funds"}
          info="Days cash on hand = cash balance ÷ (adopted expenditure budget ÷ 365)."
        >
          <div className="flex flex-col items-center">
            <Gauge
              value={daysCash}
              bands={statusBands(cashT)}
              rung={cashRung}
              unit="days cash on hand"
              size={170}
              title="Days cash on hand"
              summary={
                daysCash === null
                  ? "Days cash on hand cannot be computed for this period."
                  : `${fmtDays(daysCash)} days of cash on hand, against a policy minimum of ${cashT.warning}.`
              }
            />
          </div>

          <dl className="mt-3 flex flex-col">
            <div className="flex items-center justify-between gap-3 border-t border-line-soft py-2.5">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-2">
                Status
              </dt>
              <dd>
                <StatusBadge status={cashRung} size="md" />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-line-soft py-2.5">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-2">
                Target (board policy)
              </dt>
              <dd className="text-[13px] font-semibold tabular-nums text-ink">
                {cashT.warning} days
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-line-soft py-2.5">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-2">
                Critical (board policy)
              </dt>
              <dd className="text-[13px] font-semibold tabular-nums text-ink">
                {cashT.critical} days
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-line-soft py-2.5">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-2">
                Current vs target
              </dt>
              <dd
                className={
                  daysVsTarget === null
                    ? "text-[13px] font-semibold text-muted-2"
                    : daysVsTarget < 0
                      ? "text-[13px] font-semibold tabular-nums text-action"
                      : "text-[13px] font-semibold tabular-nums text-strong"
                }
              >
                {daysVsTarget === null
                  ? NOT_AVAILABLE
                  : `${daysVsTarget < 0 ? "−" : "+"}${Math.abs(Math.round(daysVsTarget))} days`}
              </dd>
            </div>
          </dl>
        </SectionCard>
      </div>

      {/* ---------- ROW 3: monthly summary · alerts · composition ---------- */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.85fr)]">
        <SectionCard
          title="Monthly cash summary"
          subtitle={`${scope.label} · ${scope.fund ? scope.fund.name : "All funds"}`}
          footer="View cash flow details"
          footerHref={`/data/cash-position?fy=${scope.fiscalYear}&period=${scope.period}`}
        >
          {/*
            Sized by what a nine-figure balance needs, not by a viewport breakpoint. This
            card is the 1.4fr column of a three-column row, so `lg:grid-cols-5` handed each
            tile ~79px on a 1440px laptop and "$44.75M" ran straight out of the card. auto-fit
            keeps five across when the column is wide enough for them and drops to four or
            three when it is not — the figure never overflows at any width.
          */}
          <div className="grid gap-2.5 grid-cols-[repeat(auto-fit,minmax(96px,1fr))]">
            <MiniStat
              icon="wallet"
              tone="slate"
              label="Beginning cash balance"
              value={compactMoney(summary.beginningCash)}
              note={previous ? `vs period ${previous.period}` : undefined}
            />
            <MiniStat
              icon="arrow-down"
              tone="green"
              label="Cash receipts (MTD)"
              value={compactMoney(summary.receiptsMtd)}
              valueTone="positive"
            />
            <MiniStat
              icon="arrow-up"
              tone="red"
              label="Cash disbursements (MTD)"
              value={compactMoney(summary.disbursementsMtd)}
              valueTone="negative"
            />
            <MiniStat
              icon="equals"
              tone="blue"
              label="Net cash flow (MTD)"
              value={accounting(summary.netCashFlowMtd, { compact: true })}
              valueTone={summary.netCashFlowMtd?.isNegative() ? "negative" : "positive"}
            />
            <MiniStat
              icon="dollar"
              tone="teal"
              label="Ending cash balance"
              value={compactMoney(summary.endingCash)}
              note={momPct === null ? undefined : `${signedPercent(momPct)} vs prior period`}
            />
          </div>
        </SectionCard>

        <SectionCard
          title={`Cash alerts (${cashAlerts.length})`}
          footer="View all alerts"
          footerHref="/alerts"
        >
          <AlertList
            alerts={cashAlerts}
            href="/alerts"
            empty="No cash thresholds have been crossed this period."
          />
        </SectionCard>

        <SectionCard
          title="Cash composition"
          subtitle={scope.fund ? scope.fund.name : "All funds"}
          info="Where the balance is held, as reported on the cash file."
          footer="View account details"
          footerHref={`/data/cash-position?fy=${scope.fiscalYear}&period=${scope.period}`}
        >
          {composition ? (
            <ShareBars
              title="Cash composition"
              summary="How the ending cash balance is split between operating, investment and restricted accounts."
              rows={[
                { id: "operating", label: "Operating accounts", amount: composition.operating },
                { id: "investment", label: "Investment accounts", amount: composition.investment },
                { id: "restricted", label: "Restricted accounts", amount: composition.restricted },
                { id: "other", label: "Other", amount: composition.other },
              ].map((slice) => ({
                id: slice.id,
                label: slice.label,
                value: toNumber(slice.amount) ?? 0,
                display: compactMoney(slice.amount),
                share: percent(sharePercent(slice.amount, composition.total), 1),
                color:
                  CASH_COLORS[
                    slice.id === "operating"
                      ? "Operating"
                      : slice.id === "investment"
                        ? "Investment"
                        : slice.id === "restricted"
                          ? "Restricted"
                          : "Other"
                  ],
              }))}
            />
          ) : (
            <p className="py-8 text-center text-[12.5px] text-muted-2">
              This period&apos;s cash file did not break the balance down by account type.
            </p>
          )}
        </SectionCard>
      </div>

      {/* ---------- the narrative the client asked for ---------- */}
      <KeyInsightBar
        tone={cashRung === "Action Required" ? "action" : cashRung === "Monitor" ? "monitor" : "info"}
      >
        {movement ? `${movement} ` : ""}
        {coverage}
      </KeyInsightBar>

      <FooterInfoBar>
        Cash balances are unaudited and reflect the file committed for {scope.label}. The 30-day
        projection is straight-lined from recent months and no alert reads it.
      </FooterInfoBar>
    </div>
  );
}
