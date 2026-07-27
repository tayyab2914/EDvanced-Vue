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
  money,
  accounting,
  percent,
  signedPercent,
  toNumber,
  deltaTone,
  changePercent,
  sharePercent,
} from "@/lib/dashboard/format";
import { PageHeader } from "@/components/page-header";
import { KpiTile, KpiRow } from "@/components/dashboard/kpi-tile";
import { SectionCard, DataAsOf, FooterInfoBar } from "@/components/dashboard/section-card";
import { DataTable, MoverList } from "@/components/dashboard/data-table";
import { AlertList } from "@/components/dashboard/alert-list";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { EmptyState, SubstitutionNotice, Row, PolicyEchoCard } from "@/components/dashboard/shared";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { ViewBy } from "@/components/dashboard/view-by";
import { LineChart } from "@/components/dashboard/charts/line-chart";
import { ColumnChart } from "@/components/dashboard/charts/column-chart";
import { ShareBars, MetricStrip } from "@/components/dashboard/charts/budget-bars";
import { scopeOptions, moverFund, alertFunds, scopeDescription } from "@/lib/dashboard/options";
import { GO_TO, MANAGE, VIEW_DETAILS } from "@/lib/dashboard/cta";
import { SERIES_SLOTS } from "@/lib/dashboard/palette";
import { codeName, type LabelMode } from "@/lib/text";
import { labelMode } from "@/lib/dashboard/label-mode";
import { DimLabel } from "@/components/dashboard/dim-label";
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
  SHEET_TABLE_NOTE,
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
      label: "Total revenues (YTD)",
      value: compactMoney(bySource.total.actualYtd),
      sub: `${percent(bySource.total.consumption.percent)} of full-year budget`,
      note: collectedPct === null ? undefined : `${percent(collectedPct)} collected`,
      tone: "neutral" as const,
    },
    {
      key: "variance",
      label: "Revenue variance (YTD)",
      value: accounting(bySource.total.pace.amount, { compact: true }),
      sub: "against the budget expected by now",
      note:
        varPct === null
          ? undefined
          : `${signedPercent(varPct)} ${varPct < 0 ? "below" : "above"} budget`,
      tone: varPct === null ? ("neutral" as const) : sheetTone(deltaTone(varPct, "up")),
    },
    {
      key: "remaining",
      label: "Remaining to collect",
      value: compactMoney(overCollected ? remaining.abs() : remaining),
      sub: overCollected
        ? "collected above the full-year budget"
        : `of ${compactMoney(bySource.total.budget)} budgeted`,
      note: overCollected
        ? "Over-collected"
        : `${percent(100 - (collectedPct ?? 0))} outstanding`,
      tone: overCollected ? ("positive" as const) : ("neutral" as const),
    },
    {
      key: "mom",
      label: "Month over month change",
      value: compactMoney(point?.revenueMtd),
      sub: "collected this period",
      note:
        momPct === null
          ? previous
            ? undefined
            : "no earlier period"
          : `${signedPercent(momPct)} ${momPct < 0 ? "decrease" : "increase"}`,
      tone: momPct === null ? ("neutral" as const) : sheetTone(deltaTone(momPct, "up")),
    },
    {
      key: "status",
      label: "Revenue status (YTD)",
      value: statusRung === "N/A" ? "Not available" : statusRung,
      sub:
        varPct === null
          ? "needs a revenue budget for the year"
          : Math.abs(varPct) < revT.warning
            ? "within policy"
            : "outside policy",
      note: `Policy ± ${revT.warning.toFixed(2)}%`,
      tone: rungTone(statusRung),
    },
    {
      key: "days",
      label: "Days in fiscal year",
      value: String(daysIn.elapsed),
      sub: `of ${daysIn.total} days`,
      note: `${((daysIn.elapsed / daysIn.total) * 100).toFixed(1)}% elapsed`,
      tone: "neutral" as const,
    },
  ];

  // ===================== the one-page landscape summary =====================
  if (summary) {
    return (
      <PrintSheet
        title="Revenue Summary"
        district={user.districtName ?? "District"}
        scope={sheetScope(scope)}
        asOf={sheetAsOf(scope.dataAsOf)}
        backHref={options.query ? `/revenues?${options.query}` : "/revenues"}
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
          <SheetCard title="Revenues — budget vs actual" note={`Through ${scope.label}`}>
            <LineChart
              title="Revenues, budget against actual"
              summary={`Actual collections year to date against the budget expected by now, for fiscal year ${scope.fiscalYear}.`}
              categories={labels}
              format={(v) => compactMoney(v, 0)}
              height={230}
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

        <SheetBand cols="1.6fr 1fr">
          <SheetCard title="Revenue by major source" note={SHEET_TABLE_NOTE}>
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

          <div className="flex min-w-0 flex-col gap-[7px]">
            <SheetCard title="Largest variances" note="Against budget to date">
              <MoverList
                items={[...movers.negative, ...movers.positive].slice(0, 4).map((r) => ({
                  id: r.id,
                  name: codeName(r.code, r.name, scope.labelMode),
                  value: accounting(r.pace.amount, { compact: true }),
                  percent: signedPercent(r.pace.percent),
                  tone: r.pace.amount.isNegative() ? ("negative" as const) : ("positive" as const),
                }))}
                empty="Nothing is materially off budget."
              />
            </SheetCard>

            <SheetCard title={`Revenue alerts (${revenueAlerts.length})`}>
              <AlertList
                mode={scope.labelMode}
                alerts={revenueAlerts.slice(0, 2).map((a) => ({
                  id: a.id,
                  severity: a.severity,
                  title: a.title,
                  message: a.message,
                }))}
                empty="No revenue thresholds crossed."
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
        title="Revenue Dashboard"
        description="Track revenue performance against budget."
        actions={
          <DashboardFilters
            scope={scope}
            exportHref={options.exportHref("/revenues/export")}
            summaryHref={summaryHref}
          />
        }
      />
      {scope.substituted && <SubstitutionNotice asked={scope.substituted.asked} showing={scope.substituted.showing} />}
      <DataAsOf date={scope.dataAsOf} note={scopeDescription(scope)} />

      {/* ---------- KPI CARDS ---------- */}
      <KpiRow count={6}>
        <KpiTile
          icon="dollar"
          tone="green"
          label="Total revenues"
          caption="Year to date"
          value={compactMoney(bySource.total.actualYtd)}
          sub={`${percent(bySource.total.consumption.percent)} of full-year budget`}
          delta={
            collectedPct === null
              ? undefined
              : {
                  text: `${percent(collectedPct)} collected`,
                  tone: "neutral",
                }
          }
        />

        <KpiTile
          icon="pie"
          tone="blue"
          label="Revenue variance"
          caption="Year to date"
          info="Actual collections against the budget expected by now, pro-rated across the year."
          value={accounting(bySource.total.pace.amount, { compact: true })}
          sub="against the budget expected by now"
          delta={
            varPct === null
              ? undefined
              : {
                  text: `${signedPercent(varPct)} ${varPct < 0 ? "below" : "above"} budget`,
                  tone: deltaTone(varPct, "up"),
                  direction: varPct < 0 ? "down" : varPct > 0 ? "up" : "flat",
                }
          }
        />

        <KpiTile
          icon="chart"
          tone="purple"
          label="Remaining to collect"
          caption="Current budget less collections"
          info="Current budget − actual revenue year to date. Not a forecast: no growth or seasonality is assumed."
          value={compactMoney(overCollected ? remaining.abs() : remaining)}
          sub={
            overCollected
              ? "collected above the full-year budget"
              : `of ${compactMoney(bySource.total.budget)} budgeted`
          }
          delta={
            overCollected
              ? { text: "Over-collected", tone: "positive" }
              : { text: `${percent(100 - (collectedPct ?? 0))} outstanding`, tone: "neutral" }
          }
        />

        <KpiTile
          icon="trend-up"
          tone="amber"
          label="Month over month change"
          caption={previous ? `vs period ${previous.period}` : "no earlier period"}
          value={compactMoney(point?.revenueMtd)}
          sub="collected this period"
          delta={
            momPct === null
              ? undefined
              : {
                  text: `${signedPercent(momPct)} ${momPct < 0 ? "decrease" : "increase"}`,
                  tone: deltaTone(momPct, "up"),
                  direction: momPct < 0 ? "down" : momPct > 0 ? "up" : "flat",
                }
          }
        />

        <KpiTile
          icon="target"
          tone={statusRung === "Action Required" ? "red" : statusRung === "Monitor" ? "amber" : "green"}
          label="Revenue status"
          caption="Year to date"
          value={statusRung === "N/A" ? "Not available" : statusRung}
          valueStatus={statusRung}
          sub={
            varPct === null
              ? "needs a revenue budget for the year"
              : Math.abs(varPct) < revT.warning
                ? `Within policy (± ${revT.warning.toFixed(2)}%)`
                : `Outside policy (± ${revT.warning.toFixed(2)}%)`
          }
          statusNote={`Policy ± ${revT.warning.toFixed(2)}%`}
        />

        <KpiTile
          icon="calendar"
          tone="teal"
          label="Days in fiscal year"
          caption={`Through ${scope.label}`}
          value={String(daysIn.elapsed)}
          sub={`of ${daysIn.total} days`}
          delta={{
            text: `${((daysIn.elapsed / daysIn.total) * 100).toFixed(1)}% elapsed`,
            tone: "neutral",
          }}
        />
      </KpiRow>

      {/* ---------- ROW 2: budget vs actual · by major source · policy + top positives ---------- */}
      <Row cols="2-2-1">
        <SectionCard
          title="Revenues — budget vs actual"
          subtitle={`Year to date through ${scope.label}`}
          info="Actual collections against the budget expected by now, with the full-year budget drawn as a reference."
        >
          <LineChart
            title="Revenues, budget against actual"
            summary={`Actual collections year to date against the budget expected by now, for fiscal year ${scope.fiscalYear}.`}
            categories={labels}
            format={(v) => compactMoney(v, 0)}
            height={280}
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
                // The client's terminology change: "Budget (to date)" → "Budget (YTD)".
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
          <div className="mt-4">
            <MetricStrip
              items={[
                { label: "Actual (YTD)", value: compactMoney(bySource.total.actualYtd) },
                { label: "Budget (YTD)", value: compactMoney(bySource.total.pace.budget) },
                {
                  label: "Variance (YTD)",
                  value: accounting(bySource.total.pace.amount, { compact: true }),
                  note: signedPercent(bySource.total.pace.percent),
                  tone: bySource.total.pace.amount.isNegative() ? "negative" : "positive",
                },
                {
                  label: "Remaining to collect",
                  value: compactMoney(overCollected ? remaining.abs() : remaining),
                  note: overCollected ? "over-collected" : "current budget less actual",
                },
              ]}
            />
          </div>
        </SectionCard>

        <SectionCard
          title="Revenue by major source"
          info="Ranked by budget. Variance is measured against the budget expected by now."
          footer={VIEW_DETAILS.revenueDetail}
          footerHref={`/data/revenue-detail?fy=${scope.fiscalYear}&period=${scope.period}`}
        >
          <DataTable
            dense
            columns={[
              { key: "source", label: "Revenue source" },
              { key: "budget", label: "Budget (full year)", align: "right" },
              { key: "actual", label: "Actual (YTD)", align: "right" },
              { key: "pctBudget", label: "% of budget", align: "right" },
              { key: "variance", label: "Variance $", align: "right" },
              { key: "variancePct", label: "Variance %", align: "right" },
              { key: "status", label: "Status", align: "right" },
            ]}
            rows={bySource.rows.map((r) => {
              const pace = revenuePace(toNumber(r.pace.percent), revT);
              const negative = r.pace.amount.isNegative();
              return {
                id: r.id,
                cells: {
                  source: {
                    value: <DimLabel code={r.code} name={r.name} mode={scope.labelMode} />,
                    strong: true,
                  },
                  budget: money(r.budget),
                  actual: money(r.actualYtd),
                  pctBudget: percent(r.consumption.percent),
                  variance: {
                    value: accounting(r.pace.amount),
                    tone: negative ? ("negative" as const) : ("positive" as const),
                    strong: true,
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
                budget: money(bySource.total.budget),
                actual: money(bySource.total.actualYtd),
                pctBudget: percent(bySource.total.consumption.percent),
                variance: {
                  value: accounting(bySource.total.pace.amount),
                  tone: bySource.total.pace.amount.isNegative()
                    ? ("negative" as const)
                    : ("positive" as const),
                },
                variancePct: {
                  value: signedPercent(bySource.total.pace.percent),
                  tone: bySource.total.pace.amount.isNegative()
                    ? ("negative" as const)
                    : ("positive" as const),
                },
                status: (
                  <span className="flex justify-end">
                    <StatusBadge
                      status={revenuePace(toNumber(bySource.total.pace.percent), revT).rung}
                      label={revenuePace(toNumber(bySource.total.pace.percent), revT).label}
                      size="sm"
                      dot={false}
                    />
                  </span>
                ),
              },
            }}
          />
        </SectionCard>

        <div className="grid content-start gap-4">
          <SectionCard
            title="Revenue policy"
            subtitle="Your own thresholds"
            info="Every revenue alert and status badge on this page is judged against these."
          >
            <PolicyEchoCard
              rows={[
                { label: "Variance — warning", value: `± ${Number(policy.revenue.varianceWarning).toFixed(2)}%` },
                { label: "Variance — critical", value: `± ${Number(policy.revenue.varianceCritical).toFixed(2)}%` },
                { label: "Forecast — warning", value: `± ${Number(policy.revenue.forecastVarianceWarning).toFixed(2)}%` },
                { label: "Forecast — critical", value: `± ${Number(policy.revenue.forecastVarianceCritical).toFixed(2)}%` },
                { label: "Month-over-month change", value: `± ${Number(policy.revenue.significantChange).toFixed(2)}%` },
              ]}
              manageHref={userCan(user, "configure_district") ? "/policies" : undefined}
              manageLabel={MANAGE.revenuePolicies}
            />
          </SectionCard>

          <SectionCard title="Top positive variances" bodyClassName="min-h-0">
            <MoverList
              items={movers.positive.map((r) => ({
                id: r.id,
                name: codeName(r.code, r.name, scope.labelMode),
                fund: moverFund(scope, "/revenues", r.fund),
                value: accounting(r.pace.amount, { compact: true }),
                percent: signedPercent(r.pace.percent),
                tone: "positive" as const,
                status: (
                  <StatusBadge
                    status={revenuePace(toNumber(r.pace.percent), revT).rung}
                    label={revenuePace(toNumber(r.pace.percent), revT).label}
                    size="sm"
                    dot={false}
                  />
                ),
              }))}
              empty="Nothing is running ahead of budget."
            />
          </SectionCard>
        </div>
      </Row>

      {/* ---------- ROW 3: variance trend · by category · top negatives + alerts ---------- */}
      <Row cols="2-2-1">
        <SectionCard
          title="Revenue variance trend"
          subtitle="Actual against the budget expected by each month"
          info="A bar above the line means collections ran ahead of the pro-rated budget that month."
        >
          <ColumnChart
            title="Revenue variance by month"
            summary="How far collections ran ahead of or behind the pro-rated budget in each month of the year."
            format={(v) => `${v.toFixed(0)}%`}
            height={280}
            thresholds={[
              { at: revT.warning, label: `Warning +${revT.warning}%`, color: "var(--color-monitor-mark)" },
              { at: -revT.warning, label: `Warning −${revT.warning}%`, color: "var(--color-monitor-mark)" },
            ]}
            columns={series.points
              .filter((p) => p.hasData)
              .map((p) => {
                const b = toNumber(p.revenueBudget) ?? 0;
                const a = toNumber(p.revenueYtd) ?? 0;
                const expected = (b * p.period) / 12;
                const v = expected ? ((a - expected) / expected) * 100 : 0;
                return { label: labels[p.period - 1], value: v, display: `${v.toFixed(1)}%` };
              })}
          />
        </SectionCard>

        {/*
          THE "VIEW BY" CARD — "Revenue Type, Revenue Code & Name, Grant".

          One card, three perspectives, per the client's M5 note: a district asking "which
          grants brought this in?" should not need a second report to find out. All three
          are dimensions on the revenue detail grain, so each is one grouped aggregate into
          the same shape.

          The KPI row and the variance trend above are deliberately NOT re-grouped — total
          revenue and its variance are the same figures however the detail is sliced.
        */}
        <SectionCard
          title={meta.title}
          subtitle={meta.subtitle}
          info={meta.info}
          control={<ViewBy options={REVENUE_VIEWS} value={view} />}
          footer={VIEW_DETAILS.revenueDetail}
          footerHref={`/data/revenue-detail?fy=${scope.fiscalYear}&period=${scope.period}`}
        >
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
          <div className="mt-4">
            {/*
              The totals come from the UNFOLDED breakdown — `foldTail` keeps `total` intact
              precisely so a card that hides its tail still agrees with the KPI tile above
              it. The count is the real one too: "Projects 84" after folding to six bars is
              the honest statement, and "6" would not be.
            */}
            <MetricStrip
              cols={3}
              items={[
                { label: "Total actual (YTD)", value: compactMoney(categories.total.actualYtd) },
                { label: "Total budget", value: compactMoney(categories.total.budget) },
                { label: meta.noun, value: String(regroupedSource.rows.length) },
              ]}
            />
          </div>
        </SectionCard>

        <div className="grid content-start gap-4">
          <SectionCard title="Top negative variances" bodyClassName="min-h-0">
            <MoverList
              items={movers.negative.map((r) => ({
                id: r.id,
                name: codeName(r.code, r.name, scope.labelMode),
                fund: moverFund(scope, "/revenues", r.fund),
                value: accounting(r.pace.amount, { compact: true }),
                percent: signedPercent(r.pace.percent),
                tone: "negative" as const,
                status: (
                  <StatusBadge
                    status={revenuePace(toNumber(r.pace.percent), revT).rung}
                    label={revenuePace(toNumber(r.pace.percent), revT).label}
                    size="sm"
                    dot={false}
                  />
                ),
              }))}
              empty="Nothing is running behind budget."
            />
          </SectionCard>

          <SectionCard
            title={`Revenue alerts (${revenueAlerts.length})`}
            footer={GO_TO.alerts}
            footerHref="/alerts"
          >
            <AlertList
              mode={scope.labelMode}
              alerts={revenueAlerts.map((a) => ({
                id: a.id,
                severity: a.severity,
                title: a.title,
                message: a.message,
                // Which fund is under- or over-collected. The alert itself is a district
                // figure; these say where to look, and link back to this page scoped there.
                funds: alertFunds(scope, "/revenues", a.funds),
              }))}
              href="/alerts"
              empty="No revenue thresholds have been crossed this period."
            />
          </SectionCard>
        </div>
      </Row>

      <FooterInfoBar action={GO_TO.policies} href="/policies">
        Revenue figures are drawn from the detail file committed for this period. Remaining to
        collect is current budget less actual revenue — it assumes no growth and is not a
        forecast. Adjust the thresholds above to change when these alerts fire.
      </FooterInfoBar>
    </div>
  );
}
