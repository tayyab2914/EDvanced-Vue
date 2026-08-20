import { redirect } from "next/navigation";
import { getTenantDb, userCan } from "@/lib/auth/dal";
import { resolveScope } from "@/lib/dashboard/scope";
import { labelMode } from "@/lib/dashboard/label-mode";
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
import {
  reserveCaption,
  reserveSubject,
  reserveTileLabel,
  reserveUnavailableReason,
} from "@/lib/dashboard/reserve";
import { GO_TO, GO_TO_DASHBOARD_SHORT } from "@/lib/dashboard/cta";
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
import {
  OverviewKpiTile,
  OverviewSection,
  OverviewSplitCard,
  OverviewTileRow,
} from "@/components/dashboard/overview-kpi";
import { OverviewPeriodSelect } from "@/components/dashboard/overview-period-select";
import { FooterInfoBar } from "@/components/dashboard/section-card";
import { DataTable } from "@/components/dashboard/data-table";
import { AlertList, InsightList } from "@/components/dashboard/alert-list";
import { Gauge } from "@/components/dashboard/charts/gauge";
import { OverviewBudgetCard } from "@/components/dashboard/overview-budget-card";
import { OverviewAlertsPanel } from "@/components/dashboard/overview-alerts";
import { StatusBadge } from "@/components/dashboard/status-badge";
import {
  EmptyState,
  SubstitutionNotice,
  KeyInsightBar,
  FundLevelOnly,
} from "@/components/dashboard/shared";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { LineChart } from "@/components/dashboard/charts/line-chart";
import { OverviewTrendCard } from "@/components/dashboard/overview-trend-card";
import { RevealManager } from "@/components/reveal";
import { OverviewCashCard } from "@/components/dashboard/overview-cash-card";
import { OverviewHealthCard } from "@/components/dashboard/overview-health-card";
import type { RailItem } from "@/components/dashboard/overview-panel";
import {
  RevenueCollectedWidget,
  BudgetStatusWidget,
  KeyInsightsWidget,
  OverviewWidgetRow,
} from "@/components/dashboard/overview-widgets";
import { scopeOptions, alertFunds, scopeDescription } from "@/lib/dashboard/options";
import {
  PrintSheet,
  SheetBand,
  SheetCard,
  SheetKpi,
  SheetStats,
} from "@/components/dashboard/print-sheet";
import {
  SheetRevenueCollected,
  SheetBudgetStatus,
  SheetBudgetBars,
} from "@/components/dashboard/sheet-widgets";
import { rungTone, sheetTone, sheetScope, sheetAsOf } from "@/lib/dashboard/summary";

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
  const scope = await resolveScope(db, districtId, sp, await labelMode());

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
      ? revenueBySource(db, { versionId: revVersion, filter: scope.filter, periodsElapsed: scope.period })
      : null,
    // BY OBJECT, not by function — the client's note on §3.3b: "change to objects easier to
    // scan (Salaries, Employee Benefits, Purchased Svc, Energy Svc, Materials & Supplies,
    // Capital Outlay, Other)". Those are the object TYPES, so the executive card folds to
    // the same seven a business office reads, and the Expenditures dashboard keeps the
    // function breakdown for the drill-down.
    expVersion
      ? expenditureByObjectType(db, {
          versionId: expVersion,
          filter: scope.filter,
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
  // "of projected General Fund revenue" — the denominator, named rather than assumed.
  const reserveOf = reserveCaption(reserve);
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
      indicator: "Budget utilization (spend + enc.)",
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

  /**
   * ---------- the two composition widgets the client asked for ----------
   *
   * Both read from `facts`, not from the breakdowns loaded above, and that is deliberate:
   * these say the same thing the KPI row says, in a shape a superintendent can take in
   * without reading six tiles. `facts.availableBudget` IS the Available Budget tile and
   * `facts.expenditureYtd` IS the Total Expenditures tile, so the donut cannot disagree
   * with the numbers three inches above it. A second derivation from `byObjectType` would
   * have been the same figure by a different route, which is the same figure until the day
   * a filter drifts and it is not.
   *
   * Remaining is FLOORED AT ZERO for drawing, because a negative slice has no angle. It is
   * not floored for reading: `overcommitted` below puts the real, negative figure in words
   * under the chart, and `shareOf` keeps the two remaining slices reading as their true
   * share of budget rather than renormalising to each other. A district that has committed
   * more than it has must not see a tidy circle.
   */
  const budgetTotal = toNumber(facts?.expenditureBudget) ?? 0;
  const expended = toNumber(facts?.expenditureYtd) ?? 0;
  const encumbered = toNumber(facts?.encumbrances) ?? 0;
  const availableBudget = toNumber(facts?.availableBudget) ?? 0;
  const overcommitted = Boolean(facts) && budgetTotal > 0 && availableBudget < 0;

  const revenueBudgetTotal = toNumber(facts?.revenueBudget) ?? 0;
  const collected = toNumber(facts?.revenueYtd) ?? 0;
  const uncollected = Math.max(0, revenueBudgetTotal - collected);
  const collectedPct = revenueBudgetTotal > 0 ? (collected / revenueBudgetTotal) * 100 : null;

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

  /**
   * The white metric rail beside the trend chart — Figma 3:12428's four figures, or the
   * General Fund's five. The labels are the design's Title Case; the figures are the same
   * ones the old MetricStrip carried.
   */
  const fundBalanceRail: RailItem[] = isGeneralFund
    ? [
        { label: "Ending Fund Balance", value: compactMoney(endingFundBalance) },
        {
          label: "Unassigned Fund Balance",
          value: compactMoney(point?.unassignedFundBalance),
          note: reservePct === null ? undefined : `${percent(reservePct)} ${reserveOf}`,
        },
        {
          label: "Status",
          value: "",
          badge: reserveRung,
          note:
            reserveRung === "N/A"
              ? undefined
              : reserveRung === "Strong"
                ? "At or above target"
                : "Below target",
        },
        { label: "Policy Target", value: `${reserveT.target.toFixed(2)}%` },
        { label: "Statutory Minimum", value: `${statutoryMinimum.toFixed(2)}%` },
      ]
    : [
        { label: "Ending Fund Balance", value: compactMoney(endingFundBalance) },
        { label: "Total Fund Balance", value: compactMoney(endingFundBalance) },
        {
          label: "Month over Month Change",
          value: accounting(fbChange, { compact: true }),
          tone: fbChange?.isNegative() ? ("negative" as const) : ("positive" as const),
          note:
            fbChangePct === null ? undefined : `${signedPercent(fbChangePct)} vs Prior period`,
          noteArrow:
            fbChangePct === null ? undefined : fbChangePct < 0 ? ("down" as const) : ("up" as const),
        },
        {
          label: "Opening Balance",
          value: compactMoney(openingFundBalance),
          note: `Start of FY ${scope.fiscalYear}`,
        },
      ];

  const fundBalanceInsight = isGeneralFund
    ? reservePct === null
      ? null
      : `${reserveSubject(reserve)} is ${percent(reservePct)} ${reserveOf}, which is ${
          reservePct >= statutoryMinimum ? "above" : "below"
        } the ${statutoryMinimum.toFixed(2)}% statutory minimum and ${
          reservePct >= reserveT.target ? "at or above" : "below"
        } the district target of ${reserveT.target.toFixed(2)}%.`
    : trendNarrative({
        // "Total fund balance", not "All funds ending fund balance": the card's own title
        // and the series legend beside the chart already say which balance and whose, so
        // the caption only has to name the line the reader is looking at.
        subject: scope.fund ? `${scope.fund.name} fund balance` : "Total fund balance",
        current: endingFundBalance,
        previous: previous?.fundBalance ?? null,
        // No `periodLabel` — the card's "As of" line already carries the period. The
        // comparison is only "the prior MONTH" when the month before this one actually
        // committed data; `previousPoint` walks back past empty periods, and calling a
        // three-month gap a month would misstate the change the sentence then quantifies.
        previousLabel:
          previous?.period === scope.period - 1 ? "the prior month" : "the prior period",
      });

  // ---------- §3.2c cash position ----------
  const flow = cashFlowYtd(series.points);
  const cashPctOfSpend = cashPercentOfExpenditures(
    point?.endingCash ?? null,
    point?.expenditureYtd ?? null,
  );
  // The FUND-level budget, not the filtered one. This divides a cash figure, and cash has
  // no cost centre to narrow by — see `cashBasisExpenditureBudget` in lib/finance/series.ts.
  const avgMonthlySpend = toNumber(series.cashBasisExpenditureBudget)
    ? toNumber(series.cashBasisExpenditureBudget)! / 12
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
    // Which fund each alert is about, on the All Funds view — the client's "I do not know
    // where to go". From here the drill-down narrows the whole executive summary, which is
    // the right move on a page whose every tile is district-wide.
    funds: alertFunds(scope, "/dashboard", a.funds),
  }));

  const options = scopeOptions(scope);
  const summaryHref = options.query
    ? `/dashboard?${options.query}&view=summary`
    : "/dashboard?view=summary";

  // ===================== the cards, declared once and placed twice =====================
  // The summary view is a re-arrangement of these, not a re-implementation.

  /**
   * The six headline figures, as DATA rather than as markup.
   *
   * The screen tile and the sheet tile are different components — one is built for a 170px
   * column with a status badge and a drill-down link, the other for a 155px slot on paper
   * with neither — but a summary that could print a different figure from the dashboard it
   * summarises would be worse than no summary. So the figures are computed once here and
   * the two components only decide how to draw them.
   */
  const kpiData = [
    {
      key: "revenues",
      label: "Revenue Collected (YTD)",
      value: compactMoney(point?.revenueYtd),
      sub:
        point && toNumber(point.revenueBudget)
          ? `${percent(((toNumber(point.revenueYtd) ?? 0) / (toNumber(point.revenueBudget) || 1)) * 100)} of annual budget collected`
          : "No revenue budget uploaded",
      // The direction is carried by the WORD, not by a minus sign: "23.68% below budget to
      // date" reads at a glance where "−23.68% vs budget to date" makes the reader decode
      // the sign first. Same treatment on every variance line in the product.
      note:
        revVarPct === null
          ? undefined
          : `${percent(Math.abs(revVarPct))} ${revVarPct < 0 ? "below" : "above"} budget to date`,
      tone: revVarPct === null ? ("neutral" as const) : sheetTone(deltaTone(revVarPct, "up")),
      icon: "dollar" as const,
      tileTone: "green" as const,
      href: "/revenues",
      delta:
        revVarPct === null
          ? undefined
          : {
              text: `${percent(Math.abs(revVarPct))} ${revVarPct < 0 ? "below" : "above"}`,
              tone: deltaTone(revVarPct, "up"),
              direction: (revVarPct < 0 ? "down" : revVarPct > 0 ? "up" : "flat") as
                | "down"
                | "up"
                | "flat",
              note: "budget to date",
            },
    },
    {
      key: "expenditures",
      label: "Expenditures (YTD)",
      value: compactMoney(point?.expenditureYtd),
      sub:
        point && toNumber(point.expenditureBudget)
          ? `${percent(((toNumber(point.expenditureYtd) ?? 0) / (toNumber(point.expenditureBudget) || 1)) * 100)} of annual budget expended`
          : "No expenditure budget uploaded",
      note: utilPct === null ? undefined : `${percent(utilPct)} committed`,
      tone: "neutral" as const,
      icon: "receipt" as const,
      tileTone: "blue" as const,
      href: "/expenditures",
      delta:
        utilPct === null
          ? undefined
          : { text: `${percent(utilPct)} committed`, tone: "neutral" as const },
    },
    {
      key: "reserve",
      label: reserveTileLabel(reserve),
      value: percent(reserve?.percent),
      // The caption names the denominator rather than assuming it — see lib/dashboard/reserve.ts
      // for why this is a function and not the string it used to be.
      sub: core.generalFund ? `As a % ${reserveOf}` : "no General Fund identified",
      note: `${reserveRung} · target ≥ ${reserveT.target.toFixed(2)}%`,
      tone: rungTone(reserveRung),
      icon: "shield" as const,
      tileTone: "purple" as const,
      href: "/fund-balance",
      status: reserveRung,
      statusNote: `Target ≥ ${reserveT.target.toFixed(2)}%`,
      unavailableReason: reserveUnavailableReason(reserve?.basis ?? "REVENUE"),
    },
    {
      key: "days-cash",
      label: "Days Cash on Hand",
      value: daysCash === null ? NOT_AVAILABLE : fmtDays(daysCash),
      // Not "Days of cash on hand" any more — that is now the label, and a sub-line that
      // repeats its own heading is a wasted row on the print sheet (the screen tile hides
      // the sub for tiles 3–4, so this line only ever shows there).
      sub: "Operating days supported by available cash",
      note: `${cashRung} · policy ≥ ${cashT.warning} days`,
      tone: rungTone(cashRung),
      icon: "clock" as const,
      tileTone: "amber" as const,
      href: "/cash",
      status: cashRung,
      statusNote: `Policy ≥ ${cashT.warning} days`,
      unavailableReason: "Needs a cash position file and an adopted expenditure budget.",
    },
    {
      key: "available",
      label: "Available Budget",
      value: accounting(facts?.availableBudget, { compact: true }),
      sub: "Remaining budget available to spend",
      note:
        facts && toNumber(facts.availableBudget) !== null
          ? toNumber(facts.availableBudget)! < 0
            ? "Overcommitted"
            : "Remaining"
          : undefined,
      tone:
        facts && toNumber(facts.availableBudget) !== null
          ? sheetTone(deltaTone(toNumber(facts.availableBudget), "up"))
          : ("neutral" as const),
      icon: "wallet" as const,
      tileTone: "teal" as const,
      delta:
        facts && toNumber(facts.availableBudget) !== null
          ? {
              text: toNumber(facts.availableBudget)! < 0 ? "Overcommitted" : "Remaining",
              tone: deltaTone(toNumber(facts.availableBudget), "up"),
            }
          : undefined,
    },
    {
      key: "alerts",
      label: "Alerts",
      value: String(alerts?.alerts.length ?? 0),
      sub: "Active financial alerts",
      note:
        alerts && alerts.criticalCount > 0
          ? `${alerts.criticalCount} critical`
          : alerts && alerts.warningCount > 0
            ? `${alerts.warningCount} warning`
            : "All clear",
      tone:
        alerts && alerts.criticalCount > 0
          ? ("negative" as const)
          : alerts && alerts.warningCount > 0
            ? ("monitor" as const)
            : ("positive" as const),
      icon: "warning" as const,
      tileTone: "red" as const,
      href: "/alerts",
      delta:
        alerts && alerts.criticalCount > 0
          ? { text: `${alerts.criticalCount} critical`, tone: "negative" as const }
          : alerts && alerts.warningCount > 0
            ? { text: `${alerts.warningCount} warning`, tone: "neutral" as const }
            : { text: "All clear", tone: "positive" as const },
    },
  ];

  /**
   * §3.1's KPI row, redrawn as the Overview band.
   *
   * The tiles are the same six figures over the same `kpiData` — only the presentation
   * changed. The band steps to four columns rather than six, so on a wide screen the last
   * two wrap onto a second row instead of every tile losing 90px of width.
   *
   * The pill states the period the figures cover AND sets it. It writes the same `fy` and
   * `period` parameters the Filters panel writes — one resolver reads them either way (see
   * components/dashboard/overview-period-select.tsx), so this is a second way to reach one
   * setting, not a second setting.
   */
  /**
   * The percentage rings on the first two tiles. The design draws a 20px arc beside "Of
   * annual budget collected"; these are the figures it reports. `null` where there is no
   * budget to divide by, which renders the sub-line without a ring rather than a 0% one.
   */
  const expendedPct =
    point && toNumber(point.expenditureBudget)
      ? ((toNumber(point.expenditureYtd) ?? 0) /
          (toNumber(point.expenditureBudget) || 1)) *
        100
      : null;

  /**
   * The design splits the Overview six ways: four tiles, then Available Budget and Alerts
   * sharing one bordered card. `kpiData` is already in that order, so the split is
   * positional — tiles 0–3, then the pair.
   */
  const tiles = kpiData.slice(0, 4);
  const budgetKpi = kpiData[4];
  const alertsKpi = kpiData[5];

  /**
   * The ring already states the percentage, so the sentence beside it must not repeat it —
   * the design reads "◕ Of annual budget collected", not "93% of annual budget collected"
   * next to a 93% ring. Stripping here rather than in `kpiData` because the same strings
   * feed the one-page summary sheet, which has no ring to carry the figure.
   */
  const withoutLeadingPercent = (s: string) => s.replace(/^[\d.,]+%\s+/, "");

  const availableBudgetNum = toNumber(facts?.availableBudget);
  const expenditureBudgetNum = toNumber(point?.expenditureBudget);
  const remainingPct =
    availableBudgetNum !== null && expenditureBudgetNum
      ? (availableBudgetNum / expenditureBudgetNum) * 100
      : null;

  const kpis = (
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
      {tiles.map((k, i) => (
        <OverviewKpiTile
          key={k.key}
          icon={k.icon}
          tone={k.tileTone}
          label={k.label}
          value={k.value}
          // Only the first two tiles carry a sub-line in the design (Figma 3:11594/3:11604);
          // the reserve and days-cash tiles show just badge + target note. The reserve
          // basis wording still lives on the Fund Balance dashboard itself.
          sub={
            i < 2
              ? typeof k.sub === "string"
                ? withoutLeadingPercent(k.sub)
                : k.sub
              : undefined
          }
          subPct={i === 0 ? collectedPct : i === 1 ? expendedPct : null}
          delta={k.delta}
          status={k.status}
          statusNote={k.statusNote}
          unavailableReason={k.unavailableReason}
          // The tile is the client's "Go to Dashboard", and it carries the slice the tile
          // was computed over — a figure filtered to two funds must open a dashboard
          // filtered to the same two, or the drill-down contradicts the number clicked.
          href={k.href ? options.link(k.href) : undefined}
        />
      ))}
      </OverviewTileRow>
      <OverviewSplitCard
        budget={{
          label: budgetKpi.label,
          value: budgetKpi.value,
          // "Healthy" / "Overcommitted" is the design's own vocabulary for this pane, and
          // both words are already decided by the figure above them — this only names what
          // `availableBudget < 0` already means everywhere else on the page.
          badge:
            availableBudgetNum === null
              ? undefined
              : availableBudgetNum < 0
                ? { text: "Overcommitted", tone: "negative" as const }
                : { text: "Healthy", tone: "positive" as const },
          note:
            remainingPct === null
              ? undefined
              : `${percent(remainingPct)} of annual budget remaining`,
        }}
        alerts={{
          label: alertsKpi.label,
          value: alertsKpi.value,
          criticalCount: alerts?.criticalCount ?? 0,
          href: alertsKpi.href ? options.link(alertsKpi.href) : undefined,
          hrefLabel: GO_TO_DASHBOARD_SHORT,
        }}
      />
    </OverviewSection>
  );

  /**
   * ---------- the two budget cards + the alerts rail (Figma 3:11828 / 3:12063 / 3:11737) ----------
   *
   * The redesign redraws §3.3a/b as two stacked translucent cards with the Alerts Summary
   * standing beside them — see components/dashboard/overview-budget-card.tsx and
   * overview-alerts.tsx for the transcription notes. The figures are the same rows the
   * SectionCard + BudgetBars versions carried; the one-page summary sheet draws them with
   * SheetBudgetBars (sheet-widgets.tsx), the same design at sheet scale.
   */
  const revenueCard = (
    <OverviewBudgetCard
      title="Revenues vs Budget (YTD)"
      subtitle="Top five revenue sources compared to expected YTD collections"
      unit="Revenue Source"
      ctaLabel={GO_TO.revenues}
      ctaHref={options.link("/revenues")}
      accent="green"
      rows={revenueRows}
      format={(v) => compactMoney(v, 0)}
      chartTitle="Revenues against budget"
      summary="Actual year-to-date revenue against the budget expected by now and the full-year budget, for the five largest sources."
    />
  );

  const expenditureCard = (
    <OverviewBudgetCard
      title="Expenditures vs. Budget (YTD)"
      subtitle="Expenditure objects compared to expected YTD spending"
      unit="Expenditure Object"
      ctaLabel={GO_TO.expenditures}
      ctaHref={options.link("/expenditures")}
      accent="purple"
      rows={expenditureRows}
      format={(v) => compactMoney(v, 0)}
      chartTitle="Expenditures against budget"
      summary="Actual year-to-date spending against the budget expected by now and the full-year budget, by object type."
    />
  );

  /**
   * ---------- the three widget cards (Figma 3:11691 / 3:11667 / 3:11713) ----------
   *
   * The redesign redraws the two composition widgets and Key Insights as one band of
   * translucent cards — see components/dashboard/overview-widgets.tsx for the transcription
   * notes. The figures are the same ones the SectionCard versions carried:
   *
   *   - Revenue Collected measures PROGRESS against the full-year revenue budget, not the
   *     budget expected by now. The Revenues KPI tile and "Revenues vs budget (YTD)" judge
   *     PACE, which is what the variance policy is set against; this answers the simpler
   *     thing a board asks — how much of the year's money is in — and nothing here is
   *     coloured by a threshold, because 79% in month nine is a fact, not a verdict.
   *   - Budget Status keeps the client's word ENCUMBERED rather than "committed", which is
   *     already a fund balance classification two screens away (see COMPONENT_COLORS in
   *     lib/dashboard/palette.ts). Remaining stays floored at zero for DRAWING only — the
   *     overcommitted bar under the band puts the real, negative figure in words.
   */
  const monthlyRevenue = series.points.map((p, i) => {
    const v = toNumber(p.revenueYtd);
    if (v === null) return null;
    if (i === 0) return v;
    const prev = toNumber(series.points[i - 1].revenueYtd);
    return prev === null ? null : v - prev;
  });

  const widgetRow = (
    <>
      <OverviewWidgetRow>
        <RevenueCollectedWidget
          collectedDisplay={compactMoney(collected)}
          ofDisplay={revenueBudgetTotal > 0 ? `of ${compactMoney(revenueBudgetTotal)}` : undefined}
          remainingDisplay={compactMoney(uncollected)}
          collectedPct={collectedPct}
          spark={monthlyRevenue}
        />
        <BudgetStatusWidget
          totalDisplay={budgetTotal > 0 ? compactMoney(budgetTotal) : NOT_AVAILABLE}
          expendedDisplay={compactMoney(expended)}
          encumberedDisplay={compactMoney(encumbered)}
          remainingDisplay={accounting(availableBudget, { compact: true })}
          expended={expended}
          encumbered={encumbered}
          remaining={Math.max(0, availableBudget)}
        />
        <KeyInsightsWidget insights={insights} />
      </OverviewWidgetRow>
      {overcommitted && (
        <KeyInsightBar tone="action">
          Spending and encumbrances exceed the full-year budget by{" "}
          {compactMoney(Math.abs(availableBudget))}, so there is no remaining budget to draw.
        </KeyInsightBar>
      )}
    </>
  );

  /**
   * ---------- the redesigned trend card (Figma 3:12327 + 3:12428 + 3:12493) ----------
   *
   * The chart, the white metric rail and the Key insight tip in one translucent card —
   * see components/dashboard/overview-trend-card.tsx for the transcription notes. The
   * figures are the same ones the SectionCard + MetricStrip version carried, and the
   * one-page summary sheet still uses LineChart below.
   */
  const fundBalanceCard = (
    <OverviewTrendCard
      compact
      title="Fund Balance Trend"
      subtitle={isGeneralFund ? scopeDescription(scope) : "General Fund · Board reserve policy"}
      ctaLabel={GO_TO.fundBalance}
      ctaHref={options.link("/fund-balance")}
      badge={scope.fundLevelOnly ? <FundLevelOnly what="Fund balance is" /> : undefined}
      chartTitle={scope.fund ? scope.fund.name : "All funds"}
      categories={labels}
      format={(v) => compactMoney(v, 0)}
      summary={`Total and unassigned fund balance by month for fiscal year ${scope.fiscalYear}.`}
      series={[
        {
          key: "total",
          label: isGeneralFund ? "Ending fund balance" : "Total fund balance",
          points: fundBalanceTrend,
        },
        ...(isGeneralFund
          ? [
              {
                key: "unassigned",
                label: "Unassigned fund balance",
                points: unassignedTrend,
              },
            ]
          : []),
      ]}
      rail={fundBalanceRail}
      insight={fundBalanceInsight}
    />
  );

  /**
   * ---------- the redesigned cash card (Figma 3:12343 + 3:12462 + 3:12495) ----------
   *
   * The big reserve gauge with the metric rail beside it and the five-figure cash flow
   * walk beneath — see components/dashboard/overview-cash-card.tsx. The gauge's bands are
   * still the district's own thresholds via `statusBands(cashT)`, never the mockup's.
   */
  // The period, in the two halves the cash card's subtitle sets apart. The fiscal year's
  // hyphen becomes an EN DASH: "2026–27" is a span of years, and the hyphen it arrives with
  // is the URL parameter's, not typography.
  const asOfMonth = scope.label.replace(/\s*\(FY[^)]*\)\s*$/, "");
  const fiscalYearLabel = scope.fiscalYear.replace(/-/g, "–");

  const cashCard = (
    <OverviewCashCard
      compact
      title="Cash Position"
      // `scope.label` is "September 2026 (FY 2026-27)" — the period selector's own label,
      // which parenthesises the fiscal year (and which the mockup transcribed as-is, year
      // printed twice, because the page used to append it again). The card sets the two
      // halves side by side instead: "As of September 2026 · FY 2026–27".
      subtitle={`As of ${asOfMonth} · FY ${fiscalYearLabel}`}
      ctaLabel={GO_TO.cash}
      ctaHref={options.link("/cash")}
      badge={scope.fundLevelOnly ? <FundLevelOnly what="Cash is" /> : undefined}
      gauge={{
        value: daysCash,
        bands: statusBands(cashT),
        rung: cashRung,
        summary:
          daysCash === null
            ? "Days cash on hand cannot be computed for this period."
            : `${fmtDays(daysCash)} days of cash on hand, against a policy minimum of ${cashT.warning}.`,
      }}
      rail={[
        { label: "Cash balance", value: compactMoney(point?.endingCash) },
        { label: "Avg monthly spend", value: compactMoney(avgMonthlySpend) },
        {
          label: "Cash % of Expenditures",
          value: percent(cashPctOfSpend, 1),
          note: cashPctOfSpend === null ? "Needs spending detail" : undefined,
        },
        {
          label: "Trend",
          value: cashTrendPct === null ? NOT_AVAILABLE : signedPercent(cashTrendPct),
          tone:
            cashTrendPct === null
              ? ("default" as const)
              : cashTrendPct < 0
                ? ("negative" as const)
                : ("positive" as const),
          note: cashTrendPct === null ? "Needs an earlier period" : "vs prior period",
        },
      ]}
      strip={[
        { label: "Beginning Cash", value: compactMoney(flow.beginningCash) },
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
  );

  /**
   * ---------- the redesigned health summary (Figma 3:12545) ----------
   *
   * The same five rows as before, drawn to the design's table — see
   * components/dashboard/overview-health-card.tsx. The one-page summary sheet keeps its
   * DataTable version of the same `health` array.
   */
  const healthCard = (
    <OverviewHealthCard
      rows={health.map((h) => ({
        id: h.id,
        indicator: h.indicator,
        current: h.current,
        target: h.target,
        rung: h.rung,
        trend: h.trend,
      }))}
    />
  );

  const alertsCard = (
    <OverviewAlertsPanel
      alerts={alertRows}
      critical={alerts?.criticalCount ?? 0}
      warning={alerts?.warningCount ?? 0}
      informational={alerts?.informationalCount ?? 0}
      href={options.link("/alerts")}
    />
  );

  // ===================== the two-page landscape summary =====================
  //
  // NOT the dashboard with tighter padding. The bands below are chosen for a 990px canvas
  // and nothing else: the two budget charts get a half-width column each because their
  // fixed label / reference / status columns leave a three-up layout roughly 8px of actual
  // bar to draw in — which is how the previous summary managed to print a chart with no
  // chart in it.
  //
  // The split is by ALTITUDE, which is the same order the screen reads in. Page one is what
  // a board is told first: the six figures, the two composition widgets, and revenue and
  // spending against budget. Page two is what it asks next — the trend behind the reserve,
  // the health table, the cash position, and the alerts. The Alerts panel in particular was
  // simply absent from the one-page version, so a printed packet said "3 alerts" in a tile
  // and never said what they were.
  if (summary) {
    return (
      <PrintSheet
        title="Executive Summary"
        district={user.districtName ?? "District"}
        scope={sheetScope(scope)}
        asOf={sheetAsOf(scope.dataAsOf)}
        backHref={options.query ? `/dashboard?${options.query}` : "/dashboard"}
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
                      icon={k.icon}
                      accent={k.tileTone}
                    />
                  ))}
                </SheetBand>

                {/* The widget band the redesign added under the tiles: the Revenue Collected
                    gauge and the Budget Status donut, at sheet scale, with Key Insights
                    beside them — the same three cards, in the same order, as the screen's
                    widget row. */}
                <SheetBand cols="1fr 1.15fr 1fr">
                  <SheetCard
                    title="Revenue Collected"
                    note={revenueBudgetTotal > 0 ? "Of full-year revenue budget" : undefined}
                  >
                    <SheetRevenueCollected
                      collectedDisplay={compactMoney(collected)}
                      ofDisplay={
                        revenueBudgetTotal > 0
                          ? `of ${compactMoney(revenueBudgetTotal)}`
                          : undefined
                      }
                      remainingDisplay={compactMoney(uncollected)}
                      collectedPct={collectedPct}
                    />
                  </SheetCard>

                  <SheetCard
                    title="Budget Status"
                    note={
                      overcommitted
                        ? `Overcommitted by ${compactMoney(Math.abs(availableBudget))}`
                        : "Expended + encumbered vs full-year budget"
                    }
                  >
                    <SheetBudgetStatus
                      totalDisplay={budgetTotal > 0 ? compactMoney(budgetTotal) : NOT_AVAILABLE}
                      expendedDisplay={compactMoney(expended)}
                      encumberedDisplay={compactMoney(encumbered)}
                      remainingDisplay={accounting(availableBudget, { compact: true })}
                      expended={expended}
                      encumbered={encumbered}
                      remaining={Math.max(0, availableBudget)}
                    />
                  </SheetCard>

                  <SheetCard title="Key Insights">
                    {insights.length > 0 ? (
                      // Four now, where the one-page sheet could carry three. Still bounded:
                      // an insight list is the one thing here that grows without limit, and
                      // the rest are on /alerts — which page two now prints.
                      <InsightList insights={insights.slice(0, 4)} layout="column" />
                    ) : (
                      <p className="py-3 text-center text-[10px] text-[#060606]">
                        Nothing stands out this period.
                      </p>
                    )}
                  </SheetCard>
                </SheetBand>

                <SheetBand cols="1fr 1fr">
                  <SheetCard title="Revenues vs Budget (YTD)" note="Five largest sources">
                    <SheetBudgetBars
                      accent="green"
                      title="Revenues against budget"
                      summary="Actual year-to-date revenue against the budget expected by now and the full-year budget, for the five largest sources."
                      rows={revenueRows}
                      format={(v) => compactMoney(v, 0)}
                    />
                  </SheetCard>

                  <SheetCard title="Expenditures vs. Budget (YTD)" note="By object">
                    <SheetBudgetBars
                      accent="purple"
                      title="Expenditures against budget"
                      summary="Actual year-to-date spending against the budget expected by now and the full-year budget, by object type."
                      rows={expenditureRows}
                      format={(v) => compactMoney(v, 0)}
                    />
                  </SheetCard>
                </SheetBand>
              </>
            ),
          },
          {
            label: "Position & alerts",
            content: (
              <>
                <SheetBand cols="1.25fr 1fr">
                  <SheetCard
                    title="Fund Balance Trend"
                    badge={
                      isGeneralFund ? (
                        <StatusBadge status={reserveRung} size="sm" dot={false} />
                      ) : undefined
                    }
                    note={scope.fund ? scope.fund.name : "All funds"}
                  >
                    <LineChart
                      title="Fund balance trend"
                      summary={`Total and unassigned fund balance by month for fiscal year ${scope.fiscalYear}.`}
                      categories={labels}
                      format={(v) => compactMoney(v, 0)}
                      // 120px on the one-page sheet, where this chart shared a band with two
                      // other cards. A second page buys it the height it was drawn for.
                      height={185}
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
                    <SheetStats
                      items={
                        isGeneralFund
                          ? [
                              { label: "Ending", value: compactMoney(endingFundBalance) },
                              {
                                label: "Unassigned",
                                value: compactMoney(point?.unassignedFundBalance),
                              },
                              { label: "Target", value: `${reserveT.target.toFixed(2)}%` },
                              { label: "Minimum", value: `${statutoryMinimum.toFixed(2)}%` },
                            ]
                          : [
                              { label: "Ending", value: compactMoney(endingFundBalance) },
                              { label: "Opening", value: compactMoney(openingFundBalance) },
                              {
                                label: "Change",
                                value: accounting(fbChange, { compact: true }),
                                tone: fbChange?.isNegative()
                                  ? ("negative" as const)
                                  : ("positive" as const),
                              },
                            ]
                      }
                    />
                  </SheetCard>

                  <SheetCard title="Financial Health Summary" note="Against policy targets">
                    <DataTable
                      dense
                      columns={[
                        { key: "indicator", label: "Indicator" },
                        { key: "current", label: "Current", align: "right" },
                        { key: "target", label: "Target", align: "right" },
                        { key: "status", label: "Status", align: "right" },
                      ]}
                      rows={health.map((h) => ({
                        id: h.id,
                        cells: {
                          indicator: { value: h.indicator, strong: true },
                          current: h.current,
                          target: h.target,
                          status: (
                            <span className="flex justify-end">
                              <StatusBadge status={h.rung} size="sm" dot={false} />
                            </span>
                          ),
                        },
                      }))}
                    />
                  </SheetCard>
                </SheetBand>

                <SheetBand cols="1.25fr 1fr">
                  {/* The cash card the screen carries, gauge and all — the one-page sheet had
                      room for its figures but not for the dial that judges them. */}
                  <SheetCard
                    title="Cash Position"
                    badge={<StatusBadge status={cashRung} size="sm" dot={false} />}
                    note={`As of ${scope.label}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex flex-none flex-col items-center">
                        <Gauge
                          value={daysCash}
                          bands={statusBands(cashT)}
                          rung={cashRung}
                          unit=""
                          size={125}
                          title="Days cash on hand"
                          summary={
                            daysCash === null
                              ? "Days cash on hand cannot be computed for this period."
                              : `${fmtDays(daysCash)} days of cash on hand, against a policy minimum of ${cashT.warning}.`
                          }
                        />
                        <span className="text-[8px] text-[#060606]">
                          Days of cash · policy ≥ {cashT.warning}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <SheetStats
                          stacked
                          items={[
                            { label: "Ending cash", value: compactMoney(point?.endingCash) },
                            {
                              label: "Days of cash",
                              value:
                                daysCash === null ? NOT_AVAILABLE : `${fmtDays(daysCash)} days`,
                            },
                            { label: "Avg monthly spend", value: compactMoney(avgMonthlySpend) },
                            {
                              label: "Cash % of expenditures",
                              value: percent(cashPctOfSpend, 1),
                            },
                          ]}
                        />
                      </div>
                    </div>
                    {/* The five-figure cash walk, as the screen's strip under the gauge. */}
                    <SheetStats
                      items={[
                        { label: "Beginning", value: compactMoney(flow.beginningCash) },
                        {
                          label: "Receipts (YTD)",
                          value: compactMoney(flow.receipts),
                          tone: "positive",
                        },
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
                  </SheetCard>

                  {/* THE CARD THE ONE-PAGE SHEET DROPPED. The Alerts KPI tile prints a count
                      on page one; without this the packet never said what was counted. */}
                  <SheetCard
                    title={`Alerts (${alerts?.alerts.length ?? 0})`}
                    note={
                      alerts && alerts.criticalCount > 0
                        ? `${alerts.criticalCount} critical`
                        : "Against the district's own thresholds"
                    }
                  >
                    <SheetStats
                      items={[
                        {
                          label: "Critical",
                          value: String(alerts?.criticalCount ?? 0),
                          tone: (alerts?.criticalCount ?? 0) > 0 ? "negative" : "neutral",
                        },
                        { label: "Warning", value: String(alerts?.warningCount ?? 0) },
                        {
                          label: "Informational",
                          value: String(alerts?.informationalCount ?? 0),
                        },
                      ]}
                    />
                    <AlertList
                      mode={scope.labelMode}
                      // Six is what the band holds at a legible size; the count above states
                      // the whole, and the card says where the rest are.
                      alerts={alertRows.slice(0, 6).map((a) => ({
                        id: a.id,
                        severity: a.severity,
                        title: a.title,
                        message: a.message,
                      }))}
                      empty="No thresholds crossed this period."
                      emptyNote="Every indicator is inside the district's policy bands."
                    />
                    {alertRows.length > 6 && (
                      <p className="text-[8.5px] text-[#060606]">
                        {alertRows.length - 6} further alert
                        {alertRows.length - 6 === 1 ? "" : "s"} on the Alerts dashboard.
                      </p>
                    )}
                  </SheetCard>
                </SheetBand>
              </>
            ),
          },
        ]}
      />
    );
  }

  return (
    <div className="animate-fade-up space-y-[18px]">
      {/* Arms the entrance animations: stamps `.in` on every [data-reveal] card as it
          first scrolls into view. Charts stay Server Components; this is the only JS. */}
      <RevealManager />
      <PageHeader
        title="Executive Dashboard"
        description="Financial summary and key indicators of fiscal health."
        actions={
          <DashboardFilters
            scope={scope}
            exportHref={options.exportHref("/dashboard/export")}
            summaryHref={summaryHref}
          />
        }
      />

      {scope.substituted && (
        <SubstitutionNotice asked={scope.substituted.asked} showing={scope.substituted.showing} />
      )}

      {/* ---------- §3.1 KPI row ---------- */}
      {kpis}

      {/*
        The widget band, directly under the tiles it restates. Placed here and not further
        down because it is the same altitude as the KPI row — one figure each, no drill-down
        — and a reader who has just taken in six tiles is answering "so where does that
        leave us?", which is what these three say. The analysis cards below start asking
        narrower questions.
      */}
      {widgetRow}

      {/* ---------- §3.2/3.3 the budget comparisons, with the alerts rail beside them ---------- */}
      {/* The 64:5751 canvas: the 812px revenue card with the 273px Alerts Summary standing
          beside it — 812:273 is the 2.974fr — and the expenditures card on the next row of
          the same left column, nothing beside it. `items-stretch` sizes the rail to the
          revenue card alone, which is what lets its mt-auto footer sit at that card's foot. */}
      <div className="grid grid-cols-1 items-stretch gap-2.5 xl:grid-cols-[minmax(0,2.974fr)_minmax(0,1fr)]">
        {revenueCard}
        {alertsCard}
        {expenditureCard}
      </div>

      {/* ---------- §3.2b/c — the trend and cash cards, sharing one row (64:6543 / 64:6596) ---------- */}
      {/* The design sets the two 540px cards side by side on a 14px gutter; each runs its
          compact anatomy — slim metric rail, small-type strip — below xl they stack. */}
      <div className="grid grid-cols-1 items-stretch gap-[14px] xl:grid-cols-2">
        {fundBalanceCard}
        {cashCard}
      </div>

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
