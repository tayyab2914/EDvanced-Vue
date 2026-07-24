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
  expenditureByObjectType,
  topMovers,
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
import { SectionCard, DataAsOf, FooterInfoBar } from "@/components/dashboard/section-card";
import { DataTable, MoverList } from "@/components/dashboard/data-table";
import { AlertList } from "@/components/dashboard/alert-list";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { EmptyState, SubstitutionNotice, Row, PolicyEchoCard } from "@/components/dashboard/shared";
import { ScopeBar } from "@/components/dashboard/scope-bar";
import { LineChart } from "@/components/dashboard/charts/line-chart";
import { ColumnChart } from "@/components/dashboard/charts/column-chart";
import { ShareBars, MetricStrip } from "@/components/dashboard/charts/budget-bars";
import { scopeOptions } from "@/lib/dashboard/options";
import { SERIES_SLOTS } from "@/lib/dashboard/palette";

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
  searchParams: Promise<{ fy?: string; period?: string; fund?: string }>;
}) {
  const { db, user, districtId } = await getTenantDb();
  if (!userCan(user, "view_dashboards")) redirect("/master-data");

  const sp = await searchParams;
  const scope = await resolveScope(db, districtId, sp);

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

  const args = { versionId: version, fundId: scope.fundId, periodsElapsed: scope.period };
  const [byFunction, byObjectType] = await Promise.all([
    // Chart-of-accounts order, at the client's request.
    expenditureByFunction(db, { ...args, order: "chart" }),
    expenditureByObjectType(db, { ...args, order: "chart" }),
  ]);
  // Movers still rank by size — that card exists to answer "what moved most", and chart
  // order would answer "what comes first in the ledger", which nobody asked.
  const movers = topMovers(byFunction, 4);

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

  return (
    <div className="animate-fade-up space-y-[18px]">
      <PageHeader
        title="Expenditures Dashboard"
        description="Track spending performance against budget."
        actions={
          <ScopeBar
            periods={options.periods}
            period={options.period}
            funds={options.funds}
            fund={scope.fundId ?? ""}
            exportHref={options.exportHref("/expenditures/export")}
          />
        }
      />
      {scope.substituted && <SubstitutionNotice asked={scope.substituted.asked} showing={scope.substituted.showing} />}
      <DataAsOf date={scope.dataAsOf} note={scope.fund ? scope.fund.name : "All funds"} />

      {/* ---------- KPI CARDS ---------- */}
      <KpiRow count={6}>
        <KpiTile
          icon="receipt"
          tone="blue"
          label="Total expenditures"
          caption="Year to date"
          value={compactMoney(byFunction.total.actualYtd)}
          sub={`${percent(byFunction.total.consumption.percent)} of full-year budget`}
          delta={{
            text: `${percent(byFunction.total.consumption.percent)} spent`,
            tone: "neutral",
          }}
        />

        <KpiTile
          icon="gauge"
          tone={utilRung === "Action Required" ? "red" : utilRung === "Monitor" ? "amber" : "green"}
          label="Budget utilisation"
          caption="Spend plus encumbrances"
          value={percent(byFunction.total.utilisation.percent)}
          sub={`Warning at ${utilT.warning.toFixed(2)}% · critical at ${utilT.critical.toFixed(2)}%`}
          status={utilRung}
        />

        <KpiTile
          icon="wallet"
          tone="teal"
          label="Available budget"
          caption="Budget less spend and encumbrances"
          value={accounting(byFunction.total.available, { compact: true })}
          sub={`of ${compactMoney(byFunction.total.budget)} budgeted`}
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
          sub="purchase orders and contracts outstanding"
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
          sub="spent this period"
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
              : `${signedPercent(varPct)} against the budget expected by now`
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

        <SectionCard
          title="Expenditures by object (YTD)"
          subtitle="Salaries, benefits, services, supplies and capital"
          info="Object types in chart-of-accounts order, not by size, so the list reads the same every month."
        >
          <ShareBars
            title="Expenditures by object type"
            summary="Share of year-to-date spending by object type."
            rows={byObjectType.rows.map((r, i) => ({
              id: r.id,
              label: r.name,
              value: toNumber(r.actualYtd) ?? 0,
              display: compactMoney(r.actualYtd),
              share: percent(sharePercent(r.actualYtd, byObjectType.total.actualYtd), 1),
              color: SERIES_SLOTS[i % SERIES_SLOTS.length],
            }))}
          />
          <div className="mt-4">
            <DataTable
              dense
              columns={[
                { key: "object", label: "Object" },
                { key: "budget", label: "Budget", align: "right" },
                { key: "actual", label: "Actual (YTD)", align: "right" },
                { key: "util", label: "Utilised", align: "right" },
                { key: "status", label: "Status", align: "right" },
              ]}
              rows={byObjectType.rows.map((r) => {
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
                    object: { value: r.name, strong: true },
                    budget: compactMoney(r.budget),
                    actual: compactMoney(r.actualYtd),
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
              total={{
                id: "total",
                total: true,
                cells: {
                  object: "Total expenditures",
                  budget: compactMoney(byObjectType.total.budget),
                  actual: compactMoney(byObjectType.total.actualYtd),
                  util: percent(byObjectType.total.utilisation.percent),
                  status: null,
                },
              }}
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
                { label: "Budget utilisation — warning", value: `${Number(policy.expenditure.utilizationWarning).toFixed(2)}%` },
                { label: "Budget utilisation — critical", value: `${Number(policy.expenditure.utilizationCritical).toFixed(2)}%` },
                { label: "Variance — warning", value: `± ${Number(policy.expenditure.forecastVarianceWarning).toFixed(2)}%` },
                { label: "Variance — critical", value: `± ${Number(policy.expenditure.forecastVarianceCritical).toFixed(2)}%` },
                { label: "Month-over-month — warning", value: `${Number(policy.expenditure.momIncreaseWarning).toFixed(2)}%` },
                { label: "Month-over-month — critical", value: `${Number(policy.expenditure.momIncreaseCritical).toFixed(2)}%` },
              ]}
              manageHref={userCan(user, "configure_district") ? "/policies" : undefined}
              manageLabel="Manage expenditure policies"
            />
          </SectionCard>

          <SectionCard
            title="Top positive variances"
            subtitle="Spending ahead of pace"
            bodyClassName="min-h-0"
          >
            <MoverList
              items={movers.positive.map((r) => ({
                id: r.id,
                name: r.name,
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
          title="Budget utilisation trend"
          subtitle="Spend plus encumbrances, against your thresholds"
        >
          <ColumnChart
            title="Budget utilisation by month"
            summary={`Budget utilisation each month against warning at ${utilT.warning}% and critical at ${utilT.critical}%.`}
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
          info="A tinted row is overspent or past its utilisation ceiling. An amber row is approaching it."
          footer="Browse expenditure detail"
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
              { key: "util", label: "Utilised", align: "right" },
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
                    value: `${r.code} — ${r.name}`,
                    strong: true,
                    title: r.group?.name ? `${r.group.name} (${r.group.code ?? "—"})` : undefined,
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
            subtitle="Spending behind pace"
            bodyClassName="min-h-0"
          >
            <MoverList
              items={movers.negative.map((r) => ({
                id: r.id,
                name: r.name,
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
            footer="View all alerts"
            footerHref="/alerts"
          >
            <AlertList
              alerts={expenditureAlerts.map((a) => ({
                id: a.id,
                severity: a.severity,
                title: a.title,
                message: a.message,
              }))}
              href="/alerts"
              empty="No expenditure thresholds have been crossed this period."
            />
          </SectionCard>
        </div>
      </Row>

      <FooterInfoBar action="Go to forecast and planning" href="/fund-balance/forecast">
        Adjust your growth assumptions to see how changes in spending flow through to fund
        balance and reserves over the next three years.
      </FooterInfoBar>
    </div>
  );
}
