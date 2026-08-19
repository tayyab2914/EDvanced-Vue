import { redirect } from "next/navigation";
import { getTenantDb, userCan } from "@/lib/auth/dal";
import { resolveScope } from "@/lib/dashboard/scope";
import {
  loadCore,
  utilisationThresholds,
  expenditureForecastThresholds,
  periodAxisLabels,
} from "@/lib/dashboard/load";
import {
  expenditureByFunction,
  expenditureByFunctionAndFund,
  expenditureByFunctionType,
  expenditureByObjectType,
  expenditureByCostCenterType,
  expenditureByProject,
  topMovers,
  foldTail,
  rankBySize,
  inChartOrder,
  type BreakdownRow,
} from "@/lib/finance/breakdown";
import { ladder } from "@/lib/dashboard/status";
import { expenditurePace, approachingCeiling } from "@/lib/dashboard/pace";
import {
  compactMoney,
  accounting,
  percent,
  pctRule,
  signedPercent,
  toNumber,
  deltaTone,
  changePercent,
  sharePercent,
} from "@/lib/dashboard/format";
import { PageHeader } from "@/components/page-header";
import { DataTable, MoverList } from "@/components/dashboard/data-table";
import { AlertList } from "@/components/dashboard/alert-list";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { EmptyState, SubstitutionNotice } from "@/components/dashboard/shared";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { LineChart } from "@/components/dashboard/charts/line-chart";
import { ColumnChart } from "@/components/dashboard/charts/column-chart";
import { ShareBars } from "@/components/dashboard/charts/budget-bars";
import {
  OverviewKpiTile,
  OverviewSection,
  OverviewTileRow,
} from "@/components/dashboard/overview-kpi";
import { OverviewPeriodSelect } from "@/components/dashboard/overview-period-select";
import { RevealManager } from "@/components/reveal";
import { ExpenditureStatusStrip } from "@/components/dashboard/expenditure-status-strip";
import {
  ExpenditureBreakdownSection,
  type BreakdownTableRow,
  type BreakdownBarRow,
} from "@/components/dashboard/expenditure-breakdown";
import {
  ExpenditureFunctionTable,
  type FunctionRow,
} from "@/components/dashboard/expenditure-function-table";
import { ExpenditureUtilizationCard } from "@/components/dashboard/expenditure-utilization-card";
import { RevenueTrendCard } from "@/components/dashboard/revenue-trend-card";
import { RevenueMoversCard, type MoverItem } from "@/components/dashboard/revenue-movers";
import { RevenueInsightCard } from "@/components/dashboard/revenue-insight-card";
import { RevenueAlertsCard } from "@/components/dashboard/revenue-alerts-card";
import { scopeOptions, moverFund, alertFunds } from "@/lib/dashboard/options";
import { GO_TO, VIEW_DETAILS } from "@/lib/dashboard/cta";
import { SERIES_SLOTS } from "@/lib/dashboard/palette";
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
import { codeName } from "@/lib/text";
import { labelMode } from "@/lib/dashboard/label-mode";
import { EXPENDITURE_VIEWS, resolveView, type ExpenditureView } from "@/lib/dashboard/view";

/**
 * How the "view by" band presents each perspective.
 *
 * ---------------------------------------------------------------------------
 * THE CLIENT'S RULE FOR THIS CARD, IN THEIR OWN WORDS
 *
 *   "Object — good, no change. Function — hide Function Number leaving Function Type, sort
 *   ascending by Function Number like Objects. Cost Center Type — hide Cost Center Number
 *   leaving Type, sort ascending by Cost Center Number like Objects. Project — hide Project
 *   Number, sort ascending by Project Number like Objects."
 *
 * Object was already right, and the three notes are all asking the other three to become it.
 * So the rule is one rule, applied four times: THIS CARD GROUPS, NAMES THE GROUP, AND ORDERS
 * ASCENDING BY THE NUMBER IT DOES NOT SHOW.
 *
 *   Grouped — `function` folds to Function Type the way `object` folds to Object Type
 *   (lib/finance/breakdown.ts `expenditureByFunctionType`). "Hide the number leaving the
 *   type" is not a formatting request on a table of thirty accounts; it is a request for the
 *   altitude the Object view already reads at.
 *
 *   Named — the number is dropped from the visible label (`rowLabel`, below) and kept in
 *   the hover, so the band reads as words and the ordering can still be checked.
 *
 *   Ascending — chart-of-accounts order, never by size, so the sequence is the same every
 *   month. That is what `order: "chart"` buys, and for the one dimension that must also be
 *   capped it is `inChartOrder` applied after the fold.
 * ---------------------------------------------------------------------------
 *
 * `ranked` is the only entry still doing real work, and only Project sets it. Object types,
 * function types and cost centre types are BOUNDED classification lookups — seven, a handful
 * and a couple of dozen — so each reads best complete, in its own order. Projects are
 * UNBOUNDED: a district can carry hundreds, and a share band with hundreds of bars is not a
 * band. That view ranks by size to choose WHICH rows it shows, folds the tail into "Other"
 * (which is also what keeps the six categorical colour slots honest), and then puts what
 * survived back into ascending project-number order, because the choosing and the ordering
 * are answering two different questions.
 *
 * The full function list is untouched and still sits one row down, in Function Type Code
 * order with every account and its number named, because that is the reference table the
 * client asked for and this is not it.
 */
