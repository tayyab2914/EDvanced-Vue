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
import { KpiTile, KpiRow } from "@/components/dashboard/kpi-tile";
import { SectionCard, DataAsOf, FooterInfoBar } from "@/components/dashboard/section-card";
import { DataTable } from "@/components/dashboard/data-table";
import { AlertSummary, InsightList } from "@/components/dashboard/alert-list";
import { StatusBadge } from "@/components/dashboard/status-badge";
import {
  EmptyState,
  SubstitutionNotice,
  Row,
  KeyInsightBar,
  FundLevelOnly,
} from "@/components/dashboard/shared";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { LineChart } from "@/components/dashboard/charts/line-chart";
import { BudgetBars, MetricStrip } from "@/components/dashboard/charts/budget-bars";
import { DonutChart } from "@/components/dashboard/charts/donut-chart";
import { HalfDonut } from "@/components/dashboard/charts/half-donut";
import { Gauge } from "@/components/dashboard/charts/gauge";
import { VIZ } from "@/lib/dashboard/palette";
import { Sparkline } from "@/components/dashboard/charts/sparkline";
import { scopeOptions, alertFunds, scopeDescription } from "@/lib/dashboard/options";
import {
  PrintSheet,
  SheetBand,
  SheetCard,
  SheetKpi,
  SheetStats,
} from "@/components/dashboard/print-sheet";
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

  const fundBalanceMetrics = isGeneralFund
    ? [
        { label: "Ending fund balance", value: compactMoney(endingFundBalance) },
        {
          label: "Unassigned fund balance",
          value: compactMoney(point?.unassignedFundBalance),
          note: reservePct === null ? undefined : `${percent(reservePct)} ${reserveOf}`,
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
      : `${reserveSubject(reserve)} is ${percent(reservePct)} ${reserveOf}, which is ${
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
      label: "Total revenues (YTD)",
      value: compactMoney(point?.revenueYtd),
      sub:
        point && toNumber(point.revenueBudget)
          ? `${percent(((toNumber(point.revenueYtd) ?? 0) / (toNumber(point.revenueBudget) || 1)) * 100)} of annual budget collected`
          : "No revenue budget uploaded",
      note: revVarPct === null ? undefined : `${signedPercent(revVarPct)} vs budget to date`,
      tone: revVarPct === null ? ("neutral" as const) : sheetTone(deltaTone(revVarPct, "up")),
      icon: "dollar" as const,
      tileTone: "green" as const,
      href: "/revenues",
      delta:
        revVarPct === null
          ? undefined
          : {
              text: signedPercent(revVarPct),
              tone: deltaTone(revVarPct, "up"),
              direction: (revVarPct < 0 ? "down" : revVarPct > 0 ? "up" : "flat") as
                | "down"
                | "up"
                | "flat",
              note: "vs budget to date",
            },
    },
    {
      key: "expenditures",
      label: "Total expenditures (YTD)",
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
      label: "Days of operating cash",
      value: daysCash === null ? NOT_AVAILABLE : fmtDays(daysCash),
      sub: "Days of cash on hand",
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
      label: "Available budget",
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

  const kpis = (
    <KpiRow count={6}>
      {kpiData.map((k) => (
        <KpiTile
          key={k.key}
          icon={k.icon}
          tone={k.tileTone}
          label={k.label}
          value={k.value}
          sub={k.sub}
          delta={k.delta}
          status={k.status}
          statusNote={k.statusNote}
          unavailableReason={k.unavailableReason}
          // The tile is the client's "Go to Dashboard", and it carries the slice the tile
          // was computed over — a figure filtered to two funds must open a dashboard
          // filtered to the same two, or the drill-down contradicts the number clicked.
          href={k.href ? options.link(k.href) : undefined}
          hrefLabel={k.href ? GO_TO_DASHBOARD_SHORT : undefined}
        />
      ))}
    </KpiRow>
  );

  const revenueCard = (
    <SectionCard
      title="Revenues vs budget (YTD)"
      subtitle="Top five revenue sources compared to expected YTD collections"
      footer={GO_TO.revenues}
      footerHref={options.link("/revenues")}
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
      subtitle="By object, compared to expected YTD expenses"
      footer={GO_TO.expenditures}
      footerHref={options.link("/expenditures")}
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

  /**
   * The budget donut — where the full-year expenditure budget currently stands.
   *
   * Three states, one figure each, and the client's word for the middle one is ENCUMBERED
   * rather than "committed". Worth honouring precisely: "committed" is already a fund
   * balance CLASSIFICATION in this product (see COMPONENT_COLORS in lib/dashboard/palette.ts
   * and the Fund Balance dashboard), so a donut labelling purchase orders "Committed" would
   * collide with a term the same reader meets two screens away meaning something else.
   */
  const budgetStatusCard = (
    <SectionCard
      title="Budget status"
      subtitle="The full-year expenditure budget, and what is left of it"
      info="Expended is spending to date, Encumbered is committed but not yet paid, and Remaining is the budget still uncommitted. The three sum to the full-year budget."
      footer={GO_TO.expenditures}
      footerHref={options.link("/expenditures")}
    >
      <DonutChart
        title="Budget status"
        summary={
          budgetTotal > 0
            ? `Of a ${compactMoney(budgetTotal)} expenditure budget, ${compactMoney(expended)} has been expended and ${compactMoney(encumbered)} encumbered, leaving ${accounting(availableBudget, { compact: true })} remaining.`
            : "No expenditure budget has been adopted for this period."
        }
        size={210}
        centerValue={budgetTotal > 0 ? compactMoney(budgetTotal) : NOT_AVAILABLE}
        centerLabel="Total budget"
        shareOf={budgetTotal}
        slices={[
          {
            label: "Expended",
            value: expended,
            color: VIZ.actual,
            display: compactMoney(expended),
          },
          {
            label: "Encumbered",
            value: encumbered,
            // The purple the Encumbrances tile on the Expenditures dashboard already wears.
            color: "var(--color-viz-4)",
            display: compactMoney(encumbered),
          },
          {
            label: "Remaining",
            value: Math.max(0, availableBudget),
            color: VIZ.reference,
            display: accounting(availableBudget, { compact: true }),
          },
        ]}
      />
      {overcommitted && (
        <div className="mt-4">
          <KeyInsightBar tone="action">
            Spending and encumbrances exceed the full-year budget by{" "}
            {compactMoney(Math.abs(availableBudget))}, so there is no remaining budget to draw.
          </KeyInsightBar>
        </div>
      )}
    </SectionCard>
  );

  /**
   * Revenues collected — the same shape, cut in half because it measures PROGRESS.
   *
   * Against the full-year revenue budget, not the budget expected by now. The two questions
   * sit side by side on this page and must not be confused: the Revenues KPI tile and the
   * "Revenues vs budget (YTD)" card both judge PACE, which is what the district's variance
   * policy is set against and what raises an alert. This widget answers the simpler thing a
   * board asks — how much of the year's money is in — and 79% in month nine is a fact, not a
   * verdict, which is why nothing here is coloured by a threshold.
   */
  const revenueCollectedCard = (
    <SectionCard
      title="Revenues collected"
      subtitle="Against the full-year revenue budget"
      info="Collections to date as a share of the adopted revenue budget for the whole year. This is not the pace comparison — see Revenues vs budget for whether collections are on track for the point in the year."
      footer={GO_TO.revenues}
      footerHref={options.link("/revenues")}
    >
      <HalfDonut
        title="Revenues collected"
        summary={
          collectedPct === null
            ? "No revenue budget has been adopted for this period."
            : `${compactMoney(collected)} collected of a ${compactMoney(revenueBudgetTotal)} revenue budget, or ${percent(collectedPct)}.`
        }
        size={225}
        centerValue={compactMoney(collected)}
        centerNote={revenueBudgetTotal > 0 ? `of ${compactMoney(revenueBudgetTotal)}` : undefined}
        centerPercent={collectedPct === null ? undefined : percent(collectedPct, 0)}
        shareOf={revenueBudgetTotal}
        segments={[
          {
            label: "Collected",
            value: collected,
            color: VIZ.actual,
            display: compactMoney(collected),
          },
          {
            label: "Remaining",
            value: uncollected,
            color: VIZ.reference,
            display: compactMoney(uncollected),
          },
        ]}
      />
    </SectionCard>
  );

  const fundBalanceCard = (
    <SectionCard
      title="Fund balance trend"
      subtitle={scopeDescription(scope)}
      badge={
        scope.fundLevelOnly ? (
          <FundLevelOnly what="Fund balance is" />
        ) : isGeneralFund ? (
          <StatusBadge status={reserveRung} size="sm" className="uppercase" />
        ) : (
          <span className="rounded-full border border-line bg-panel px-2 py-[2px] text-[9.5px] font-medium normal-case tracking-normal text-muted-2">
            Policy targets apply to the General Fund only
          </span>
        )
      }
      footer={GO_TO.fundBalance}
      footerHref={options.link("/fund-balance")}
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
      badge={scope.fundLevelOnly ? <FundLevelOnly what="Cash is" /> : undefined}
      footer={GO_TO.cash}
      footerHref={options.link("/cash")}
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
      footer={GO_TO.policies}
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
    <SectionCard title="Key insights" footer={GO_TO.alerts} footerHref={options.link("/alerts")}>
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
      footer={GO_TO.alerts}
      footerHref={options.link("/alerts")}
    >
      <AlertSummary
        alerts={alertRows}
        critical={alerts?.criticalCount ?? 0}
        warning={alerts?.warningCount ?? 0}
        informational={alerts?.informationalCount ?? 0}
        href={options.link("/alerts")}
      />
    </SectionCard>
  );

  // ===================== the one-page landscape summary =====================
  //
  // NOT the dashboard with tighter padding. The bands below are chosen for a 990px canvas
  // and nothing else: the two budget charts get a half-width column each because their
  // fixed label / reference / status columns leave a three-up layout roughly 8px of actual
  // bar to draw in — which is how the previous summary managed to print a chart with no
  // chart in it. Everything the screen version showed is still here.
  if (summary) {
    return (
      <PrintSheet
        title="Executive Summary"
        district={user.districtName ?? "District"}
        scope={sheetScope(scope)}
        asOf={sheetAsOf(scope.dataAsOf)}
        backHref={options.query ? `/dashboard?${options.query}` : "/dashboard"}
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

        <SheetBand cols="1fr 1fr">
          <SheetCard title="Revenues vs budget (YTD)" note="Five largest sources">
            <BudgetBars
              title="Revenues against budget"
              summary="Actual year-to-date revenue against the budget expected by now and the full-year budget, for the five largest sources."
              rows={revenueRows}
              format={(v) => compactMoney(v, 0)}
            />
          </SheetCard>

          <SheetCard title="Expenditures vs budget (YTD)" note="By object">
            <BudgetBars
              title="Expenditures against budget"
              summary="Actual year-to-date spending against the budget expected by now and the full-year budget, by object type."
              rows={expenditureRows}
              format={(v) => compactMoney(v, 0)}
            />
          </SheetCard>
        </SheetBand>

        <SheetBand cols="1.05fr 1.25fr 0.9fr">
          <SheetCard
            title="Fund balance trend"
            badge={
              isGeneralFund ? <StatusBadge status={reserveRung} size="sm" dot={false} /> : undefined
            }
            note={scope.fund ? scope.fund.name : "All funds"}
          >
            <LineChart
              title="Fund balance trend"
              summary={`Total and unassigned fund balance by month for fiscal year ${scope.fiscalYear}.`}
              categories={labels}
              format={(v) => compactMoney(v, 0)}
              height={250}
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
                      { label: "Unassigned", value: compactMoney(point?.unassignedFundBalance) },
                      { label: "Target", value: `${reserveT.target.toFixed(2)}%` },
                      { label: "Minimum", value: `${statutoryMinimum.toFixed(2)}%` },
                    ]
                  : [
                      { label: "Ending", value: compactMoney(endingFundBalance) },
                      { label: "Opening", value: compactMoney(openingFundBalance) },
                      {
                        label: "Change",
                        value: accounting(fbChange, { compact: true }),
                        tone: fbChange?.isNegative() ? ("negative" as const) : ("positive" as const),
                      },
                    ]
              }
            />
          </SheetCard>

          <SheetCard title="Financial health summary" note="Against policy targets">
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

          <SheetCard title="Key insights">
            {insights.length > 0 ? (
              // Four, not all of them. The sheet is a fixed page and an unbounded list is
              // the one thing on it that can grow without limit; the rest are on /alerts.
              <InsightList insights={insights.slice(0, 4)} layout="column" />
            ) : (
              <p className="py-3 text-center text-[9.5px] text-muted-2">
                Nothing stands out this period.
              </p>
            )}
          </SheetCard>
        </SheetBand>
      </PrintSheet>
    );
  }

  return (
    <div className="animate-fade-up space-y-[18px]">
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
      <DataAsOf date={scope.dataAsOf} note={scopeDescription(scope)} />

      {/* ---------- §3.1 KPI row ---------- */}
      {kpis}

      {/*
        The two composition widgets, directly under the tiles they restate. Placed here and
        not further down because they are the same altitude as the KPI row — one figure each,
        no drill-down — and a reader who has just taken in six tiles is answering "so where
        does that leave us?", which is what these two say. The analysis cards below start
        asking narrower questions.
      */}
      <Row cols="2">
        {budgetStatusCard}
        {revenueCollectedCard}
      </Row>

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
