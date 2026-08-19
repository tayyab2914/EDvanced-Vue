import { redirect } from "next/navigation";
import { getTenantDb, userCan } from "@/lib/auth/dal";
import { resolveScope } from "@/lib/dashboard/scope";
import { loadCore, revenueVarianceThresholds, periodAxisLabels } from "@/lib/dashboard/load";
import {
  revenueBySource,
  revenueBySourceAndFund,
  revenueByType,
  revenueByProject,
  topMovers,
  foldTail,
  type Breakdown,
  type BreakdownRow,
} from "@/lib/finance/breakdown";
import { ladder } from "@/lib/dashboard/status";
import { revenuePace } from "@/lib/dashboard/pace";
import { daysIntoFiscalYear } from "@/lib/finance/variance";
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
import { RevenueStatusStrip } from "@/components/dashboard/revenue-status-strip";
import { RevenueSourceTable, type SourceRow } from "@/components/dashboard/revenue-source-table";
import { RevenueCategoryCard } from "@/components/dashboard/revenue-category-card";
import { RevenueTrendCard } from "@/components/dashboard/revenue-trend-card";
import { RevenueVarianceCard } from "@/components/dashboard/revenue-variance-card";
import { RevenueMoversCard, type MoverItem } from "@/components/dashboard/revenue-movers";
import { RevenueInsightCard } from "@/components/dashboard/revenue-insight-card";
import { RevenueAlertsCard } from "@/components/dashboard/revenue-alerts-card";
import { scopeOptions, moverFund, alertFunds } from "@/lib/dashboard/options";
import { SERIES_SLOTS } from "@/lib/dashboard/palette";
import { codeName, type LabelMode } from "@/lib/text";
import { labelMode } from "@/lib/dashboard/label-mode";
import { REVENUE_VIEWS, resolveView, type RevenueView } from "@/lib/dashboard/view";
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
 * How the "view by" card presents each perspective — "Revenue Type, Revenue Code & Name,
 * Grant", per the client.
 *
 * All three fold their tail into "Other" at six rows, unlike the Expenditures card, which
 * folds only its unbounded dimensions. Revenue types number four or five, so the fold never
 * fires there; sources and projects run to dozens, and this card is the SHARE card. The
 * complete source list is the table in the row above, untouched.
 *
 * The per-view `label` is gone, for the reason given on the Expenditures card: a revenue
 * TYPE carries a code exactly as a source does, so rendering one bare and the other
 * `code — name` made the card change convention as the reader moved the selector. All three
 * go through `codeName` and honour the reader's Codes / Names setting.
 */
const VIEW_META: Record<
  RevenueView,
  { title: string; subtitle: string; info: string; noun: string }
> = {
  type: {
    title: "Revenue by category (YTD)",
    subtitle: "Share of collections by revenue type",
    info: "The same categories the forecast projects by, so a forecast and an actual compare without a translation table between them.",
    noun: "Revenue types",
  },
  source: {
    title: "Revenue by code and name (YTD)",
    subtitle: "Share of collections by revenue source",
    info: "The district's own revenue source codes, largest first. The full list with variance and status is in the table above.",
    noun: "Revenue sources",
  },
  grant: {
    title: "Revenue by project / grant (YTD)",
    subtitle: "The Project / Grant column on the revenue detail",
    info: "Grant revenue reaches the platform tagged in the required Project / Grant column, against the district's unified project master. That is what this groups by — the Grants Activity module itself is a V2 addition.",
    noun: "Projects",
  },
};

/** A breakdown row's dimension, as text — for the chart labels, which are not DOM nodes. */
const rowLabel = (r: BreakdownRow, mode: LabelMode) => codeName(r.code, r.name, mode);

/**
 * The segmented switcher's short labels — the design's own words (Figma 46:3226) for the
 * same three views REVENUE_VIEWS names in full. The VALUES are REVENUE_VIEWS's, so the
 * capsule and the resolver can never disagree about what a URL means.
 */
const CATEGORY_TABS = [
  { value: "type", label: "Type" },
  { value: "source", label: "Code & Name" },
  { value: "grant", label: "Project/Grant" },
] as const;

