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
import { KpiTile, KpiRow, MiniStat } from "@/components/dashboard/kpi-tile";
import { SectionCard, FooterInfoBar } from "@/components/dashboard/section-card";
import { DataTable } from "@/components/dashboard/data-table";
import { AlertList } from "@/components/dashboard/alert-list";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { EmptyState, SubstitutionNotice, KeyInsightBar, FundLevelNotice } from "@/components/dashboard/shared";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { ViewBy } from "@/components/dashboard/view-by";
import { LineChart } from "@/components/dashboard/charts/line-chart";
import { Gauge } from "@/components/dashboard/charts/gauge";
import { ShareBars, MetricStrip } from "@/components/dashboard/charts/budget-bars";
import { scopeOptions, alertFunds } from "@/lib/dashboard/options";
import { GO_TO, VIEW_DETAILS } from "@/lib/dashboard/cta";
import { CASH_COLORS, SERIES_SLOTS } from "@/lib/dashboard/palette";
import { codeName } from "@/lib/text";
import { labelMode } from "@/lib/dashboard/label-mode";
import { DimLabel } from "@/components/dashboard/dim-label";
import { CASH_VIEWS, resolveView } from "@/lib/dashboard/view";
import {
  PrintSheet,
  SheetBand,
  SheetCard,
  SheetKpi,
  SheetStats,
} from "@/components/dashboard/print-sheet";
import {
  rungTone,
  sheetTone,
  sheetScope,
  sheetAsOf,
  SHEET_TABLE_ROWS,
  SHEET_TABLE_NOTE,
} from "@/lib/dashboard/summary";

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
  searchParams: Promise<{
    fy?: string;
    period?: string;
    fund?: string;
    groupBy?: string;
    view?: string;
  }>;
}) {
  const { db, user, districtId } = await getTenantDb();
  if (!userCan(user, "view_dashboards")) redirect("/master-data");

  const sp = await searchParams;
  // Not `summary` — that name is taken by `cashSummary()` below, which is the figures
  // themselves rather than the view they are being asked for.
  const isSheet = sp.view === "summary";
  const scope = await resolveScope(db, districtId, sp, await labelMode());
  const view = resolveView(CASH_VIEWS, sp.groupBy);

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
    ? await byFund(db, { cashVersionId: core.versions.get("CASH_POSITION"), filter: scope.filter })
    : [];
  const totalCash = toNumber(point?.endingCash);

  /**
   * The composition card's "view by fund" rows.
   *
   * Filtered to the scoped fund when there is one, unlike the by-fund TABLE beside it. The
   * table is a directory — a district that has scoped to the General Fund still wants to see
   * where the rest of its cash sits. This is a COMPOSITION, and a composition whose slices
   * came from a wider set than the total printed above them would not add up.
   *
   * No extra query: `byFund` is already loaded for that table.
   */
  const fundCash = fundRows
    .filter((f) => f.endingCash !== null && (!scope.fundId || f.fundId === scope.fundId))
    .map((f) => ({ id: f.fundId, label: codeName(f.code, f.name, scope.labelMode), value: toNumber(f.endingCash) ?? 0 }))
    .sort((a, b) => b.value - a.value);
  // Six categorical slots, so five funds and a fold — the same rule `foldTail` applies to
  // the breakdowns (lib/finance/breakdown.ts). A seventh fund does not get a generated hue.
  const fundSlices =
    fundCash.length > 6
      ? [
          ...fundCash.slice(0, 5),
          {
            id: "__other",
            label: `Other (${fundCash.length - 5})`,
            value: fundCash.slice(5).reduce((a, f) => a + f.value, 0),
          },
        ]
      : fundCash;
  const fundCashTotal = fundCash.reduce((a, f) => a + f.value, 0);

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
        // Which funds are thin or draining, on the All Funds view.
        funds: alertFunds(scope, "/cash", a.funds),
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

  const summaryHref = options.query
    ? `/cash?${options.query}&view=summary`
    : "/cash?view=summary";

  // ---------- the sheet's six headline figures ----------
  const kpiData = [
    {
      key: "balance",
      label: "Cash balance",
      value: compactMoney(summary.endingCash),
      sub: scope.fund ? scope.fund.name : "All funds",
      note:
        momPct === null
          ? previous
            ? undefined
            : "no earlier period"
          : `${accounting(momAmount, { compact: true })} (${signedPercent(momPct)})`,
      tone: momPct === null ? ("neutral" as const) : sheetTone(deltaTone(momPct, "up")),
    },
    {
      key: "days",
      label: "Days cash on hand",
      value: daysCash === null ? NOT_AVAILABLE : `${fmtDays(daysCash)}`,
      sub: "days of operating cost covered",
      note: `${cashRung} · policy ≥ ${cashT.warning} days`,
      tone: rungTone(cashRung),
    },
    {
      key: "net",
      label: "Net cash flow (MTD)",
      value: accounting(summary.netCashFlowMtd, { compact: true }),
      sub: scope.label,
      note:
        summary.netCashFlowMtd === null
          ? undefined
          : summary.netCashFlowMtd.isNegative()
            ? "Outflow"
            : "Inflow",
      tone:
        summary.netCashFlowMtd === null
          ? ("neutral" as const)
          : sheetTone(deltaTone(toNumber(summary.netCashFlowMtd), "up")),
    },
    {
      key: "receipts",
      label: "Cash receipts (MTD)",
      value: compactMoney(summary.receiptsMtd),
      sub: "into the district's accounts",
      tone: "neutral" as const,
    },
    {
      key: "disbursements",
      label: "Cash disbursements (MTD)",
      value: compactMoney(summary.disbursementsMtd),
      sub: "out of the district's accounts",
      tone: "neutral" as const,
    },
    {
      key: "status",
      label: "Cash status",
      value: cashRung === "N/A" ? "Not available" : cashRung,
      sub: `Policy ≥ ${cashT.warning} days · critical below ${cashT.critical}`,
      note:
        daysVsTarget === null
          ? undefined
          : `${daysVsTarget < 0 ? "" : "+"}${Math.round(daysVsTarget)} days vs target`,
      tone: rungTone(cashRung),
    },
  ];

  // ===================== the one-page landscape summary =====================
  if (isSheet) {
    return (
      <PrintSheet
        title="Cash Position Summary"
        district={user.districtName ?? "District"}
        scope={sheetScope(scope)}
        asOf={sheetAsOf(scope.dataAsOf)}
        backHref={options.query ? `/cash?${options.query}` : "/cash"}
      >
        <SheetBand cols="1fr 1fr 1fr 1fr 1fr 1fr">
          {kpiData.map((k) => (
            <SheetKpi
              key={k.key}
              label={k.label}
              value={k.value}
              sub={k.sub}
              note={k.note}
              tone={k.tone}
            />
          ))}
        </SheetBand>

        <SheetBand cols="1.4fr 1fr">
          <SheetCard
            title="Cash balance trend"
            note={scope.fund ? scope.fund.name : "All funds"}
          >
            <LineChart
              title="Cash balance trend"
              summary={`Ending cash balance by month for fiscal year ${scope.fiscalYear}${forecast ? ", with a straight-line 30-day projection" : ""}.`}
              categories={forecastLabels}
              format={(v) => compactMoney(v, 0)}
              height={230}
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
            <SheetStats
              items={[
                { label: "Period high", value: compactMoney(stats.high?.value) },
                { label: "Period low", value: compactMoney(stats.low?.value) },
                { label: "Average", value: compactMoney(stats.average) },
                { label: "Volatility", value: stats.volatility ?? NOT_AVAILABLE },
              ]}
            />
          </SheetCard>

          <SheetCard title="Cash health" note={`Against a ${cashT.warning}-day policy`}>
            <div className="flex items-center gap-3">
              <div className="flex flex-none flex-col items-center">
                <Gauge
                  value={daysCash}
                  bands={statusBands(cashT)}
                  rung={cashRung}
                  // No unit caption at this size: the gauge's unit line sits a fixed 15px
                  // under the figure, which at 130px lands on the hub and the needle crosses
                  // it. The card's own note says what the number is measured against.
                  unit=""
                  size={130}
                  title="Days cash on hand"
                  summary={
                    daysCash === null
                      ? "Days cash on hand cannot be computed for this period."
                      : `${fmtDays(daysCash)} days of cash on hand, against a policy minimum of ${cashT.warning}.`
                  }
                />
                <StatusBadge status={cashRung} size="sm" dot={false} className="mt-1" />
              </div>
              <div className="min-w-0 flex-1">
                <ShareBars
                  title="Cash composition"
                  summary="How the district's cash splits across its funds."
                  rows={fundSlices.map((f, i) => ({
                    id: f.id,
                    label: f.label,
                    value: f.value,
                    display: compactMoney(f.value),
                    share: percent(sharePercent(f.value, fundCashTotal), 1),
                    color: SERIES_SLOTS[i % SERIES_SLOTS.length],
                  }))}
                />
              </div>
            </div>
          </SheetCard>
        </SheetBand>

        <SheetBand cols="1.5fr 1fr">
          <SheetCard title="Cash balance by fund" note={SHEET_TABLE_NOTE}>
            <DataTable
              dense
              columns={[
                { key: "fund", label: "Fund" },
                { key: "cash", label: "Ending cash", align: "right" },
                { key: "share", label: "Share", align: "right" },
              ]}
              rows={fundRows
                .filter((f) => f.endingCash !== null)
                .slice(0, SHEET_TABLE_ROWS)
                .map((f) => ({
                  id: f.fundId,
                  cells: {
                    fund: { value: codeName(f.code, f.name, scope.labelMode), strong: true },
                    cash: compactMoney(f.endingCash),
                    share: percent(sharePercent(f.endingCash, point?.endingCash ?? null), 1),
                  },
                }))}
              total={{
                id: "total",
                total: true,
                cells: {
                  fund: "Total cash",
                  cash: compactMoney(totalCash),
                  share: "100.0%",
                },
              }}
              empty="No cash position committed for this period."
            />
          </SheetCard>

          <div className="flex min-w-0 flex-col gap-[7px]">
            {/* The narrative as plain prose, not a `KeyInsightBar` — the bar prints its own
                "KEY INSIGHT" eyebrow, which under a card already titled that read as the
                heading having been printed twice. */}
            <SheetCard title="Key insight" note="Cash movement and coverage">
              <p className="text-[9.5px] leading-[1.45] text-ink-muted">
                {movement ? `${movement} ` : ""}
                {coverage}
              </p>
            </SheetCard>

            <SheetCard title={`Cash alerts (${cashAlerts.length})`}>
              <AlertList
                mode={scope.labelMode}
                alerts={cashAlerts.slice(0, 2).map((a) => ({
                  id: a.id,
                  severity: a.severity,
                  title: a.title,
                  message: a.message,
                }))}
                empty="No cash thresholds crossed."
              />
            </SheetCard>
          </div>
        </SheetBand>
      </PrintSheet>
    );
  }

  return (
    <div className="animate-fade-up space-y-[18px]">
      <PageHeader
        title="Cash Position"
        description="Monitor cash availability, liquidity and cash flow."
        actions={
          <DashboardFilters
            scope={scope}
            exportHref={options.exportHref("/cash/export")}
            summaryHref={summaryHref}
          />
        }
      />
      {scope.substituted && <SubstitutionNotice asked={scope.substituted.asked} showing={scope.substituted.showing} />}
      {scope.fundLevelOnly && <FundLevelNotice subject="Cash position" />}

      {/* ---------- KPI CARDS ---------- */}
      <KpiRow count={6}>
        <KpiTile
          icon="dollar"
          tone="green"
          label="Cash balance"
          caption={scope.fund ? scope.fund.name : "All funds"}
          value={compactMoney(summary.endingCash)}
          sub="Ending cash balance"
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
          sub="Operating days supported by available cash"
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
          sub="Net cash generated this month"
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
          sub="Cash received during the current month"
        />

        <KpiTile
          icon="arrow-up"
          tone="purple"
          label="Cash disbursements (MTD)"
          caption="Paid out this period"
          value={compactMoney(summary.disbursementsMtd)}
          sub="Cash paid during the current month"
        />

        <KpiTile
          icon="target"
          tone={cashRung === "Action Required" ? "red" : cashRung === "Monitor" ? "amber" : "green"}
          label="Cash status"
          caption={scope.fund ? scope.fund.name : "All funds"}
          value={cashRung === "N/A" ? "Not available" : cashRung}
          valueStatus={cashRung}
          sub="Compared to cash reserve policy"
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
          footer={VIEW_DETAILS.cashPosition}
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
          footer={VIEW_DETAILS.cashPosition}
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
                  fund: {
                    value: <DimLabel code={f.code} name={f.name} mode={scope.labelMode} />,
                    strong: true,
                  },
                  cash: {
                    value: money(f.endingCash),
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
                cash: money(point?.endingCash),
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
          footer={VIEW_DETAILS.cashPosition}
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
          footer={GO_TO.alerts}
          footerHref={options.link("/alerts")}
        >
          <AlertList
            mode={scope.labelMode}
            alerts={cashAlerts}
            href={options.link("/alerts")}
            empty="No cash thresholds have been crossed this period."
          />
        </SectionCard>

        {/*
          THE "VIEW BY" CARD — "Cash Composition … View By → Fund, Bank Account, Cash
          Category", per the client's M5 note, minus Bank Account, which the M6 note asked to
          hide for now.

          The two that remain are the two the file can draw. The cash position import is one
          row per FUND carrying beginning, receipts, disbursements and ending, plus optional
          investment / restricted / unrestricted balances. So Cash Category is that optional
          split (the card's original view) and Fund is the file's own grain. Bank Account had
          no column behind it anywhere in the schema — see the note on `CASH_VIEWS` in
          lib/dashboard/view.ts for what bringing it back would take.
        */}
        <SectionCard
          title="Cash composition"
          subtitle={
            view === "fund"
              ? `By fund · ${scope.fund ? scope.fund.name : "all funds"}`
              : `By cash category · ${scope.fund ? scope.fund.name : "all funds"}`
          }
          info="Where the balance is held, as reported on the cash file."
          control={<ViewBy options={CASH_VIEWS} value={view} />}
          footer={VIEW_DETAILS.cashPosition}
          footerHref={`/data/cash-position?fy=${scope.fiscalYear}&period=${scope.period}`}
        >
          {view === "fund" ? (
            fundSlices.length > 0 ? (
              <ShareBars
                title="Cash composition by fund"
                summary="How the ending cash balance is split across the district's funds."
                rows={fundSlices.map((slice, i) => ({
                  id: slice.id,
                  label: slice.label,
                  value: slice.value,
                  display: compactMoney(slice.value),
                  share: percent(sharePercent(slice.value, fundCashTotal), 1),
                  color: SERIES_SLOTS[i % SERIES_SLOTS.length],
                }))}
              />
            ) : (
              <p className="py-8 text-center text-[12.5px] text-muted-2">
                No cash position was committed for this period.
              </p>
            )
          ) : composition ? (
            <ShareBars
              title="Cash composition by category"
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
