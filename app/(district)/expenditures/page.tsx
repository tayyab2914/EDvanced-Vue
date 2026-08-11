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
import { KpiTile, KpiRow } from "@/components/dashboard/kpi-tile";
import { SectionCard, FooterInfoBar } from "@/components/dashboard/section-card";
import { DataTable, MoverList } from "@/components/dashboard/data-table";
import { AlertList } from "@/components/dashboard/alert-list";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { EmptyState, SubstitutionNotice, Row, PolicyEchoCard } from "@/components/dashboard/shared";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { ViewBy } from "@/components/dashboard/view-by";
import { LineChart } from "@/components/dashboard/charts/line-chart";
import { ColumnChart } from "@/components/dashboard/charts/column-chart";
import { ShareBars, MetricStrip } from "@/components/dashboard/charts/budget-bars";
import { scopeOptions, moverFund, alertFunds } from "@/lib/dashboard/options";
import { GO_TO, MANAGE, VIEW_DETAILS } from "@/lib/dashboard/cta";
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
  SHEET_TABLE_NOTE,
} from "@/lib/dashboard/summary";
import { codeName } from "@/lib/text";
import { labelMode } from "@/lib/dashboard/label-mode";
import { DimLabel } from "@/components/dashboard/dim-label";
import { EXPENDITURE_VIEWS, resolveView, type ExpenditureView } from "@/lib/dashboard/view";

/**
 * How the "view by" card presents each perspective.
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
 *   Named — the number is dropped from the visible label (`SHOW_CODE`, below) and kept in
 *   the hover, so a composition card reads as words and the ordering can still be checked.
 *
 *   Ascending — chart-of-accounts order, never by size, so the sequence is the same every
 *   month. That is what `order: "chart"` buys, and for the one dimension that must also be
 *   capped it is `inChartOrder` applied after the fold.
 * ---------------------------------------------------------------------------
 *
 * `ranked` is the only entry still doing real work, and only Project sets it. Object types,
 * function types and cost centre types are BOUNDED classification lookups — seven, a handful
 * and a couple of dozen — so each reads best complete, in its own order. Projects are
 * UNBOUNDED: a district can carry hundreds, and a composition card with hundreds of bars is
 * not a card. That view ranks by size to choose WHICH rows it shows, folds the tail into
 * "Other" (which is also what keeps the six categorical colour slots honest), and then puts
 * what survived back into ascending project-number order, because the choosing and the
 * ordering are answering two different questions.
 *
 * The full function list is untouched and still sits two rows down, in Function Type Code
 * order with every account and its number named, because that is the reference table the
 * client asked for and this is not it.
 */
const VIEW_META: Record<
  ExpenditureView,
  { title: string; subtitle: string; info: string; column: string; ranked: boolean }
> = {
  object: {
    title: "Expenditures by object (YTD)",
    subtitle: "Salaries, benefits, services, supplies and capital",
    info: "Object types in chart-of-accounts order, not by size, so the list reads the same every month.",
    column: "Object",
    ranked: false,
  },
  function: {
    title: "Expenditures by function (YTD)",
    subtitle: "Grouped by function type — the full list, in code order, is below",
    info: "Function types in chart-of-accounts order, not by size, so the list reads the same every month. The complete function table, with every account number, follows in Function Type Code order.",
    column: "Function",
    ranked: false,
  },
  costCenterType: {
    title: "Expenditures by cost center type (YTD)",
    subtitle: "Schools, departments and operations",
    info: "Cost centre types in their configured order. Rows whose cost centre column was left blank are shown as No Cost Center Type rather than dropped.",
    column: "Cost center type",
    ranked: false,
  },
  project: {
    title: "Expenditures by project (YTD)",
    subtitle: "The Project / Grant column on the expenditure detail",
    info: "The largest projects by budget, in ascending project-number order, with the remainder folded into Other. Grant-funded spending arrives tagged here.",
    column: "Project",
    ranked: true,
  },
};