/**
 * The Revenue dashboard (Spec §4) — performance against budget.
 *
 * TWO M4 CHANGES WORTH THE COMMENT
 *
 * 1. "Forecast" is gone, replaced by REMAINING TO COLLECT — current budget less actual
 *    revenue year to date. The client's reasoning is exactly right and worth preserving:
 *    "for the MVP, this will provide a clear and transparent view of revenue collection
 *    progress without introducing forecasting assumptions". A straight-lined year-end
 *    projection dressed as a forecast invites a district to plan against it, and this
 *    product does not yet have an engine that earns that. Remaining-to-collect is
 *    arithmetic, not a prediction.
 *
 * 2. "Budget (to date)" is now "Budget (YTD)" everywhere on this page, matching the
 *    vocabulary the rest of the dashboards use.
 *
 * The layout follows the client's own diagram: two chart columns and a narrower rail
 * carrying the policy echo, the movers and the alerts.
 */
export default async function RevenueDashboard({
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
  const view = resolveView(REVENUE_VIEWS, sp.groupBy);
  const meta = VIEW_META[view];

  if (scope.empty) {
    return (
      <div className="animate-fade-up space-y-[18px]">
        <PageHeader title="Revenue Dashboard" description="Track revenue performance against budget." />
        <EmptyState title="No revenue data yet" action="Upload revenue detail" href="/data/upload">
          Upload a revenue detail file for a reporting period and this dashboard will show
          collections against budget, by source and by category.
        </EmptyState>
      </div>
    );
  }

  const core = await loadCore(db, districtId, scope);
  const { series, point, previous, policy, alerts } = core;
  const facts = alerts?.facts ?? null;
  const version = core.versions.get("REVENUE_DETAIL");

  if (!version) {
    return (
      <div className="animate-fade-up space-y-[18px]">
        <PageHeader title="Revenue Dashboard" description="Track revenue performance against budget." />
        <EmptyState title={`No revenue detail for ${scope.label}`} action="Upload revenue detail" href="/data/upload">
          Other periods may have data — use the period selector, or upload this one.
        </EmptyState>
      </div>
    );
  }

  const args = { versionId: version, filter: scope.filter, periodsElapsed: scope.period };
  const [bySource, regrouped, bySourceAndFund] = await Promise.all([
    revenueBySource(db, args),
    // The "view by" card's aggregate. `source` is absent because `bySource` beside it IS
    // that aggregate — it is already loaded for the KPI tiles and the by-source table, and
    // asking the database for it twice would buy nothing.
    view === "type"
      ? revenueByType(db, args)
      : view === "grant"
        ? revenueByProject(db, args)
        : Promise.resolve<Breakdown | null>(null),
    /**
     * The movers' own aggregate, at fund × source grain — and only on the All Funds view.
     *
     * `bySource` sums a source across every fund, so a mover row built from it named a
     * variance without naming anywhere to go, and netted two funds moving in opposite
     * directions down to one number. With a single fund selected it already IS this grain,
     * so nothing is asked for. See lib/finance/breakdown.ts for the whole argument.
     */
    scope.fundId ? Promise.resolve(null) : revenueBySourceAndFund(db, args),
  ]);
  const movers = topMovers(bySourceAndFund ?? bySource, 4);

  // All three sources are already ranked biggest-first, so the fold takes the small tail.
  const regroupedSource = regrouped ?? bySource;
  const categories = foldTail(regroupedSource, scope.period, 5);

  const revT = revenueVarianceThresholds(policy);
  const varPct = toNumber(facts?.revenueVariancePercent);
  const momPct = changePercent(point?.revenueMtd, previous?.revenueMtd);
  const daysIn = daysIntoFiscalYear(scope.period);
  const statusRung = ladder(varPct === null ? null : Math.abs(varPct), revT);

  const labels = periodAxisLabels(scope, series.points.length);
  const fullYearBudget = toNumber(bySource.total.budget) ?? 0;

  /**
   * REMAINING TO COLLECT — current budget less actual revenue YTD.
   *
   * Clamped at zero on the display side only: a district that has over-collected has
   * nothing left to collect, and a negative "remaining" would read as a shortfall when it
   * is the opposite. The over-collection is stated in the sub-line instead.
   */
  const remaining = bySource.total.budget.minus(bySource.total.actualYtd);
  const overCollected = remaining.isNegative();
  const collectedPct = toNumber(bySource.total.consumption.percent);

  const options = scopeOptions(scope);
  const revenueAlerts = (alerts?.alerts ?? []).filter((a) => a.group === "revenue");
  const summaryHref = options.query
    ? `/revenues?${options.query}&view=summary`
    : "/revenues?view=summary";

  // ---------- the sheet's six headline figures ----------
  // Every value here reads the same derived variable the screen tile above reads
  // (`bySource.total`, `varPct`, `remaining`), so the printed page and the dashboard are
  // computed once and formatted twice. The printed tile is a different component because it
  // has no room for a caption, an ⓘ or a drill-down link — see `SheetKpi`.
  const kpiData = [
    {
      key: "total",
      label: "Revenue Collected (YTD)",
      value: compactMoney(bySource.total.actualYtd),
      sub: `${percent(bySource.total.consumption.percent)} of budget collected`,
      note: collectedPct === null ? undefined : `${percent(collectedPct)} collected`,
      tone: "neutral" as const,
    },
    {
      key: "variance",
      label: "Revenue Variance (YTD)",
      value: accounting(bySource.total.pace.amount, { compact: true }),
      sub: "Compared with expected collections",
      note:
        varPct === null
          ? undefined
          : `${percent(Math.abs(varPct))} ${varPct < 0 ? "below" : "above"} expected`,
      tone: varPct === null ? ("neutral" as const) : sheetTone(deltaTone(varPct, "up")),
    },
    {
      key: "remaining",
      label: "Remaining to Collect",
      value: compactMoney(overCollected ? remaining.abs() : remaining),
      sub: overCollected
        ? "collected above the full-year budget"
        : "Remaining of annual revenue budget",
      note: overCollected
        ? "Over-collected"
        : `${percent(100 - (collectedPct ?? 0))} of annual budget remaining`,
      tone: overCollected ? ("positive" as const) : ("neutral" as const),
    },
    {
      key: "mom",
      label: "Change from Prior Month",
      value: compactMoney(point?.revenueMtd),
      sub: "Revenue collected this period",
      note:
        momPct === null
          ? previous
            ? undefined
            : "no earlier period"
          : `${percent(Math.abs(momPct))} ${momPct < 0 ? "decrease" : "increase"}`,
      tone: momPct === null ? ("neutral" as const) : sheetTone(deltaTone(momPct, "up")),
    },
    {
      key: "status",
      label: "Revenue Status (YTD)",
      value: statusRung === "N/A" ? "Not available" : statusRung,
      sub:
        varPct === null
          ? "needs a revenue budget for the year"
          : Math.abs(varPct) < revT.warning
            ? "within revenue collection target"
            : "outside revenue collection target",
      note: `Target ± ${revT.warning.toFixed(2)}%`,
      tone: rungTone(statusRung),
    },
    {
      key: "days",
      label: "Days Elapsed",
      value: String(daysIn.elapsed),
      sub: "Fiscal year completed",
      note: `${((daysIn.elapsed / daysIn.total) * 100).toFixed(1)}% of fiscal year elapsed`,
      tone: "neutral" as const,
    },
  ];

  /**
   * The monthly variance series — actual collections against the budget expected by that
   * month, as a signed percentage. Feeds the screen's status-strip sparkline and variance
   * trend columns AND the printed summary's variance chart, so none of the three can
   * disagree. Computed before the sheet branch because the sheet needs it too.
   */
  const monthlyVariance: (number | null)[] = series.points.map((p) => {
    if (!p.hasData) return null;
    const b = toNumber(p.revenueBudget) ?? 0;
    const a = toNumber(p.revenueYtd) ?? 0;
    const expected = (b * p.period) / 12;
    return expected ? ((a - expected) / expected) * 100 : null;
  });

  // ===================== the two-page landscape summary =====================
  //
  // Page one is the position: the six figures, collections against budget, and the by-source
  // ledger. Page two is the diagnosis — where the variance came from month by month, which
  // sources moved it, and what has crossed a threshold. The one-page version folded the two
  // movers cards into a single four-row list and printed no variance trend at all.
  if (summary) {
    return (
      <PrintSheet
        title="Revenue Summary"
        district={user.districtName ?? "District"}
        scope={sheetScope(scope)}
        asOf={sheetAsOf(scope.dataAsOf)}
        backHref={options.query ? `/revenues?${options.query}` : "/revenues"}
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
          <SheetCard title="Revenues — budget vs actual" note={`Through ${scope.label}`}>
            <LineChart
              title="Revenues, budget against actual"
              summary={`Actual collections year to date against the budget expected by now, for fiscal year ${scope.fiscalYear}.`}
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
                    value: toNumber(p.revenueYtd),
                    label: compactMoney(p.revenueYtd),
                  })),
                },
                {
                  key: "budget",
                  label: "Budget (YTD)",
                  color: "var(--color-viz-budget)",
                  points: series.points.map((p) => ({
                    value: p.hasData ? ((toNumber(p.revenueBudget) ?? 0) * p.period) / 12 : null,
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
                { label: "Actual (YTD)", value: compactMoney(bySource.total.actualYtd) },
                { label: "Budget (YTD)", value: compactMoney(bySource.total.pace.budget) },
                {
                  label: "Variance (YTD)",
                  value: accounting(bySource.total.pace.amount, { compact: true }),
                  tone: bySource.total.pace.amount.isNegative() ? "negative" : "positive",
                },
                {
                  label: "Remaining",
                  value: compactMoney(overCollected ? remaining.abs() : remaining),
                },
              ]}
            />
          </SheetCard>

          <SheetCard title={meta.title} note={meta.subtitle}>
            <ShareBars
              title={meta.title}
              summary={`Share of year-to-date collections by ${meta.noun.toLowerCase().replace(/s$/, "")}.`}
              rows={categories.rows.map((r, i) => ({
                id: r.id,
                label: rowLabel(r, scope.labelMode),
                value: toNumber(r.actualYtd) ?? 0,
                display: compactMoney(r.actualYtd),
                share: percent(sharePercent(r.actualYtd, categories.total.actualYtd), 1),
                color: SERIES_SLOTS[i % SERIES_SLOTS.length],
              }))}
            />
            <SheetStats
              items={[
                { label: "Total actual", value: compactMoney(categories.total.actualYtd) },
                { label: "Total budget", value: compactMoney(categories.total.budget) },
                { label: meta.noun, value: String(regroupedSource.rows.length) },
              ]}
            />
          </SheetCard>
        </SheetBand>

        <SheetBand cols="1fr">
          <SheetCard
            title="Revenue by major source"
            note={
              bySource.rows.length > SHEET_TABLE_ROWS
                ? sheetTableNote(SHEET_TABLE_ROWS)
                : `Through ${scope.label}`
            }
          >
            <DataTable
              dense
              columns={[
                { key: "source", label: "Revenue source" },
                { key: "budget", label: "Budget", align: "right" },
                { key: "actual", label: "Actual (YTD)", align: "right" },
                { key: "variance", label: "Variance $", align: "right" },
                { key: "variancePct", label: "Variance %", align: "right" },
                { key: "status", label: "Status", align: "right" },
              ]}
              rows={bySource.rows.slice(0, SHEET_TABLE_ROWS).map((r) => {
                const pace = revenuePace(toNumber(r.pace.percent), revT);
                const negative = r.pace.amount.isNegative();
                return {
                  id: r.id,
                  cells: {
                    source: { value: codeName(r.code, r.name, scope.labelMode), strong: true },
                    budget: compactMoney(r.budget),
                    actual: compactMoney(r.actualYtd),
                    variance: {
                      value: accounting(r.pace.amount, { compact: true }),
                      tone: negative ? ("negative" as const) : ("positive" as const),
                    },
                    variancePct: {
                      value: signedPercent(r.pace.percent),
                      tone: negative ? ("negative" as const) : ("positive" as const),
                    },
                    status: (
                      <span className="flex justify-end">
                        <StatusBadge status={pace.rung} label={pace.label} size="sm" dot={false} />
                      </span>
                    ),
                  },
                };
              })}
              total={{
                id: "total",
                total: true,
                cells: {
                  source: "Total revenues",
                  budget: compactMoney(bySource.total.budget),
                  actual: compactMoney(bySource.total.actualYtd),
                  variance: accounting(bySource.total.pace.amount, { compact: true }),
                  variancePct: signedPercent(bySource.total.pace.percent),
                  status: (
                    <span className="flex justify-end">
                      <StatusBadge
                        status={revenuePace(toNumber(bySource.total.pace.percent), revT).rung}
                        size="sm"
                        dot={false}
                      />
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
            label: "Variance detail & alerts",
            content: (
              <>
                <SheetBand cols="1.5fr 1fr 1fr">
                  {/* The variance trend the one-page sheet had no room for — the same monthly
                      series the screen's status-strip sparkline draws, against the district's
                      own ± warning band rather than a hardcoded one. */}
                  <SheetCard
                    title="Revenue variance trend"
                    note={`Against budget to date · ± ${revT.warning.toFixed(2)}%`}
                  >
                    <ColumnChart
                      title="Revenue variance trend"
                      summary="How far collections ran ahead of or behind the pro-rated budget in each month of the year."
                      height={215}
                      format={(v) => `${v.toFixed(1)}%`}
                      columns={labels
                        .map((label, i) => ({ label, value: monthlyVariance[i] }))
                        .filter((c): c is { label: string; value: number } => c.value !== null)
                        .map((c) => ({
                          ...c,
                          display: signedPercent(c.value, 1),
                        }))}
                      thresholds={[
                        {
                          at: -revT.warning,
                          label: `−${revT.warning.toFixed(2)}%`,
                          color: "var(--color-monitor)",
                        },
                        {
                          at: revT.warning,
                          label: `+${revT.warning.toFixed(2)}%`,
                          color: "var(--color-monitor)",
                        },
                      ]}
                    />
                  </SheetCard>

                  <SheetCard title="Top positive variances" note="Above expected">
                    <MoverList
                      items={movers.positive.map((r) => ({
                        id: r.id,
                        name: codeName(r.code, r.name, scope.labelMode),
                        value: accounting(r.pace.amount, { compact: true }),
                        percent: signedPercent(r.pace.percent),
                        tone: "positive" as const,
                      }))}
                      empty="Nothing is running ahead of budget."
                    />
                  </SheetCard>

                  <SheetCard title="Top negative variances" note="Below expected">
                    <MoverList
                      items={movers.negative.map((r) => ({
                        id: r.id,
                        name: codeName(r.code, r.name, scope.labelMode),
                        value: accounting(r.pace.amount, { compact: true }),
                        percent: signedPercent(r.pace.percent),
                        tone: "negative" as const,
                      }))}
                      empty="Nothing is running behind budget."
                    />
                  </SheetCard>
                </SheetBand>

                <SheetBand cols="1.35fr 1fr">
                  {/* Every revenue alert, not the first two: the count in the title was the
                      only thing the one-page sheet could print, which told a board there was
                      something to read and then withheld it. */}
                  <SheetCard
                    title={`Revenue alerts (${revenueAlerts.length})`}
                    note="Against the district's own thresholds"
                  >
                    <AlertList
                      mode={scope.labelMode}
                      alerts={revenueAlerts.slice(0, 6).map((a) => ({
                        id: a.id,
                        severity: a.severity,
                        title: a.title,
                        message: a.message,
                      }))}
                      empty="No revenue thresholds crossed."
                      emptyNote="Collections are inside the district's variance band."
                    />
                    {revenueAlerts.length > 6 && (
                      <p className="text-[8.5px] text-[#060606]">
                        {revenueAlerts.length - 6} further alert
                        {revenueAlerts.length - 6 === 1 ? "" : "s"} on the Alerts dashboard.
                      </p>
                    )}
                  </SheetCard>

                  <SheetCard title="Key insight" note="How to read this page">
                    <p className="text-[10px] leading-[1.45] text-[#060606]">
                      Revenue figures are drawn from the detail file committed for this period.
                      Remaining to collect is current budget less actual revenue — it assumes no
                      growth and is not a forecast. The variance band above is the district&apos;s
                      own ± {revT.warning.toFixed(2)}% threshold, set on the Policies screen; the
                      alerts beside it fire against it.
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

  // ===================== the redesigned screen (Figma 46:2918) =====================

  const revenueDetailHref = `/data/revenue-detail?fy=${scope.fiscalYear}&period=${scope.period}`;
  const totalStatus = revenuePace(toNumber(bySource.total.pace.percent), revT);

  const sourceRows: SourceRow[] = bySource.rows.map((r) => ({
    id: r.id,
    label: codeName(r.code, r.name, scope.labelMode),
    budget: compactMoney(r.budget),
    actual: compactMoney(r.actualYtd),
    pctBudget: percent(r.consumption.percent),
    variance: accounting(r.pace.amount, { compact: true }),
    variancePct: signedPercent(r.pace.percent),
    negative: r.pace.amount.isNegative(),
    status: revenuePace(toNumber(r.pace.percent), revT),
  }));

  const moverItems = (
    rows: typeof movers.positive,
    tone: "positive" | "negative",
  ): MoverItem[] =>
    rows.map((r) => ({
      id: r.id,
      name: codeName(r.code, r.name, scope.labelMode),
      fund: moverFund(scope, "/revenues", r.fund),
      value: accounting(r.pace.amount, { compact: true }),
      percent: signedPercent(r.pace.percent),
      tone,
      status: revenuePace(toNumber(r.pace.percent), revT),
    }));

  return (
    <div className="animate-fade-up space-y-[18px]">
      {/* Arms the entrance animations — same one-liner the Executive redesign carries. */}
      <RevealManager />
      <PageHeader
        title="Revenue"
        description="Track revenue performance against budget."
        actions={
          <DashboardFilters
            scope={scope}
            exportHref={options.exportHref("/revenues/export")}
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
            icon="dollar"
            tone="green"
            label="Revenue Collected (YTD)"
            value={compactMoney(bySource.total.actualYtd)}
            sub="of budget collected"
            subPct={collectedPct}
            delta={
              varPct === null
                ? undefined
                : {
                    text: `${percent(Math.abs(varPct))} ${varPct < 0 ? "below" : "above"} budget to date`,
                    tone: deltaTone(varPct, "up"),
                    direction: varPct < 0 ? "down" : varPct > 0 ? "up" : "flat",
                  }
            }
          />

          <OverviewKpiTile
            arrow={false}
            icon="pie"
            tone="blue"
            label="Revenue Variance (YTD)"
            value={accounting(bySource.total.pace.amount, { compact: true })}
            sub="Compared with expected collections"
            delta={
              varPct === null
                ? undefined
                : {
                    text: `${percent(Math.abs(varPct))} ${varPct < 0 ? "below" : "above"} expected`,
                    tone: deltaTone(varPct, "up"),
                    direction: varPct < 0 ? "down" : varPct > 0 ? "up" : "flat",
                  }
            }
          />

          <OverviewKpiTile
            arrow={false}
            icon="chart"
            tone="purple"
            /*
              NO "Year to date" CAPTION. The $169.04M here is what is left of the ANNUAL
              revenue budget, not a year-to-date figure — the caption was making a claim
              about the number that the arithmetic behind it does not support.
            */
            label="Remaining to Collect"
            value={compactMoney(overCollected ? remaining.abs() : remaining)}
            chip={
              overCollected
                ? "Over-collected"
                : `${percent(100 - (collectedPct ?? 0))} of annual budget remaining`
            }
          />

          <OverviewKpiTile
            arrow={false}
            icon="trend-up"
            tone="amber"
            label="Change from Prior Month"
            /* The caption now only carries the EMPTY state — "vs period 2" restated what
               the heading already says, and the arrow on the delta below carries direction. */
            caption={previous ? undefined : "No earlier period"}
            value={compactMoney(point?.revenueMtd)}
            delta={
              momPct === null
                ? undefined
                : {
                    text: `${percent(Math.abs(momPct))} ${momPct < 0 ? "decrease" : "increase"}`,
                    tone: deltaTone(momPct, "up"),
                    direction: momPct < 0 ? "down" : momPct > 0 ? "up" : "flat",
                  }
            }
          />
        </OverviewTileRow>

        <RevenueStatusStrip
          rung={statusRung}
          policyNote={`Target ± ${revT.warning.toFixed(2)}%`}
          spark={monthlyVariance}
          days={String(daysIn.elapsed)}
          elapsedNote={`${((daysIn.elapsed / daysIn.total) * 100).toFixed(1)}% of fiscal year elapsed`}
        />
      </OverviewSection>

      {/* ---------- the card grid — the 64:8848 canvas: 702 / 399 columns on a 17px gutter,
          20px between rows, with the by-source table standing full width above them ---------- */}
      <div className="grid grid-cols-1 items-stretch gap-x-[17px] gap-y-[20px] xl:grid-cols-[minmax(0,1.76fr)_minmax(0,1fr)]">
        {/* row 1 — the by-source table, spanning both columns (64:8868 runs the full 1118px) */}
        <div className="min-w-0 xl:col-span-2">
          <RevenueSourceTable
            ctaHref={revenueDetailHref}
            rows={sourceRows}
            total={{
              id: "total",
              label: "Total Revenue",
              budget: compactMoney(bySource.total.budget),
              actual: compactMoney(bySource.total.actualYtd),
              pctBudget: percent(bySource.total.consumption.percent),
              variance: accounting(bySource.total.pace.amount, { compact: true }),
              variancePct: signedPercent(bySource.total.pace.percent),
              negative: bySource.total.pace.amount.isNegative(),
              status: totalStatus,
            }}
          />
        </div>

        {/*
          row 2 — THE "VIEW BY" CARD — "Revenue Type, Revenue Code & Name, Grant", the
          design's segmented capsule rather than a dropdown. Same URL parameter, same
          server-side regrouping — see the note on VIEW_META above. The positive movers
          stand beside it, sized to their content (64:9410).
        */}
        <RevenueCategoryCard
          title={meta.title}
          subtitle={meta.subtitle}
          view={view}
          viewOptions={CATEGORY_TABS}
          rows={categories.rows.map((r, i) => ({
            id: r.id,
            label: rowLabel(r, scope.labelMode),
            display: compactMoney(r.actualYtd),
            share: percent(sharePercent(r.actualYtd, categories.total.actualYtd), 1),
            sharePct: sharePercent(r.actualYtd, categories.total.actualYtd) ?? 0,
            color: SERIES_SLOTS[i % SERIES_SLOTS.length],
          }))}
          stats={[
            { label: "Actual (YTD)", value: compactMoney(categories.total.actualYtd) },
            { label: "Budget (YTD)", value: compactMoney(categories.total.pace.budget) },
            {
              label: "Variance (YTD)",
              value: accounting(categories.total.pace.amount, { compact: true }),
              tone: categories.total.pace.amount.isNegative() ? "negative" : "positive",
              note: signedPercent(categories.total.pace.percent),
            },
          ]}
          ctaHref={revenueDetailHref}
        />

        <RevenueMoversCard
          fit
          title="Top positive variances"
          subtitle="Collections above expected levels"
          items={moverItems(movers.positive, "positive")}
          empty="Nothing is running ahead of budget."
        />

        {/* row 3 — budget vs actual beside the negative movers */}
        <RevenueTrendCard
          title="Revenues — budget vs actual"
          subtitle={`Year to date through ${scope.label}`}
          categories={labels}
          actual={series.points.map((p) => ({ value: toNumber(p.revenueYtd) }))}
          budget={series.points.map((p) => ({
            value: p.hasData ? ((toNumber(p.revenueBudget) ?? 0) * p.period) / 12 : null,
          }))}
          reference={fullYearBudget > 0 ? fullYearBudget : null}
          format={(v) => compactMoney(v, 0)}
          summary={`Actual collections year to date against the budget expected by now, for fiscal year ${scope.fiscalYear}.`}
          stats={[
            { label: "Actual (YTD)", value: compactMoney(bySource.total.actualYtd) },
            { label: "Budget (YTD)", value: compactMoney(bySource.total.pace.budget) },
            {
              label: "Variance (YTD)",
              value: accounting(bySource.total.pace.amount, { compact: true }),
              tone: bySource.total.pace.amount.isNegative() ? "negative" : "positive",
              note: signedPercent(bySource.total.pace.percent),
            },
            {
              label: "Remaining to collect",
              value: compactMoney(overCollected ? remaining.abs() : remaining),
              note: overCollected ? "over-collected" : "current budget less actual",
            },
          ]}
        />

        <RevenueMoversCard
          title="Top negative variances"
          subtitle="Collections below expected levels"
          items={moverItems(movers.negative, "negative")}
          empty="Nothing is running behind budget."
        />

        {/* row 4 — the variance trend beside the alerts */}
        <RevenueVarianceCard
          categories={labels}
          points={monthlyVariance}
          warning={revT.warning}
          summary="How far collections ran ahead of or behind the pro-rated budget in each month of the year."
        />

        <RevenueAlertsCard
          alerts={revenueAlerts.map((a) => ({
            id: a.id,
            severity: a.severity,
            message: a.message,
            title: a.title,
            funds: alertFunds(scope, "/revenues", a.funds).map((f) => ({
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
        />

        {/* row 5 — the key insight, standing alone in the left column (64:9404) */}
        <RevenueInsightCard ctaHref="/policies">
          Revenue figures are drawn from the detail file committed for this period. Remaining to
          collect is current budget less actual revenue — it assumes no growth and is not a
          forecast. Adjust the thresholds above to change when these alerts fire.
        </RevenueInsightCard>
      </div>
    </div>
  );
}