const VIEW_META: Record<
  ExpenditureView,
  { title: string; subtitle: string; column: string; ranked: boolean }
> = {
  object: {
    title: "Expenditures by object (YTD)",
    subtitle: "Salaries, benefits, services, supplies and capital",
    column: "Object",
    ranked: false,
  },
  function: {
    title: "Expenditures by function (YTD)",
    subtitle: "Grouped by function type — the full list, in code order, is below",
    column: "Function",
    ranked: false,
  },
  costCenterType: {
    title: "Expenditures by cost center type (YTD)",
    subtitle: "Schools, departments and operations",
    column: "Cost center type",
    ranked: false,
  },
  project: {
    title: "Expenditures by project (YTD)",
    subtitle: "The Project / Grant column on the expenditure detail",
    column: "Project",
    ranked: true,
  },
};

/**
 * A row's dimension as the view-by band labels it — the name, never the number.
 *
 * One helper for all four views rather than a per-view `hideCode`, because the client's note
 * was not four separate requests: Object already read as a list of names, and Function, Cost
 * Center Type and Project were each asked to match it. The number is not thrown away, only
 * unshown: it orders the rows, and it is on the hover, so a reader asking "why is this row
 * here" has an answer. The REFERENCE table further down is untouched and still leads with
 * the code, honouring the reader's Codes / Names setting.
 */
const rowLabel = (r: BreakdownRow) => r.name;

/**
 * The Expenditures dashboard (Spec §5) — spending against budget, on the redesign's
 * Overview band + card grid (Figma 55:2921), the same construction as the Revenue and
 * Executive redesigns.
 *
 * The three M4 requests all land on the by-function table, and each is answered by a
 * different channel rather than three shades of the same one:
 *
 *   "Functions listed based on the Function Type Code" — the table is ordered by chart of
 *   accounts (lib/finance/breakdown.ts `byChartOrder`), not by size.
 *
 *   "Make overspending easier to identify visually" — an overspent row's Available figure
 *   is red and bold, and it carries an Overspent pill on the red rung.
 *
 *   "Highlight functions approaching their budget threshold" — a separate, quieter flag
 *   (`approachingCeiling`) lettered "Approaching" on the amber rung.
 */
