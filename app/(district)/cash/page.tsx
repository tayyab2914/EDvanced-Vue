import { redirect } from "next/navigation";
import Link from "next/link";
import type { Prisma } from "@/lib/generated/prisma/client";
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
  daysCashOnHand,
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
import { RevealManager } from "@/components/reveal";
import { DataTable } from "@/components/dashboard/data-table";
import { AlertList } from "@/components/dashboard/alert-list";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { EmptyState, SubstitutionNotice, FundLevelNotice } from "@/components/dashboard/shared";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { LineChart } from "@/components/dashboard/charts/line-chart";
import { Gauge } from "@/components/dashboard/charts/gauge";
import { ShareBars } from "@/components/dashboard/charts/budget-bars";
import {
  OverviewKpiTile,
  OverviewSection,
  OverviewTileRow,
} from "@/components/dashboard/overview-kpi";
import { OverviewPeriodSelect } from "@/components/dashboard/overview-period-select";
import { OverviewPanel, ArrowGlyph } from "@/components/dashboard/overview-panel";
import { PillSelect } from "@/components/dashboard/pill-select";
import { CashSplitCard } from "@/components/dashboard/cash-split-card";
import { CashByFundTable, type CashFundRow } from "@/components/dashboard/cash-by-fund-table";
import { CashHealthCard } from "@/components/dashboard/cash-health-card";
import { CashTrendCard } from "@/components/dashboard/cash-trend-card";
import {
  CashCompositionCard,
  type CashCompositionRow,
} from "@/components/dashboard/cash-composition-card";
import {
  CashMonthlySummaryCard,
  type CashSummaryStep,
} from "@/components/dashboard/cash-monthly-summary-card";
import { RevenueAlertsCard } from "@/components/dashboard/revenue-alerts-card";
import type { CapsuleStat } from "@/components/dashboard/revenue-shared";
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
  sheetTableNote,
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
 *
 * ===================================================================================
 * THE REDESIGNED PAGE — a transcription of Figma 55:5118, on the same vocabulary the
 * Executive, Revenue, Expenditure and Fund Balance redesigns already speak: the Overview
 * tile band with the Cash status / Cash disbursements split card centred beneath it, then
 * the 772/315 card grid — by-fund ledger beside the Cash Health dial, the trend beside the
 * composition bars, the monthly walk and the key insight beside the alerts — every figure
 * keeping the calculation it always had.
 *
 * ONE COLUMN CAME BACK, on the client's own drawing: the by-fund table's Days Cash on
 * Hand. The M4 objection was that the old estimate annualised each fund's own SPENDING;
 * this one divides each fund's ending cash by its amended expenditure BUDGET ÷ 365 — the
 * same family of calculation as the headline tile, which annualises the adopted budget —
 * and the table's footnote names the one term that differs.
 * ===================================================================================
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

  /**
   * One read for the ledger AND the composition's fund view. The expenditure version rides
   * along for the per-fund days-cash divisor — each fund's amended annual budget, off the
   * same grouped aggregate the fund-balance page already pays for.
   */
  const fundRows = core.versions.get("CASH_POSITION")
    ? await byFund(db, {
        cashVersionId: core.versions.get("CASH_POSITION"),
        expenditureVersionId: core.versions.get("EXPENDITURE_DETAIL"),
        filter: scope.filter,
      })
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
      label: "Cash Balance",
      value: compactMoney(summary.endingCash),
      sub: scope.fund ? scope.fund.name : "All Funds",
      note:
        momPct === null
          ? previous
            ? undefined
            : "no earlier period"
          : `${accounting(momAmount, { compact: true })} (${signedPercent(momPct)}) from prior month`,
      tone: momPct === null ? ("neutral" as const) : sheetTone(deltaTone(momPct, "up")),
    },
    {
      key: "days",
      label: "Days Cash on Hand",
      value: daysCash === null ? NOT_AVAILABLE : `${fmtDays(daysCash)}`,
      sub: "days of operating cost covered",
      note: `${cashRung} · policy ≥ ${cashT.warning} days`,
      tone: rungTone(cashRung),
    },
    {
      key: "net",
      label: "Net Cash Flow (MTD)",
      value: accounting(summary.netCashFlowMtd, { compact: true }),
      sub: "receipts less disbursements",
      note:
        summary.netCashFlowMtd === null
          ? undefined
          : summary.netCashFlowMtd.isNegative()
            ? "Net Outflow"
            : "Net Inflow",
      tone:
        summary.netCashFlowMtd === null
          ? ("neutral" as const)
          : sheetTone(deltaTone(toNumber(summary.netCashFlowMtd), "up")),
    },
    {
      key: "receipts",
      label: "Cash Receipts (MTD)",
      value: compactMoney(summary.receiptsMtd),
      sub: "into the district's accounts",
      tone: "neutral" as const,
    },
    {
      key: "disbursements",
      label: "Cash Disbursements (MTD)",
      value: compactMoney(summary.disbursementsMtd),
      sub: "out of the district's accounts",
      tone: "neutral" as const,
    },
    {
      key: "status",
      label: "Cash Status",
      value: cashRung === "N/A" ? "Not available" : cashRung,
      sub: `Policy ≥ ${cashT.warning} days · critical below ${cashT.critical}`,
      note:
        daysVsTarget === null
          ? undefined
          : `${Math.abs(Math.round(daysVsTarget))} days ${daysVsTarget < 0 ? "below" : "above"} policy target`,
      tone: rungTone(cashRung),
    },
  ];

  // ---------- the by-fund ledger, shared by the sheet and the screen ----------
  const rowsWithCash = fundRows.filter((f) => f.endingCash !== null);
  const sumCash = (pick: (f: (typeof rowsWithCash)[number]) => Prisma.Decimal | null) =>
    rowsWithCash.reduce((a, f) => a + (toNumber(pick(f)) ?? 0), 0);

  /**
   * Per-fund days cash: the fund's ending cash against its own amended annual expenditure
   * budget ÷ 365 — the same shape as the headline, which reads the district's ADOPTED
   * budget. The footnote under the screen's table names the difference.
   *
   * A fund below zero is a DEFICIT whatever its budget divides to; a fund with no budget to
   * divide by is N/A, which is a different and calmer sentence.
   */
  const fundLedger = rowsWithCash.map((f) => {
    const days = toNumber(daysCashOnHand(f.endingCash, f.expenditureBudget));
    const negative = f.endingCash!.isNegative();
    return { row: f, days, negative, rung: negative ? ("Action Required" as const) : ladder(days, cashT) };
  });

  // ===================== the two-page landscape summary =====================
  //
  // Page one is the position: the six figures, the balance trend, the health dial and where
  // the cash is held. Page two is the ledger — every fund's beginning, receipts,
  // disbursements, ending and days of cover — with the monthly walk and the alerts. The
  // one-page version printed a three-column extract of that ledger and no walk at all.
  if (isSheet) {
    return (
      <PrintSheet
        title="Cash Position Summary"
        district={user.districtName ?? "District"}
        scope={sheetScope(scope)}
        asOf={sheetAsOf(scope.dataAsOf)}
        backHref={options.query ? `/cash?${options.query}` : "/cash"}
        pages={[
          {
            content: (
              <>
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
                  // under the figure, which at 140px lands on the hub and the needle crosses
                  // it. The card's own note says what the number is measured against.
                  unit=""
                  size={140}
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

        {/* The monthly walk — beginning, receipts, disbursements, net, ending — which the
            screen carries as its own card and the one-page sheet could not fit at all. */}
        <SheetBand cols="1fr">
          <SheetCard title="Monthly cash flow" note={`${scope.label} · receipts − disbursements`}>
            <SheetStats
              items={[
                { label: "Beginning cash", value: compactMoney(summary.beginningCash) },
                {
                  label: "Receipts (MTD)",
                  value: compactMoney(summary.receiptsMtd),
                  tone: "positive",
                },
                {
                  label: "Disbursements (MTD)",
                  value: accounting(summary.disbursementsMtd?.negated(), { compact: true }),
                  tone: "negative",
                },
                {
                  label: "Net cash flow (MTD)",
                  value: accounting(summary.netCashFlowMtd, { compact: true }),
                  tone: summary.netCashFlowMtd?.isNegative() ? "negative" : "positive",
                },
                { label: "Ending cash", value: compactMoney(summary.endingCash) },
              ]}
            />
          </SheetCard>
        </SheetBand>
              </>
            ),
          },
          {
            label: "Fund ledger & alerts",
            content: (
              <>
                {/* The screen's ledger, whole: the one-page sheet printed three of its six
                    columns and eight of its rows, which is a directory with the directory
                    taken out. */}
                <SheetBand cols="1fr">
                  <SheetCard
                    title="Cash balance by fund"
                    note={
                      fundLedger.length > SHEET_TABLE_ROWS
                        ? sheetTableNote(SHEET_TABLE_ROWS)
                        : "Beginning + receipts − disbursements"
                    }
                  >
                    <DataTable
                      dense
                      columns={[
                        { key: "fund", label: "Fund" },
                        { key: "beginning", label: "Beginning", align: "right" },
                        { key: "receipts", label: "Receipts", align: "right" },
                        { key: "disbursements", label: "Disbursements", align: "right" },
                        { key: "ending", label: "Ending cash", align: "right" },
                        { key: "share", label: "Share", align: "right" },
                        { key: "days", label: "Days cash", align: "right" },
                        { key: "status", label: "Status", align: "right" },
                      ]}
                      rows={fundLedger.slice(0, SHEET_TABLE_ROWS).map((f) => ({
                        id: f.row.fundId,
                        flag: f.negative ? ("negative" as const) : undefined,
                        cells: {
                          fund: {
                            value: codeName(f.row.code, f.row.name, scope.labelMode),
                            strong: true,
                          },
                          beginning: compactMoney(f.row.beginningCash),
                          receipts: compactMoney(f.row.receiptsMtd),
                          disbursements: compactMoney(f.row.disbursementsMtd),
                          ending: {
                            value: compactMoney(f.row.endingCash),
                            strong: true,
                            tone: f.negative ? ("negative" as const) : ("neutral" as const),
                          },
                          share: percent(
                            sharePercent(f.row.endingCash, point?.endingCash ?? null),
                            1,
                          ),
                          days: f.days === null ? NOT_AVAILABLE : `${fmtDays(f.days)} days`,
                          status: (
                            <span className="flex justify-end">
                              <StatusBadge
                                status={f.rung}
                                label={f.negative ? "Deficit" : undefined}
                                size="sm"
                                dot={false}
                              />
                            </span>
                          ),
                        },
                      }))}
                      total={{
                        id: "total",
                        total: true,
                        cells: {
                          fund: "Total cash",
                          beginning: compactMoney(sumCash((f) => f.beginningCash)),
                          receipts: compactMoney(sumCash((f) => f.receiptsMtd)),
                          disbursements: compactMoney(sumCash((f) => f.disbursementsMtd)),
                          ending: compactMoney(totalCash),
                          share: "100.0%",
                          days:
                            daysCash === null ? NOT_AVAILABLE : `${fmtDays(daysCash)} days`,
                          status: "—",
                        },
                      }}
                      empty="No cash position committed for this period."
                    />
                    <p className="text-[8.5px] leading-[1.4] text-[#060606]">
                      Days cash on hand per fund divides each fund&apos;s ending cash by its
                      amended annual expenditure budget ÷ 365. The headline tile reads the
                      district&apos;s adopted budget instead, so the two can differ where the
                      board has amended.
                    </p>
                  </SheetCard>
                </SheetBand>

                <SheetBand cols="1.35fr 1fr">
                  <SheetCard
                    title={`Cash alerts (${cashAlerts.length})`}
                    note="Against the district's own thresholds"
                  >
                    <AlertList
                      mode={scope.labelMode}
                      alerts={cashAlerts.slice(0, 6).map((a) => ({
                        id: a.id,
                        severity: a.severity,
                        title: a.title,
                        message: a.message,
                      }))}
                      empty="No cash thresholds crossed."
                      emptyNote="Cash position is within all policy thresholds."
                    />
                    {cashAlerts.length > 6 && (
                      <p className="text-[8.5px] text-[#060606]">
                        {cashAlerts.length - 6} further alert
                        {cashAlerts.length - 6 === 1 ? "" : "s"} on the Alerts dashboard.
                      </p>
                    )}
                  </SheetCard>

                  {/* The narrative as plain prose, not a `KeyInsightBar` — the bar prints its
                      own "KEY INSIGHT" eyebrow, which under a card already titled that read as
                      the heading having been printed twice. */}
                  <SheetCard title="Key insight" note="Cash movement and coverage">
                    <p className="text-[10px] leading-[1.45] text-[#060606]">
                      {movement ? `${movement} ` : ""}
                      {coverage} Cash balances are unaudited and reflect the file committed for{" "}
                      {scope.label}; the 30-day projection is straight-lined from recent months
                      and no alert reads it.
                    </p>
                  </SheetCard>
                </SheetBand>
              </>
            ),
          },
        ]}
      />
    );
  }

  // ---------- the by-fund ledger's rows ----------
  const tableRows: CashFundRow[] = fundLedger.map((f) => ({
    id: f.row.fundId,
    fund: <DimLabel code={f.row.code} name={f.row.name} mode={scope.labelMode} />,
    beginning: money(f.row.beginningCash),
    receipts: money(f.row.receiptsMtd),
    disbursements: money(f.row.disbursementsMtd),
    ending: money(f.row.endingCash),
    endingNegative: f.negative,
    days: f.days === null ? NOT_AVAILABLE : `${fmtDays(f.days)} days`,
    status: { label: f.negative ? "Deficit" : f.rung, rung: f.rung },
  }));
  const tableTotal = {
    beginning: money(sumCash((f) => f.beginningCash)),
    receipts: money(sumCash((f) => f.receiptsMtd)),
    disbursements: money(sumCash((f) => f.disbursementsMtd)),
    ending: money(sumCash((f) => f.endingCash)),
    days: daysCash === null ? NOT_AVAILABLE : `${fmtDays(daysCash)} days`,
  };

  // ---------- the trend card's capsule strip ----------
  const trendStats: CapsuleStat[] = [
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
  ];

  /*
    THE "VIEW BY" CARD — "Cash Composition … View By → Fund, Bank Account, Cash
    Category", per the client's M5 note, minus Bank Account, which the M6 note asked to
    hide for now.

    The two that remain are the two the file can draw. The cash position import is one
    row per FUND carrying beginning, receipts, disbursements and ending, plus optional
    investment / restricted / unrestricted balances. So Cash Category is that optional
    split (the card's original view) and Fund is the file's own grain. Bank Account had
    no column behind it anywhere in the schema — see the note on `CASH_VIEWS` in
    lib/dashboard/view.ts for what bringing it back would take.
  */
  const compositionRows: CashCompositionRow[] =
    view === "fund"
      ? fundSlices.map((slice, i) => ({
          id: slice.id,
          label: slice.label,
          display: compactMoney(slice.value),
          share: percent(sharePercent(slice.value, fundCashTotal), 1),
          sharePct: sharePercent(slice.value, fundCashTotal) ?? 0,
          color: SERIES_SLOTS[i % SERIES_SLOTS.length],
        }))
      : composition
        ? [
            { id: "operating", label: "Operating accounts", amount: composition.operating, color: CASH_COLORS.Operating },
            { id: "investment", label: "Investment accounts", amount: composition.investment, color: CASH_COLORS.Investment },
            { id: "restricted", label: "Restricted accounts", amount: composition.restricted, color: CASH_COLORS.Restricted },
            { id: "other", label: "Other", amount: composition.other, color: CASH_COLORS.Other },
          ].map((slice) => ({
            id: slice.id,
            label: slice.label,
            display: compactMoney(slice.amount),
            share: percent(sharePercent(slice.amount, composition.total), 1),
            sharePct: sharePercent(slice.amount, composition.total) ?? 0,
            color: slice.color,
          }))
        : [];
  const compositionEmpty =
    view === "fund"
      ? "No cash position was committed for this period."
      : "This period's cash file did not break the balance down by account type.";

  // ---------- the monthly walk's five steps ----------
  const netNegative = summary.netCashFlowMtd?.isNegative() ?? false;
  const summarySteps: CashSummaryStep[] = [
    {
      label: "Beginning cash balance",
      value: compactMoney(summary.beginningCash),
      ink: "#066dff",
      discBg: "rgba(26,147,46,0.18)",
      icon: "wallet",
      iconInk: "#1a932e",
      note: previous ? `vs period ${previous.period}` : undefined,
    },
    {
      label: "Cash receipts (MTD)",
      value: compactMoney(summary.receiptsMtd),
      ink: "#8e62ef",
      discBg: "rgba(142,98,239,0.18)",
      icon: "arrow-down",
      iconInk: "#8e62ef",
    },
    {
      label: "Cash disbursements (MTD)",
      value: compactMoney(summary.disbursementsMtd),
      ink: "#e65f2b",
      discBg: "rgba(230,95,43,0.18)",
      icon: "arrow-up",
      iconInk: "#e65f2b",
    },
    {
      label: "Net cash flow (MTD)",
      value: accounting(summary.netCashFlowMtd, { compact: true }),
      // The one figure in the walk with a direction — red when the month burned cash.
      ink: netNegative ? "#fd4438" : "#1a932e",
      discBg: "rgba(26,147,46,0.18)",
      icon: "=",
      iconInk: "#1a932e",
      note: "Receipts − disbursements",
    },
    {
      label: "Ending cash balance",
      value: compactMoney(summary.endingCash),
      ink: "#04877c",
      discBg: "rgba(26,147,46,0.18)",
      icon: "wallet",
      iconInk: "#1a932e",
      note: momPct === null ? undefined : `${signedPercent(momPct)} vs prior period`,
    },
  ];

  const detailsHref = `/data/cash-position?fy=${scope.fiscalYear}&period=${scope.period}`;
  // Heading case: this is a tile CAPTION beside "Cash Balance" / "Days Cash on Hand", and
  // it also titles the by-fund ledger below.
  const subject = scope.fund ? scope.fund.name : "All Funds";

  return (
    <div className="animate-fade-up space-y-[18px]">
      {/* Arms the entrance animations — same one-liner the other redesigns carry. */}
      <RevealManager />
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

      {/* ---------- the Overview band: four tiles, then the split card ---------- */}
      <OverviewSection
        action={
          <OverviewPeriodSelect
            label={scope.label}
            periods={options.periods}
            value={options.period}
          />
        }
      >
        <OverviewTileRow>
          <OverviewKpiTile
            arrow={false}
            icon="dollar"
            tone="green"
            label="Cash Balance"
            caption={subject}
            value={compactMoney(summary.endingCash)}
            sub="Ending balance"
            delta={
              momPct === null
                ? undefined
                : {
                    // Magnitude plus the period it is measured against; the arrow carries
                    // the sign, so "($2.96M) (−6.61%)" was signing the same fall twice.
                    text: `${compactMoney(momAmount === null ? null : momAmount.abs())} (${percent(Math.abs(momPct))})`,
                    tone: deltaTone(momPct, "up"),
                    direction: momPct < 0 ? "down" : momPct > 0 ? "up" : "flat",
                    note: "from prior month",
                  }
            }
            unavailableReason="No cash position file was committed for this period."
          />

          <OverviewKpiTile
            arrow={false}
            icon="calendar"
            tone="green"
            label="Days Cash on Hand"
            caption={subject}
            value={daysCash === null ? NOT_AVAILABLE : `${fmtDays(daysCash)} days`}
            sub="Operating days supported by available cash"
            status={cashRung}
            statusNote={`Policy ≥ ${cashT.warning} days`}
            statusInline
            unavailableReason="Needs a cash file and an adopted expenditure budget."
          />

          <OverviewKpiTile
            arrow={false}
            icon="wallet"
            tone="green"
            /* No period caption: "(MTD)" in the heading and the period pill on the band's
               own header already say which month this is. */
            label="Net Cash Flow (MTD)"
            value={accounting(summary.netCashFlowMtd, { compact: true })}
            sub="Receipts less disbursements"
            chip={
              summary.netCashFlowMtd === null
                ? undefined
                : summary.netCashFlowMtd.isNegative()
                  ? "Net Outflow"
                  : "Net Inflow"
            }
          />

          <OverviewKpiTile
            arrow={false}
            icon="arrow-down"
            tone="red"
            label="Cash Receipts (MTD)"
            value={compactMoney(summary.receiptsMtd)}
            sub="Received this month"
          />
        </OverviewTileRow>

        {/*
          The fifth and sixth figures, as the design's centred split card rather than two
          more tiles — the same demotion the Executive band applies to Available Budget /
          Alerts: the verdict and the outflow are context under the four headline figures.
        */}
        <CashSplitCard
          status={{
            label: "Cash Status",
            value: cashRung === "N/A" ? "N/A" : cashRung,
            // "above" / "below" rather than "+13" / "−13": the capsule stands alone with no
            // arrow beside it, so the sign had nothing to lean on.
            chip:
              daysVsTarget === null
                ? `Policy ≥ ${cashT.warning} days`
                : `${Math.abs(Math.round(daysVsTarget))} days ${daysVsTarget < 0 ? "below" : "above"} policy target`,
          }}
          disbursements={{
            label: "Cash Disbursements (MTD)",
            value: compactMoney(summary.disbursementsMtd),
            note: "Paid this month",
          }}
        />
      </OverviewSection>

      {/* ---------- the card grid — the design's 772 / 315 columns on a 10px gutter ---------- */}
      <div className="grid grid-cols-1 items-stretch gap-x-[10px] gap-y-[12px] xl:grid-cols-[minmax(0,2.45fr)_minmax(0,1fr)]">
        {/* row 1 — the by-fund ledger beside the health dial */}
        <CashByFundTable
          subtitle={`${subject} · beginning + receipts − disbursements`}
          ctaLabel={VIEW_DETAILS.cashPosition}
          ctaHref={detailsHref}
          rows={tableRows}
          total={tableTotal}
          empty="No cash position was committed for this period."
          footer={
            tableRows.length > 0 ? (
              <p className="mt-[12px] text-[10px] leading-[2] tracking-[0.1px] text-[#060606]">
                Days cash on hand per fund divides each fund&apos;s ending cash by its amended
                annual expenditure budget ÷ 365. The headline tile reads the district&apos;s
                adopted budget instead, so the two can differ where the board has amended.
              </p>
            ) : undefined
          }
        />

        <CashHealthCard
          days={daysCash}
          rung={cashRung}
          target={cashT.warning}
          critical={cashT.critical}
        />

        {/* row 2 — the trend beside the composition */}
        <CashTrendCard
          subtitle={subject}
          ctaLabel={VIEW_DETAILS.cashPosition}
          ctaHref={detailsHref}
          categories={forecastLabels}
          cash={forecast ? [...trend.map((p) => ({ value: p.value })), { value: null }] : trend}
          forecast={forecast ? forecastSeries : null}
          format={(v) => compactMoney(v, 0)}
          summary={`Ending cash balance by month for fiscal year ${scope.fiscalYear}${forecast ? ", with a straight-line 30-day projection" : ""}.`}
          stats={trendStats}
        />

        <CashCompositionCard
          subtitle="Where the balance is held, as reported on the cash file"
          caption={`By ${view === "fund" ? "fund" : "cash category"} · ${scope.fund ? scope.fund.name : "all funds"}`}
          control={<PillSelect options={CASH_VIEWS} value={view} size="sm" />}
          rows={compositionRows}
          ctaLabel={VIEW_DETAILS.cashPosition}
          ctaHref={detailsHref}
          empty={compositionEmpty}
        />

        {/* row 3 — the monthly walk and the key insight, beside the alerts */}
        <div className="flex min-w-0 flex-col gap-[12px]">
          <CashMonthlySummaryCard
            subtitle={`${scope.label} · ${subject}`}
            steps={summarySteps}
            ctaLabel={VIEW_DETAILS.cashPosition}
            ctaHref={detailsHref}
          />

          {/* ---------- the key insight bar — Figma 55:5479 ---------- */}
          <OverviewPanel className="flex flex-1 flex-wrap items-center justify-between gap-x-[24px] gap-y-[10px] p-[18px]">
            <div className="min-w-0 flex-1 basis-[280px]">
              <p className="text-[12px] font-bold leading-[22px] tracking-[-0.43px] text-[#060606]">
                Key insight
              </p>
              <p className="text-[12px] leading-[16px] tracking-[-0.23px] text-[#060606]">
                {movement ? `${movement} ` : ""}
                {coverage} Cash balances are unaudited and reflect the file committed for{" "}
                {scope.label}; the 30-day projection is straight-lined from recent months and
                no alert reads it.
              </p>
            </div>
            <Link
              href={options.link("/fund-balance/policies")}
              className="flex h-[24px] flex-none items-center gap-[5px] self-end rounded-[22px] bg-[#8e62ef] pl-[7px] pr-[10px] transition-opacity hover:opacity-85"
            >
              <ArrowGlyph color="#ffffff" className="-rotate-45" />
              <span className="whitespace-nowrap text-[10px] leading-[12px] tracking-[0.2px] text-white">
                {GO_TO.policies}
              </span>
            </Link>
          </OverviewPanel>
        </div>

        <RevenueAlertsCard
          title="Cash alerts"
          alerts={cashAlerts.map((a) => ({
            id: a.id,
            severity: a.severity,
            message: a.message,
            title: a.title,
            funds: alertFunds(scope, "/cash", "funds" in a ? a.funds : undefined).map((f) => ({
              id: f.id,
              label: f.role === "total" ? f.name : codeName(f.code, f.name, scope.labelMode),
              detail: f.detail,
              href: f.href,
              role: f.role,
            })),
          }))}
          totalCount={alerts?.alerts.length ?? 0}
          href={options.link("/alerts")}
          empty="No cash thresholds have been crossed this period."
        />
      </div>
    </div>
  );
}