/**
 * A row's dimension as THIS CARD labels it — the name, never the number.
 *
 * One helper for all four views rather than a per-view `hideCode`, because the client's note
 * was not four separate requests: Object already read as a list of names, and Function, Cost
 * Center Type and Project were each asked to match it. A per-view flag would let a fifth
 * perspective be added that quietly disagrees with the other four, which is drift this card
 * has already been through once — the views used to disagree about `code — name` versus the
 * bare name, and the reader watched the convention change as they moved the selector.
 *
 * The number is not thrown away, only unshown: it orders the rows, and it is on the hover
 * (`note` on the `<DimLabel>` below), so a reader asking "why is this row here" has an
 * answer. The REFERENCE tables further down this page are untouched and still lead with the
 * code, because that is where a finance officer goes to scan for one — and they honour the
 * reader's Codes / Names setting, which a card showing no codes at all cannot.
 */
const rowLabel = (r: BreakdownRow) => r.name;

/**
 * The Expenditures dashboard (Spec §5) — spending against budget.
 *
 * The three M4 requests all land on the by-function table, and each is answered by a
 * different channel rather than three shades of the same one:
 *
 *   "Functions listed based on the Function Type Code" — the table is ordered by chart of
 *   accounts (lib/finance/breakdown.ts `byChartOrder`), not by size. A reference table that
 *   reorders itself as spending moves is not a reference table.
 *
 *   "Make overspending easier to identify visually" — an overspent row is tinted, its
 *   Available figure is red, and it carries an Over Budget or Critical badge. Three
 *   channels, because colour alone fails the reader this product cannot afford to fail.
 *
 *   "Highlight functions approaching their budget threshold" — a separate, quieter flag
 *   (`approachingCeiling`), because a function five points below its warning band is a
 *   different message from one already past it.
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
        <PageHeader title="Expenditures Dashboard" description="Track spending performance against budget." />
        <EmptyState title="No expenditure data yet" action="Upload expenditure detail" href="/data/upload">
          Upload an expenditure detail file and this dashboard will show spending, encumbrances
          and available budget by function and object.
        </EmptyState>
      </div>
    );
  }

  const core = await loadCore(db, districtId, scope);
  const { series, point, previous, policy, alerts } = core;
  const facts = alerts?.facts ?? null;
  const version = core.versions.get("EXPENDITURE_DETAIL");

  if (!version) {
    return (
      <div className="animate-fade-up space-y-[18px]">
        <PageHeader title="Expenditures Dashboard" description="Track spending performance against budget." />
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
    // The "view by" card's aggregate — one grouped query per perspective, chart-ordered in
    // the database rather than re-sorted here.
    //
    // `function` is no longer served by re-sorting the by-function breakdown loaded above it:
    // that breakdown is the account-grain REFERENCE table, and this card now folds to
    // Function Type at the client's request. Two different altitudes, so two queries — the
    // roll-up is one grouped aggregate plus a lookup of a handful of types, which is the
    // cheapest thing on this page.
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
   * client asked for two things a single sort cannot give: a card short enough to read, and
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
  const daysIn = daysIntoFiscalYear(scope.period);
  const utilRung = ladder(utilPct, utilT);
  const totalPace = expenditurePace(varPct, fcT);

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
      label: "Total expenditures (YTD)",
      value: compactMoney(byFunction.total.actualYtd),
      sub: `${percent(byFunction.total.consumption.percent)} of full-year budget`,
      note: `${percent(byFunction.total.consumption.percent)} spent`,
      tone: "neutral" as const,
    },
    {
      key: "utilisation",
      label: "Budget utilization",
      value: percent(byFunction.total.utilisation.percent),
      sub: "spend plus encumbrances",
      note: `${utilRung} · warning ${utilT.warning.toFixed(2)}%`,
      tone: rungTone(utilRung),
    },
    {
      key: "available",
      label: "Available budget",
      value: accounting(byFunction.total.available, { compact: true }),
      sub: `of ${compactMoney(byFunction.total.budget)} budgeted`,
      note: byFunction.total.available.isNegative() ? "Overcommitted" : "Remaining",
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
      label: "Month over month change",
      value: compactMoney(point?.expenditureMtd),
      sub: "spent this period",
      note:
        momPct === null
          ? previous
            ? undefined
            : "no earlier period"
          : `${signedPercent(momPct)} ${momPct < 0 ? "decrease" : "increase"}`,
      tone: momPct === null ? ("neutral" as const) : sheetTone(deltaTone(momPct, "down")),
    },
    {
      key: "status",
      label: "Expenditure status (YTD)",
      value: totalPace.label === "N/A" ? "Not available" : totalPace.label,
      sub:
        varPct === null
          ? "needs an expenditure budget"
          : `${signedPercent(varPct)} vs budget to date`,
      note: `Policy ± ${fcT.warning.toFixed(2)}%`,
      tone: rungTone(totalPace.rung),
    },
  ];

  // ===================== the one-page landscape summary =====================
  if (summary) {
    return (
      <PrintSheet
        title="Expenditure Summary"
        district={user.districtName ?? "District"}
        scope={sheetScope(scope)}
        asOf={sheetAsOf(scope.dataAsOf)}
        backHref={options.query ? `/expenditures?${options.query}` : "/expenditures"}
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
          <SheetCard title="Expenditures — budget vs actual" note={`Through ${scope.label}`}>
            <LineChart
              title="Expenditures, budget against actual"
              summary={`Actual spending year to date against the budget expected by now, for fiscal year ${scope.fiscalYear}.`}
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
                summary of this card says what the screen version of it now says. */}
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

        <SheetBand cols="1.6fr 1fr">
          <SheetCard title="Expenditures by function (YTD)" note={SHEET_TABLE_NOTE}>
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

          <div className="flex min-w-0 flex-col gap-[7px]">
            <SheetCard title="Largest variances" note="Against budget to date">
              <MoverList
                items={[...movers.positive, ...movers.negative].slice(0, 4).map((r) => ({
                  id: r.id,
                  name: codeName(r.code, r.name, scope.labelMode),
                  value: accounting(r.pace.amount, { compact: true }),
                  percent: signedPercent(r.pace.percent),
                  // Over pace is the bad direction for spending.
                  tone: r.pace.amount.isNegative() ? ("positive" as const) : ("negative" as const),
                }))}
                empty="Nothing is materially off budget."
              />
            </SheetCard>

            <SheetCard title={`Expenditure alerts (${expenditureAlerts.length})`}>
              <AlertList
                mode={scope.labelMode}
                alerts={expenditureAlerts.slice(0, 2).map((a) => ({
                  id: a.id,
                  severity: a.severity,
                  title: a.title,
                  message: a.message,
                }))}
                empty="No expenditure thresholds crossed."
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
        title="Expenditures Dashboard"
        description="Track spending performance against budget."
        actions={
          <DashboardFilters
            scope={scope}
            exportHref={options.exportHref("/expenditures/export")}
            summaryHref={summaryHref}
          />
        }
      />
      {scope.substituted && <SubstitutionNotice asked={scope.substituted.asked} showing={scope.substituted.showing} />}

      {/* ---------- KPI CARDS ---------- */}
      <KpiRow count={6}>
        <KpiTile
          icon="receipt"
          tone="blue"
          label="Total expenditures"
          caption="Year to date"
          value={compactMoney(byFunction.total.actualYtd)}
          sub={`${percent(byFunction.total.consumption.percent)} of annual budget expended`}
          delta={{
            text: `${percent(byFunction.total.consumption.percent)} spent`,
            tone: "neutral",
          }}
        />

        <KpiTile
          icon="gauge"
          tone={utilRung === "Action Required" ? "red" : utilRung === "Monitor" ? "amber" : "green"}
          label="Budget utilization"
          caption="Spend plus encumbrances"
          value={percent(byFunction.total.utilisation.percent)}
          sub="Includes expenditures and encumbrances"
          status={utilRung}
          // The sub now says what the figure counts, so the policy it is judged against moves
          // to the footer beside the badge — the same place every other judged tile keeps it.
          statusNote={`Warning at ${utilT.warning.toFixed(2)}% · critical at ${utilT.critical.toFixed(2)}%`}
        />

        <KpiTile
          icon="wallet"
          tone="teal"
          label="Available budget"
          caption="Budget less spend and encumbrances"
          value={accounting(byFunction.total.available, { compact: true })}
          sub="Remaining budget available to spend"
          delta={
            byFunction.total.available.isNegative()
              ? { text: "Overcommitted", tone: "negative", direction: "down" }
              : { text: "Remaining", tone: "positive" }
          }
        />

        <KpiTile
          icon="layers"
          tone="purple"
          label="Encumbrances"
          caption="Committed, not yet spent"
          value={compactMoney(byFunction.total.encumbrances)}
          sub="Committed but not yet expended"
          delta={{
            text: `${percent(sharePercent(byFunction.total.encumbrances, byFunction.total.budget), 1)} of budget`,
            tone: "neutral",
          }}
        />

        <KpiTile
          icon="trend-up"
          tone="amber"
          label="Month over month change"
          caption={previous ? `vs period ${previous.period}` : "no earlier period"}
          value={compactMoney(point?.expenditureMtd)}
          sub="Change from prior period"
          delta={
            momPct === null
              ? undefined
              : {
                  text: `${signedPercent(momPct)} ${momPct < 0 ? "decrease" : "increase"}`,
                  tone: deltaTone(momPct, "down"),
                  direction: momPct < 0 ? "down" : momPct > 0 ? "up" : "flat",
                }
          }
        />

        <KpiTile
          icon="target"
          tone={
            totalPace.rung === "Action Required" ? "red" : totalPace.rung === "Monitor" ? "amber" : "green"
          }
          label="Expenditure status"
          caption={`Year to date · ${daysIn.elapsed} of ${daysIn.total} days`}
          value={totalPace.label === "N/A" ? "Not available" : totalPace.label}
          valueStatus={totalPace.rung}
          sub={
            varPct === null
              ? "needs an expenditure budget for the year"
              : // The sign is carried by the word, not a glyph: "below" reads faster than "−".
                varPct === 0
                ? "In line with expected spending"
                : `${percent(Math.abs(varPct))} ${varPct < 0 ? "below" : "above"} expected spending`
          }
          statusNote={`Policy ± ${fcT.warning.toFixed(2)}%`}
        />
      </KpiRow>

      {/* ---------- ROW 2: budget vs actual · by object · policy + overspends ---------- */}
      <Row cols="2-2-1">
        <SectionCard
          title="Expenditures — budget vs actual"
          subtitle={`Year to date through ${scope.label}`}
          info="Actual spending against the budget expected by now, with the full-year budget drawn as a reference."
        >
          <LineChart
            title="Expenditures, budget against actual"
            summary={`Actual spending year to date against the budget expected by now, for fiscal year ${scope.fiscalYear}.`}
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
                  value: toNumber(p.expenditureYtd),
                  label: compactMoney(p.expenditureYtd),
                })),
              },
              {
                key: "budget",
                label: "Budget (YTD)",
                color: "var(--color-viz-budget)",
                points: series.points.map((p) => ({
                  value: p.hasData ? ((toNumber(p.expenditureBudget) ?? 0) * p.period) / 12 : null,
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
                { label: "Actual (YTD)", value: compactMoney(byFunction.total.actualYtd) },
                { label: "Budget (YTD)", value: compactMoney(byFunction.total.pace.budget) },
                {
                  label: "Variance (YTD)",
                  value: accounting(byFunction.total.pace.amount, { compact: true }),
                  note: signedPercent(byFunction.total.pace.percent),
                  // Spending BELOW pace is the good sign here, which is the opposite of the
                  // revenue card — polarity is per-figure, never per-colour.
                  tone: byFunction.total.pace.amount.isNegative() ? "positive" : "negative",
                },
                {
                  label: "Available",
                  value: accounting(byFunction.total.available, { compact: true }),
                  tone: byFunction.total.available.isNegative() ? "negative" : "positive",
                },
              ]}
            />
          </div>
        </SectionCard>

        {/*
          THE "VIEW BY" CARD — one visualization, four perspectives.

          The client's M5 instruction was to stop answering "by what?" with another card:
          "instead of building multiple dashboards or charts, every major visualization
          should have a small View By or Group By selector … without requiring a separate
          report". Object, Function, Cost Center Type and Project are all columns on the
          expenditure detail grain, so each is one grouped aggregate into the same shape —
          the card below does not know which dimension it was handed, and a fifth would cost
          a list entry rather than a card.

          The KPI row above is deliberately NOT re-grouped. Total spending, utilisation and
          available budget are the same figures whichever way the detail is sliced, and a
          district must be able to change perspective without wondering whether the headline
          moved underneath them.
        */}
        <SectionCard
          title={meta.title}
          subtitle={meta.subtitle}
          info={meta.info}
          control={<ViewBy options={EXPENDITURE_VIEWS} value={view} />}
          // The same drill-down the by-function table two rows down already carries, at the
          // client's request. It is the same destination whichever perspective the selector
          // is on, because all four are foldings of the one expenditure detail — a card that
          // could show a figure with no way through to the rows behind it was the odd one
          // out on this page.
          footer={VIEW_DETAILS.expenditureDetail}
          footerHref={`/data/expenditure-detail?fy=${scope.fiscalYear}&period=${scope.period}`}
        >
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
          <div className="mt-4">
            <DataTable
              dense
              /*
               * Encumbered and Available, at the client's request — and the pair is the
               * request, not two of them. Utilized already counts encumbrances (see
               * `utilisation` in lib/finance/variance.ts), so a reader looking at a row at
               * 96% could not tell whether the money was spent or merely committed, and had
               * no figure at all for what was left. The columns now run in the order the
               * arithmetic does: Budget − Actual − Encumbered = Available, with Utilized the
               * same relationship as a percentage. It is also the column order the
               * by-function table below already uses, so the two read alike.
               */
              columns={[
                { key: "group", label: meta.column },
                { key: "budget", label: "Budget", align: "right" },
                { key: "actual", label: "Actual (YTD)", align: "right" },
                { key: "enc", label: "Encumbered", align: "right" },
                { key: "avail", label: "Available", align: "right" },
                { key: "util", label: "Utilized", align: "right" },
                { key: "status", label: "Status", align: "right" },
              ]}
              rows={grouped.rows.map((r) => {
                const pace = expenditurePace(toNumber(r.pace.percent), fcT);
                const rowUtil = toNumber(r.utilisation.percent);
                return {
                  id: r.id,
                  flag:
                    r.available.isNegative() || ladder(rowUtil, utilT) === "Action Required"
                      ? ("negative" as const)
                      : approachingCeiling(rowUtil, utilT)
                        ? ("warning" as const)
                        : undefined,
                  cells: {
                    group: {
                      // No code on screen, the code on hover — see `rowLabel`. The number
                      // is what put this row where it is, so it belongs in the tooltip
                      // even though the client asked for it out of the label.
                      value: <DimLabel code={null} name={r.name} note={r.code || undefined} />,
                      strong: true,
                    },
                    budget: compactMoney(r.budget),
                    actual: compactMoney(r.actualYtd),
                    enc: compactMoney(r.encumbrances),
                    avail: {
                      // Accounting form and a red tint on a negative, the same as every
                      // other Available figure on this page: a group that has committed
                      // more than it was given is the one thing this column exists to say.
                      value: accounting(r.available, { compact: true }),
                      tone: r.available.isNegative() ? ("negative" as const) : ("neutral" as const),
                      strong: r.available.isNegative(),
                    },
                    util: {
                      value: percent(r.utilisation.percent),
                      tone:
                        ladder(rowUtil, utilT) === "Action Required"
                          ? ("negative" as const)
                          : ("neutral" as const),
                    },
                    status: (
                      <span className="flex justify-end">
                        <StatusBadge status={pace.rung} label={pace.label} size="sm" dot={false} />
                      </span>
                    ),
                  },
                };
              })}
              /*
               * The total comes from the UNFOLDED breakdown, which is the whole point of
               * `foldTail` keeping `total` intact: fold five hundred projects into "Other"
               * and the total still equals the KPI tile above, so the reader can check the
               * card against the headline and find them agreeing.
               */
              total={{
                id: "total",
                total: true,
                cells: {
                  group: "Total expenditures",
                  budget: compactMoney(grouped.total.budget),
                  actual: compactMoney(grouped.total.actualYtd),
                  enc: compactMoney(grouped.total.encumbrances),
                  avail: {
                    value: accounting(grouped.total.available, { compact: true }),
                    tone: grouped.total.available.isNegative()
                      ? ("negative" as const)
                      : ("neutral" as const),
                  },
                  util: percent(grouped.total.utilisation.percent),
                  status: null,
                },
              }}
              empty={`No spending is tagged by ${meta.column.toLowerCase()} for this period.`}
            />
          </div>
        </SectionCard>

        <div className="grid content-start gap-4">
          <SectionCard
            title="Expenditure policy"
            subtitle="Your own thresholds"
            info="Every expenditure alert and status badge on this page is judged against these."
          >
            <PolicyEchoCard
              rows={[
                { label: "Budget Utilization - Warning", value: `${Number(policy.expenditure.utilizationWarning).toFixed(2)}%` },
                { label: "Budget Utilization - Critical", value: `${Number(policy.expenditure.utilizationCritical).toFixed(2)}%` },
                { label: "Variance - Warning", value: `± ${Number(policy.expenditure.forecastVarianceWarning).toFixed(2)}%` },
                { label: "Variance - Critical", value: `± ${Number(policy.expenditure.forecastVarianceCritical).toFixed(2)}%` },
                { label: "Month-over-Month - Warning", value: `${Number(policy.expenditure.momIncreaseWarning).toFixed(2)}%` },
                { label: "Month-over-Month - Critical", value: `${Number(policy.expenditure.momIncreaseCritical).toFixed(2)}%` },
              ]}
              manageHref={userCan(user, "configure_district") ? "/policies" : undefined}
              manageLabel={MANAGE.expenditurePolicies}
            />
          </SectionCard>

          <SectionCard
            title="Top positive variances"
            subtitle="Categories spending below expected levels"
            bodyClassName="min-h-0"
          >
            <MoverList
              items={movers.positive.map((r) => ({
                id: r.id,
                name: codeName(r.code, r.name, scope.labelMode),
                fund: moverFund(scope, "/expenditures", r.fund),
                note: r.group?.name,
                value: accounting(r.pace.amount, { compact: true }),
                percent: signedPercent(r.pace.percent),
                tone: "negative" as const,
                status: (
                  <StatusBadge
                    status={expenditurePace(toNumber(r.pace.percent), fcT).rung}
                    label={expenditurePace(toNumber(r.pace.percent), fcT).label}
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

      {/* ---------- ROW 3: utilisation trend · by function · underspends + alerts ---------- */}
      <Row cols="2-2-1">
        <SectionCard
          title="Budget utilization trend"
          subtitle="Expenditures and encumbrances compared to your policy thresholds"
        >
          <ColumnChart
            title="Budget utilization by month"
            summary={`Budget utilization each month against warning at ${utilT.warning}% and critical at ${utilT.critical}%.`}
            mode="threshold"
            format={(v) => `${v.toFixed(0)}%`}
            height={280}
            color="var(--color-viz-budget)"
            thresholds={[
              { at: utilT.warning, label: `Warning ${utilT.warning}%`, color: "var(--color-monitor-mark)" },
              { at: utilT.critical, label: `Critical ${utilT.critical}%`, color: "var(--color-action-mark)" },
            ]}
            columns={series.points
              .filter((p) => p.hasData)
              .map((p) => {
                const b = toNumber(p.expenditureBudget) ?? 0;
                const a = toNumber(p.expenditureYtd) ?? 0;
                const e = toNumber(p.encumbrances) ?? 0;
                const v = b ? ((a + e) / b) * 100 : 0;
                return { label: labels[p.period - 1], value: v, display: `${v.toFixed(0)}%` };
              })}
          />
        </SectionCard>

        <SectionCard
          title="Expenditures by function (YTD)"
          subtitle="In Function Type Code order"
          info="A tinted row is overspent or past its utilization ceiling. An amber row is approaching it."
          footer={VIEW_DETAILS.expenditureDetail}
          footerHref={`/data/expenditure-detail?fy=${scope.fiscalYear}&period=${scope.period}`}
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
            rows={byFunction.rows.map((r) => {
              const rowUtil = toNumber(r.utilisation.percent);
              const rowRung = ladder(rowUtil, utilT);
              const overspent = r.available.isNegative() || rowRung === "Action Required";
              const nearing = !overspent && approachingCeiling(rowUtil, utilT);
              const pace = expenditurePace(toNumber(r.pace.percent), fcT);

              return {
                id: r.id,
                flag: overspent ? ("negative" as const) : nearing ? ("warning" as const) : undefined,
                cells: {
                  fn: {
                    value: (
                      <DimLabel
                        code={r.code}
                        name={r.name}
                        mode={scope.labelMode}
                        // The classification used to be the cell's own `title`, which the
                        // label's tooltip would now sit on top of. Folded in, so one hover
                        // gives the full name AND where it sits in the chart of accounts.
                        note={r.group?.name ? `${r.group.name} (${r.group.code ?? "—"})` : undefined}
                      />
                    ),
                    strong: true,
                  },
                  budget: compactMoney(r.budget),
                  actual: compactMoney(r.actualYtd),
                  enc: compactMoney(r.encumbrances),
                  avail: {
                    value: accounting(r.available, { compact: true }),
                    tone: r.available.isNegative() ? ("negative" as const) : ("neutral" as const),
                    strong: r.available.isNegative(),
                  },
                  util: {
                    value: percent(r.utilisation.percent),
                    tone:
                      rowRung === "Action Required"
                        ? ("negative" as const)
                        : rowRung === "Monitor"
                          ? ("neutral" as const)
                          : ("neutral" as const),
                    strong: rowRung === "Action Required",
                  },
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
                avail: {
                  value: accounting(byFunction.total.available, { compact: true }),
                  tone: byFunction.total.available.isNegative()
                    ? ("negative" as const)
                    : ("neutral" as const),
                },
                util: percent(byFunction.total.utilisation.percent),
                status: (
                  <span className="flex justify-end">
                    <StatusBadge status={utilRung} size="sm" dot={false} />
                  </span>
                ),
              },
            }}
          />
        </SectionCard>

        <div className="grid content-start gap-4">
          <SectionCard
            title="Top negative variances"
            subtitle="Categories spending above expected levels"
            bodyClassName="min-h-0"
          >
            <MoverList
              items={movers.negative.map((r) => ({
                id: r.id,
                name: codeName(r.code, r.name, scope.labelMode),
                fund: moverFund(scope, "/expenditures", r.fund),
                note: r.group?.name,
                value: accounting(r.pace.amount, { compact: true }),
                percent: signedPercent(r.pace.percent),
                tone: "positive" as const,
                status: (
                  <StatusBadge
                    status={expenditurePace(toNumber(r.pace.percent), fcT).rung}
                    label={expenditurePace(toNumber(r.pace.percent), fcT).label}
                    size="sm"
                    dot={false}
                  />
                ),
              }))}
              empty="Nothing is running behind budget."
            />
          </SectionCard>

          <SectionCard
            title={`Expenditure alerts (${expenditureAlerts.length})`}
            footer={GO_TO.alerts}
            footerHref={options.link("/alerts")}
          >
            <AlertList
              mode={scope.labelMode}
              alerts={expenditureAlerts.map((a) => ({
                id: a.id,
                severity: a.severity,
                title: a.title,
                message: a.message,
                // Which fund is overspent. The threshold is a district figure; these say
                // where to look, and link back to this page scoped to that fund.
                funds: alertFunds(scope, "/expenditures", a.funds),
              }))}
              href={options.link("/alerts")}
              empty="No expenditure thresholds have been crossed this period."
            />
          </SectionCard>
        </div>
      </Row>

      <FooterInfoBar action={GO_TO.forecast} href={options.link("/fund-balance/forecast")}>
        Adjust your growth assumptions to see how changes in spending flow through to fund
        balance and reserves over the next three years.
      </FooterInfoBar>
    </div>
  );
}