export default async function ExpenditureDashboard({
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
  const summary = sp.view === "summary";
  const scope = await resolveScope(db, districtId, sp, await labelMode());
  const view = resolveView(EXPENDITURE_VIEWS, sp.groupBy);
  const meta = VIEW_META[view];

  if (scope.empty) {
    return (
      <div className="animate-fade-up space-y-[18px]">
        <PageHeader title="Expenditures" description="Track spending performance against budget." />
        <EmptyState title="No expenditure data yet" action="Upload expenditure detail" href="/data/upload">
          Upload an expenditure detail file and this dashboard will show spending, encumbrances
          and available budget by function and object.
        </EmptyState>
      </div>
    );
  }

  const core = await loadCore(db, districtId, scope);
  const { series, point, previous, policy, alerts } = core;
  const version = core.versions.get("EXPENDITURE_DETAIL");

  if (!version) {
    return (
      <div className="animate-fade-up space-y-[18px]">
        <PageHeader title="Expenditures" description="Track spending performance against budget." />
        <EmptyState title={`No expenditure detail for ${scope.label}`} action="Upload expenditure detail" href="/data/upload">
          Other periods may have data — use the period selector, or upload this one.
        </EmptyState>
      </div>
    );
  }

  const args = { versionId: version, filter: scope.filter, periodsElapsed: scope.period };
  const [byFunction, regrouped, byFunctionAndFund] = await Promise.all([
    // Chart-of-accounts order, at the client's request.
    expenditureByFunction(db, { ...args, order: "chart" }),
    // The "view by" band's aggregate — one grouped query per perspective, chart-ordered in
    // the database rather than re-sorted here.
    //
    // `function` is no longer served by re-sorting the by-function breakdown loaded above it:
    // that breakdown is the account-grain REFERENCE table, and this band folds to Function
    // Type at the client's request. Two different altitudes, so two queries — the roll-up is
    // one grouped aggregate plus a lookup of a handful of types, which is the cheapest thing
    // on this page.
    view === "object"
      ? expenditureByObjectType(db, { ...args, order: "chart" })
      : view === "function"
        ? expenditureByFunctionType(db, { ...args, order: "chart" })
        : view === "costCenterType"
          ? expenditureByCostCenterType(db, { ...args, order: "chart" })
          : expenditureByProject(db, args),
    /**
     * The movers' own aggregate, at fund × function grain — and only on the All Funds view.
     *
     * `byFunction` sums a function across every fund, so "2500 — Central Services, over by
     * $1.2M" was true of the district and silent about which fund to open. With a single
     * fund selected it already IS this grain, so nothing is asked for. The argument in full
     * is on `expenditureByFunctionAndFund` in lib/finance/breakdown.ts.
     */
    scope.fundId ? Promise.resolve(null) : expenditureByFunctionAndFund(db, args),
  ]);

  /**
   * Rank, fold, THEN order — see `rankBySize` and `inChartOrder` in lib/finance/breakdown.ts.
   *
   * Only the unbounded dimension takes this path, and it takes all three steps because the
   * client asked for two things a single sort cannot give: a band short enough to read, and
   * rows in ascending number order. Ranking chooses which rows survive (so "Other" really is
   * the small ones), folding caps the list, and ordering decides how the survivors read. The
   * bounded dimensions are already complete and chart-ordered by the query.
   */
  const grouped = meta.ranked
    ? inChartOrder(foldTail(rankBySize(regrouped), scope.period, 5))
    : regrouped;
  // Movers still rank by size — that card exists to answer "what moved most", and chart
  // order would answer "what comes first in the ledger", which nobody asked.
  const movers = topMovers(byFunctionAndFund ?? byFunction, 4);

  const utilT = utilisationThresholds(policy);
  const fcT = expenditureForecastThresholds(policy);

  const utilPct = toNumber(byFunction.total.utilisation.percent);
  const varPct = toNumber(byFunction.total.pace.percent);
  const momPct = changePercent(point?.expenditureMtd, previous?.expenditureMtd);
  const utilRung = ladder(utilPct, utilT);
  const totalPace = expenditurePace(varPct, fcT);
  const consumptionPct = toNumber(byFunction.total.consumption.percent);

  const labels = periodAxisLabels(scope, series.points.length);
  const fullYearBudget = toNumber(byFunction.total.budget) ?? 0;
  const options = scopeOptions(scope);
  const expenditureAlerts = (alerts?.alerts ?? []).filter((a) => a.group === "expenditure");
  const summaryHref = options.query
    ? `/expenditures?${options.query}&view=summary`
    : "/expenditures?view=summary";

  // ---------- the sheet's six headline figures ----------
  // Same derived totals the screen tiles above read; only the presentation differs. See the
  // note on `SheetKpi` for why the printed tile is its own component.
  const kpiData = [
    {
      key: "total",
      label: "Expenditures (YTD)",
      value: compactMoney(byFunction.total.actualYtd),
      sub: `${percent(byFunction.total.consumption.percent)} of full-year budget`,
      note: undefined,
      tone: "neutral" as const,
    },
    {
      key: "utilisation",
      label: "Budget Utilization",
      value: percent(byFunction.total.utilisation.percent),
      sub: "spent + committed",
      note: `${utilRung} · warning ≥ ${pctRule(utilT.warning)}`,
      tone: rungTone(utilRung),
    },
    {
      key: "available",
      label: "Available Budget",
      value: accounting(byFunction.total.available, { compact: true }),
      sub: `of ${compactMoney(byFunction.total.budget)} budgeted`,
      note: byFunction.total.available.isNegative()
        ? "Overcommitted"
        : `${percent(sharePercent(byFunction.total.available, byFunction.total.budget))} remaining`,
      tone: byFunction.total.available.isNegative()
        ? ("negative" as const)
        : ("positive" as const),
    },
    {
      key: "encumbrances",
      label: "Encumbrances",
      value: compactMoney(byFunction.total.encumbrances),
      sub: "committed, not yet spent",
      note: `${percent(sharePercent(byFunction.total.encumbrances, byFunction.total.budget), 1)} of budget`,
      tone: "neutral" as const,
    },
    {
      key: "mom",
      label: "Change from Prior Month",
      value: compactMoney(point?.expenditureMtd),
      sub: "spent this period",
      note:
        momPct === null
          ? previous
            ? undefined
            : "no earlier period"
          : `${percent(Math.abs(momPct))} ${momPct < 0 ? "decrease" : "increase"}`,
      tone: momPct === null ? ("neutral" as const) : sheetTone(deltaTone(momPct, "down")),
    },
    {
      key: "status",
      label: "Expenditure Status (YTD)",
      value: totalPace.label === "N/A" ? "Not available" : totalPace.label,
      sub:
        varPct === null
          ? "needs an expenditure budget"
          : `${percent(Math.abs(varPct))} ${varPct < 0 ? "below" : "above"} expected spending`,
      note: `Target ± ${pctRule(fcT.warning)}`,
      tone: rungTone(totalPace.rung),
    },
  ];

  /**
   * The monthly utilisation series — spend plus encumbrances against that month's budget.
   * Feeds the screen's utilization trend card AND the printed summary's, so the two cannot
   * disagree. A month with no budget draws no bar rather than a fake zero.
   */
  const monthlyUtilization: (number | null)[] = series.points.map((p) => {
    if (!p.hasData) return null;
    const b = toNumber(p.expenditureBudget) ?? 0;
    if (!b) return null;
    const a = toNumber(p.expenditureYtd) ?? 0;
    const e = toNumber(p.encumbrances) ?? 0;
    return ((a + e) / b) * 100;
  });

  // ===================== the two-page landscape summary =====================
  //
  // Page one is the position: the six figures, spending against budget, the chosen breakdown
  // and the by-function ledger. Page two is the diagnosis — utilization month by month
  // against the district's warning and critical lines, which functions moved, and what has
  // crossed a threshold. The one-page version printed none of those three.
  if (summary) {
    return (
      <PrintSheet
        title="Expenditure Summary"
        district={user.districtName ?? "District"}
        scope={sheetScope(scope)}
        asOf={sheetAsOf(scope.dataAsOf)}
        backHref={options.query ? `/expenditures?${options.query}` : "/expenditures"}
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

        <SheetBand cols="1fr 1fr">
          <SheetCard title="Expenditures — budget vs actual" note={`Through ${scope.label}`}>
            <LineChart
              title="Expenditures, budget against actual"
              summary={`Actual spending year to date against the budget expected by now, for fiscal year ${scope.fiscalYear}.`}
              categories={labels}
              format={(v) => compactMoney(v, 0)}
              height={210}
              series={[
                {
                  key: "actual",
                  label: "Actual (YTD)",
                  color: "var(--color-viz-actual)",
                  labelLast: true,
                  points: series.points.map((p) => ({
                    value: toNumber(p.expenditureYtd),
                    label: compactMoney(p.expenditureYtd),
                  })),
                },
                {
                  key: "budget",
                  label: "Budget (YTD)",
                  color: "var(--color-viz-budget)",
                  points: series.points.map((p) => ({
                    value: p.hasData
                      ? ((toNumber(p.expenditureBudget) ?? 0) * p.period) / 12
                      : null,
                  })),
                },
                {
                  key: "full",
                  label: "Budget (full year)",
                  color: "var(--color-viz-reference)",
                  dashed: true,
                  markers: false,
                  points: series.points.map(() => ({ value: fullYearBudget })),
                },
              ]}
            />
            <SheetStats
              items={[
                { label: "Actual (YTD)", value: compactMoney(byFunction.total.actualYtd) },
                { label: "Budget (YTD)", value: compactMoney(byFunction.total.pace.budget) },
                {
                  label: "Variance (YTD)",
                  value: accounting(byFunction.total.pace.amount, { compact: true }),
                  // Spending BELOW pace is the good sign here, the opposite of revenue —
                  // polarity is per-figure, never per-colour.
                  tone: byFunction.total.pace.amount.isNegative() ? "positive" : "negative",
                },
                {
                  label: "Available",
                  value: accounting(byFunction.total.available, { compact: true }),
                  tone: byFunction.total.available.isNegative() ? "negative" : "positive",
                },
              ]}
            />
          </SheetCard>

          <SheetCard title={meta.title} note={meta.subtitle}>
            <ShareBars
              title={meta.title}
              summary={`Share of year-to-date spending by ${meta.column.toLowerCase()}.`}
              rows={grouped.rows.map((r, i) => ({
                id: r.id,
                label: rowLabel(r),
                value: toNumber(r.actualYtd) ?? 0,
                display: compactMoney(r.actualYtd),
                share: percent(sharePercent(r.actualYtd, grouped.total.actualYtd), 1),
                color: SERIES_SLOTS[i % SERIES_SLOTS.length],
              }))}
            />
            {/* Encumbered and Available carried onto the sheet as well, so the printed
                summary of this band says what the screen version of it now says. */}
            <SheetStats
              items={[
                { label: "Total actual", value: compactMoney(grouped.total.actualYtd) },
                { label: "Total budget", value: compactMoney(grouped.total.budget) },
                { label: "Encumbered", value: compactMoney(grouped.total.encumbrances) },
                {
                  label: "Available",
                  value: accounting(grouped.total.available, { compact: true }),
                  tone: grouped.total.available.isNegative()
                    ? ("negative" as const)
                    : ("neutral" as const),
                },
                { label: "Utilized", value: percent(grouped.total.utilisation.percent) },
              ]}
            />
          </SheetCard>
        </SheetBand>

        <SheetBand cols="1fr">
          <SheetCard
            title="Expenditures by function (YTD)"
            note={
              byFunction.rows.length > SHEET_TABLE_ROWS
                ? sheetTableNote(SHEET_TABLE_ROWS)
                : `Through ${scope.label}`
            }
          >
            <DataTable
              dense
              columns={[
                { key: "fn", label: "Function" },
                { key: "budget", label: "Budget", align: "right" },
                { key: "actual", label: "Actual (YTD)", align: "right" },
                { key: "enc", label: "Encumbered", align: "right" },
                { key: "avail", label: "Available", align: "right" },
                { key: "util", label: "Utilized", align: "right" },
                { key: "status", label: "Status", align: "right" },
              ]}
              rows={byFunction.rows.slice(0, SHEET_TABLE_ROWS).map((r) => {
                const rowUtil = toNumber(r.utilisation.percent);
                const rowRung = ladder(rowUtil, utilT);
                const overspent = r.available.isNegative() || rowRung === "Action Required";
                const nearing = !overspent && approachingCeiling(rowUtil, utilT);
                const pace = expenditurePace(toNumber(r.pace.percent), fcT);
                return {
                  id: r.id,
                  flag: overspent
                    ? ("negative" as const)
                    : nearing
                      ? ("warning" as const)
                      : undefined,
                  cells: {
                    fn: { value: codeName(r.code, r.name, scope.labelMode), strong: true },
                    budget: compactMoney(r.budget),
                    actual: compactMoney(r.actualYtd),
                    enc: compactMoney(r.encumbrances),
                    avail: {
                      value: accounting(r.available, { compact: true }),
                      tone: r.available.isNegative() ? ("negative" as const) : ("neutral" as const),
                    },
                    util: percent(r.utilisation.percent),
                    status: (
                      <span className="flex justify-end">
                        <StatusBadge
                          status={overspent ? "Action Required" : nearing ? "Monitor" : pace.rung}
                          label={overspent ? "Overspent" : nearing ? "Approaching" : pace.label}
                          size="sm"
                          dot={false}
                        />
                      </span>
                    ),
                  },
                };
              })}
              total={{
                id: "total",
                total: true,
                cells: {
                  fn: "Total expenditures",
                  budget: compactMoney(byFunction.total.budget),
                  actual: compactMoney(byFunction.total.actualYtd),
                  enc: compactMoney(byFunction.total.encumbrances),
                  avail: accounting(byFunction.total.available, { compact: true }),
                  util: percent(byFunction.total.utilisation.percent),
                  status: (
                    <span className="flex justify-end">
                      <StatusBadge status={utilRung} size="sm" dot={false} />
                    </span>
                  ),
                },
              }}
            />
          </SheetCard>
        </SheetBand>
              </>
            ),
          },
          {
            label: "Utilization detail & alerts",
            content: (
              <>
                <SheetBand cols="1.5fr 1fr 1fr">
                  {/* Utilization against the district's OWN warning and critical lines — the
                      chart the one-page sheet had no room for, and the one that says whether
                      the year is tracking to overspend rather than what it has spent. */}
                  <SheetCard
                    title="Budget utilization trend"
                    note={`Warning ≥ ${pctRule(utilT.warning)} · critical ≥ ${pctRule(utilT.critical)}`}
                  >
                    <ColumnChart
                      mode="threshold"
                      title="Budget utilization trend"
                      summary={`Budget utilization each month against warning at ${utilT.warning}% and critical at ${utilT.critical}%.`}
                      height={215}
                      format={(v) => `${v.toFixed(0)}%`}
                      columns={labels
                        .map((label, i) => ({ label, value: monthlyUtilization[i] }))
                        .filter((c): c is { label: string; value: number } => c.value !== null)
                        .map((c) => ({ ...c, display: percent(c.value, 1) }))}
                      thresholds={[
                        {
                          at: utilT.warning,
                          label: pctRule(utilT.warning),
                          color: "var(--color-monitor)",
                        },
                        {
                          at: utilT.critical,
                          label: pctRule(utilT.critical),
                          color: "var(--color-action)",
                        },
                      ]}
                    />
                  </SheetCard>

                  {/* Ink follows favourability, not sign — overspend red, underspend green —
                      which is the same polarity the screen's two cards use. */}
                  <SheetCard title="Top positive variances" note="Spending above expected">
                    <MoverList
                      items={movers.positive.map((r) => ({
                        id: r.id,
                        name: codeName(r.code, r.name, scope.labelMode),
                        value: accounting(r.pace.amount, { compact: true }),
                        percent: signedPercent(r.pace.percent),
                        tone: "negative" as const,
                      }))}
                      empty="Nothing is spending ahead of budget."
                    />
                  </SheetCard>

                  <SheetCard title="Top negative variances" note="Spending below expected">
                    <MoverList
                      items={movers.negative.map((r) => ({
                        id: r.id,
                        name: codeName(r.code, r.name, scope.labelMode),
                        value: accounting(r.pace.amount, { compact: true }),
                        percent: signedPercent(r.pace.percent),
                        tone: "positive" as const,
                      }))}
                      empty="Nothing is spending behind budget."
                    />
                  </SheetCard>
                </SheetBand>

                <SheetBand cols="1.35fr 1fr">
                  <SheetCard
                    title={`Expenditure alerts (${expenditureAlerts.length})`}
                    note="Against the district's own thresholds"
                  >
                    <AlertList
                      mode={scope.labelMode}
                      alerts={expenditureAlerts.slice(0, 6).map((a) => ({
                        id: a.id,
                        severity: a.severity,
                        title: a.title,
                        message: a.message,
                      }))}
                      empty="No expenditure thresholds crossed."
                      emptyNote="Utilization is inside the district's policy bands."
                    />
                    {expenditureAlerts.length > 6 && (
                      <p className="text-[8.5px] text-[#060606]">
                        {expenditureAlerts.length - 6} further alert
                        {expenditureAlerts.length - 6 === 1 ? "" : "s"} on the Alerts dashboard.
                      </p>
                    )}
                  </SheetCard>

                  <SheetCard title="Key insight" note="How to read this page">
                    <p className="text-[10px] leading-[1.45] text-[#060606]">
                      Utilization is spending plus encumbrances against the amended budget, so a
                      function can be inside its budget and still be flagged if it has committed
                      the rest of it. The warning and critical lines above are the
                      district&apos;s own, set on the Policies screen. To see how this year&apos;s
                      spending flows through to fund balance and reserves, run the three-year
                      forecast.
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

  // ===================== the redesigned screen (Figma 55:2921) =====================

  const expenditureDetailHref = `/data/expenditure-detail?fy=${scope.fiscalYear}&period=${scope.period}`;

  // ---------- the view-by band's rows, pre-formatted for the client island ----------
  const breakdownRow = (r: BreakdownRow): BreakdownTableRow => {
    const rowUtil = toNumber(r.utilisation.percent);
    return {
      id: r.id,
      label: rowLabel(r),
      // No code on screen, the code on hover — the number put this row where it is, so it
      // belongs in the tooltip even though the client asked for it out of the label.
      note: r.code || undefined,
      budget: compactMoney(r.budget),
      actual: compactMoney(r.actualYtd),
      encumbered: compactMoney(r.encumbrances),
      available: accounting(r.available, { compact: true }),
      availableNegative: r.available.isNegative(),
      utilized: percent(r.utilisation.percent),
      utilizedCritical: ladder(rowUtil, utilT) === "Action Required",
      status: expenditurePace(toNumber(r.pace.percent), fcT),
    };
  };

  /**
   * The total comes from the UNFOLDED breakdown, which is the whole point of `foldTail`
   * keeping `total` intact: fold five hundred projects into "Other" and the total still
   * equals the KPI tile above, so the reader can check the band against the headline and
   * find them agreeing.
   */
  const breakdownTotal: BreakdownTableRow = {
    id: "total",
    label: "TOTAL",
    budget: compactMoney(grouped.total.budget),
    actual: compactMoney(grouped.total.actualYtd),
    encumbered: compactMoney(grouped.total.encumbrances),
    available: accounting(grouped.total.available, { compact: true }),
    availableNegative: grouped.total.available.isNegative(),
    utilized: percent(grouped.total.utilisation.percent),
  };

  const breakdownBars: BreakdownBarRow[] = grouped.rows.map((r, i) => ({
    id: r.id,
    label: rowLabel(r),
    display: compactMoney(r.actualYtd),
    share: percent(sharePercent(r.actualYtd, grouped.total.actualYtd), 1),
    sharePct: sharePercent(r.actualYtd, grouped.total.actualYtd) ?? 0,
    color: SERIES_SLOTS[i % SERIES_SLOTS.length],
  }));

  // ---------- the function reference table's rows ----------
  const functionRows: FunctionRow[] = byFunction.rows.map((r) => {
    const rowUtil = toNumber(r.utilisation.percent);
    const rowRung = ladder(rowUtil, utilT);
    const overspent = r.available.isNegative() || rowRung === "Action Required";
    const nearing = !overspent && approachingCeiling(rowUtil, utilT);
    const pace = expenditurePace(toNumber(r.pace.percent), fcT);
    return {
      id: r.id,
      label: codeName(r.code, r.name, scope.labelMode),
      budget: compactMoney(r.budget),
      actual: compactMoney(r.actualYtd),
      encumbered: compactMoney(r.encumbrances),
      available: accounting(r.available, { compact: true }),
      availableNegative: r.available.isNegative(),
      utilized: percent(r.utilisation.percent),
      status: overspent
        ? { label: "Overspent", rung: "Action Required" as const }
        : nearing
          ? { label: "Approaching", rung: "Monitor" as const }
          : pace,
    };
  });

  /**
   * The movers, keyed by the SIGN of the variance — `pace.amount` is actual less expected,
   * so the positive card is spending ABOVE expected levels and the negative card below.
   * (The pre-redesign page had the two subtitles swapped against the data; the sheet's
   * "Largest variances" polarity was always right and both now agree with it.) Ink follows
   * favourability, not sign: overspend red, underspend green.
   */
  const moverItems = (
    rows: typeof movers.positive,
    tone: "positive" | "negative",
  ): MoverItem[] =>
    rows.map((r) => ({
      id: r.id,
      name: codeName(r.code, r.name, scope.labelMode),
      fund: moverFund(scope, "/expenditures", r.fund),
      value: accounting(r.pace.amount, { compact: true }),
      percent: signedPercent(r.pace.percent),
      tone,
      status: expenditurePace(toNumber(r.pace.percent), fcT),
    }));

  return (
    <div className="animate-fade-up space-y-[18px]">
      {/* Arms the entrance animations — same one-liner the Revenue redesign carries. */}
      <RevealManager />
      <PageHeader
        title="Expenditures"
        description="Track spending performance against budget."
        actions={
          <DashboardFilters
            scope={scope}
            exportHref={options.exportHref("/expenditures/export")}
            summaryHref={summaryHref}
          />
        }
      />
      {scope.substituted && (
        <SubstitutionNotice asked={scope.substituted.asked} showing={scope.substituted.showing} />
      )}

      {/* ---------- the Overview band: four tiles, then the status strip ---------- */}
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
            icon="receipt"
            tone="blue"
            /*
              ONE PERIOD MARKER PER TILE. "Total expenditures" over "Year to date" over a
              "23.02% spent" delta said the same thing three ways — and "spent" was the same
              percentage the ring beside the sub-line already draws. The period moves into
              the heading and the delta goes.
            */
            label="Expenditures (YTD)"
            value={compactMoney(byFunction.total.actualYtd)}
            sub="of annual budget expended"
            subPct={consumptionPct}
          />

          <OverviewKpiTile
            arrow={false}
            icon="gauge"
            tone={utilRung === "Action Required" ? "red" : utilRung === "Monitor" ? "amber" : "green"}
            label="Budget Utilization"
            value={percent(byFunction.total.utilisation.percent)}
            sub="spent + committed"
            status={utilRung}
            statusInline
            /* Thresholds without trailing zeros, and the ladder stated as the comparison it
               actually is — "Warning ≥ 80%", not "Warning at 80.00%". `pctRule` drops the
               decimals only when the threshold is whole, so an 82.5% policy still prints. */
            statusNote={`Warning ≥ ${pctRule(utilT.warning)} · Critical ≥ ${pctRule(utilT.critical)}`}
          />

          <OverviewKpiTile
            arrow={false}
            icon="wallet"
            tone="teal"
            label="Available Budget"
            value={accounting(byFunction.total.available, { compact: true })}
            /* "Remaining" alone stated nothing the $-figure above it had not already. The
               share of the annual budget is the part a reader cannot work out by looking. */
            chip={
              byFunction.total.available.isNegative()
                ? "Overcommitted"
                : `${percent(sharePercent(byFunction.total.available, byFunction.total.budget))} remaining`
            }
          />

          <OverviewKpiTile
            arrow={false}
            icon="trend-up"
            tone="red"
            label="Change from Prior Month"
            caption={previous ? undefined : "No earlier period"}
            value={compactMoney(point?.expenditureMtd)}
            delta={
              momPct === null
                ? undefined
                : {
                    text: `${percent(Math.abs(momPct))} ${momPct < 0 ? "decrease" : "increase"}`,
                    tone: deltaTone(momPct, "down"),
                    direction: momPct < 0 ? "down" : momPct > 0 ? "up" : "flat",
                  }
            }
          />
        </OverviewTileRow>

        <ExpenditureStatusStrip
          verdict={totalPace.label}
          note={
            varPct === null
              ? "Needs an expenditure budget for the year"
              : varPct === 0
                ? "In line with expected spending"
                : // The sign is carried by the word, not a glyph: "below" reads faster than "−".
                  `${percent(Math.abs(varPct))} ${varPct < 0 ? "below" : "above"} expected spending`
          }
          encumbrances={compactMoney(byFunction.total.encumbrances)}
          encumbranceNote={`${percent(sharePercent(byFunction.total.encumbrances, byFunction.total.budget), 1)} of budget`}
        />
      </OverviewSection>

      {/*
        THE "VIEW BY" BAND — one visualization, four perspectives, full width.

        The client's M5 instruction was to stop answering "by what?" with another card:
        "instead of building multiple dashboards or charts, every major visualization
        should have a small View By or Group By selector … without requiring a separate
        report". Object, Function, Cost Center Type and Project are all columns on the
        expenditure detail grain, so each is one grouped aggregate into the same shape —
        the band does not know which dimension it was handed, and a fifth would cost a
        list entry rather than a card.

        The KPI row above is deliberately NOT re-grouped. Total spending, utilisation and
        available budget are the same figures whichever way the detail is sliced, and a
        district must be able to change perspective without wondering whether the headline
        moved underneath them.
      */}
      <ExpenditureBreakdownSection
        title={meta.title}
        subtitle={meta.subtitle}
        column={meta.column}
        options={EXPENDITURE_VIEWS}
        value={view}
        rows={grouped.rows.map(breakdownRow)}
        total={breakdownTotal}
        bars={breakdownBars}
        ctaLabel={VIEW_DETAILS.expenditureDetail}
        ctaHref={expenditureDetailHref}
        empty={`No spending is tagged by ${meta.column.toLowerCase()} for this period.`}
      />

      {/* ---------- the card grid — the design's 702 / 399 columns on a 10px gutter ---------- */}
      <div className="grid grid-cols-1 items-stretch gap-x-[10px] gap-y-[12px] xl:grid-cols-[minmax(0,1.76fr)_minmax(0,1fr)]">
        {/* row 1 — the by-function reference table beside the positive movers */}
        <ExpenditureFunctionTable
          ctaHref={expenditureDetailHref}
          rows={functionRows}
          total={{
            id: "total",
            label: "Total Expenditures",
            budget: compactMoney(byFunction.total.budget),
            actual: compactMoney(byFunction.total.actualYtd),
            encumbered: compactMoney(byFunction.total.encumbrances),
            available: accounting(byFunction.total.available, { compact: true }),
            availableNegative: byFunction.total.available.isNegative(),
            utilized: percent(byFunction.total.utilisation.percent),
            status: { label: utilRung === "N/A" ? "Not available" : utilRung, rung: utilRung },
          }}
        />

        <RevenueMoversCard
          title="Top positive variances"
          subtitle="Categories spending above expected levels"
          items={moverItems(movers.positive, "negative")}
          empty="Nothing is spending ahead of budget."
        />

        {/* row 2 — budget vs actual beside the negative movers */}
        <RevenueTrendCard
          title="Expenditures — budget vs actual"
          subtitle={`Year to date through ${scope.label}`}
          categories={labels}
          actual={series.points.map((p) => ({ value: toNumber(p.expenditureYtd) }))}
          budget={series.points.map((p) => ({
            value: p.hasData ? ((toNumber(p.expenditureBudget) ?? 0) * p.period) / 12 : null,
          }))}
          reference={fullYearBudget > 0 ? fullYearBudget : null}
          format={(v) => compactMoney(v, 0)}
          summary={`Actual spending year to date against the budget expected by now, for fiscal year ${scope.fiscalYear}.`}
          stats={[
            { label: "Actual (YTD)", value: compactMoney(byFunction.total.actualYtd) },
            { label: "Budget (YTD)", value: compactMoney(byFunction.total.pace.budget) },
            {
              label: "Variance (YTD)",
              value: accounting(byFunction.total.pace.amount, { compact: true }),
              // Spending BELOW pace is the good sign here, which is the opposite of the
              // revenue card — polarity is per-figure, never per-colour.
              tone: byFunction.total.pace.amount.isNegative() ? "positive" : "negative",
              note: signedPercent(byFunction.total.pace.percent),
            },
            {
              label: "Available",
              value: accounting(byFunction.total.available, { compact: true }),
              tone: byFunction.total.available.isNegative() ? "negative" : "positive",
            },
          ]}
        />

        <RevenueMoversCard
          title="Top negative variances"
          subtitle="Categories spending below expected levels"
          items={moverItems(movers.negative, "positive")}
          empty="Nothing is spending behind budget."
        />

        {/* row 3 — the utilization trend beside the alerts */}
        <ExpenditureUtilizationCard
          categories={labels}
          points={monthlyUtilization}
          warning={utilT.warning}
          critical={utilT.critical}
          summary={`Budget utilization each month against warning at ${utilT.warning}% and critical at ${utilT.critical}%.`}
        />

        <RevenueAlertsCard
          title="Expenditure Alerts"
          alerts={expenditureAlerts.map((a) => ({
            id: a.id,
            severity: a.severity,
            message: a.message,
            title: a.title,
            // Which fund is overspent. The threshold is a district figure; these say
            // where to look, and link back to this page scoped to that fund.
            funds: alertFunds(scope, "/expenditures", a.funds).map((f) => ({
              id: f.id,
              // The closing "+ 9 other funds" line already reads as written; putting it
              // through `codeName` would title-case it into "+ 9 Other Funds".
              label: f.role === "total" ? f.name : codeName(f.code, f.name, scope.labelMode),
              detail: f.detail,
              href: f.href,
              role: f.role,
            })),
          }))}
          totalCount={alerts?.alerts.length ?? 0}
          href={options.link("/alerts")}
          empty="No expenditure thresholds have been crossed this period."
        />

        {/* row 4 — the key insight, closing the page the way the Revenue redesign does */}
        <RevenueInsightCard
          ctaLabel={GO_TO.forecast}
          ctaHref={options.link("/fund-balance/forecast")}
        >
          Adjust your growth assumptions to see how changes in spending flow through to fund
          balance and reserves over the next three years.
        </RevenueInsightCard>
      </div>
    </div>
  );
}
