import { redirect } from "next/navigation";
import Link from "next/link";
import type { Prisma } from "@/lib/generated/prisma/client";
import { getTenantDb, userCan } from "@/lib/auth/dal";
import { resolveScope } from "@/lib/dashboard/scope";
import { labelMode } from "@/lib/dashboard/label-mode";
import { loadCore, reserveThresholds, forecastReserveThresholds } from "@/lib/dashboard/load";
import { projectFundBalance, districtGrowth, componentAssumptions } from "@/lib/forecast/engine";
import { ladder } from "@/lib/dashboard/status";
import { GO_TO, MANAGE } from "@/lib/dashboard/cta";
import {
  compactMoney,
  money,
  accounting,
  percent,
  toNumber,
  signedPercent,
  deltaTone,
  days as fmtDays,
  NOT_AVAILABLE,
} from "@/lib/dashboard/format";
import { DataTable } from "@/components/dashboard/data-table";
import { AlertList } from "@/components/dashboard/alert-list";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { EmptyState } from "@/components/dashboard/shared";
import { LineChart } from "@/components/dashboard/charts/line-chart";
import {
  OverviewKpiTile,
  OverviewSection,
  OverviewTileRow,
} from "@/components/dashboard/overview-kpi";
import { OverviewPeriodSelect } from "@/components/dashboard/overview-period-select";
import { OverviewPanel, OverviewPanelHeader } from "@/components/dashboard/overview-panel";
import { PillLink } from "@/components/dashboard/revenue-shared";
import { Icon } from "@/components/icons";
import { scopeOptions } from "@/lib/dashboard/options";
import { FundBalanceShell } from "../shell";
import { AssumptionsForm } from "./assumptions-form";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/cn";
import {
  FUND_BALANCE_COMPONENT_LABELS,
  type FundBalanceComponent,
  type ForecastMethod,
} from "@/lib/enums";

/**
 * Fund Balance — Forecasting & Planning (Spec §6.2), rebuilt to the client's calculation
 * flow.
 *
 * "I would like the overall layout to mirror the inspiration provided because the
 * calculation flow is much easier to follow and aligns with how finance officers think
 * through a multi-year forecast: Beginning Fund Balance → Revenues → Expenditures → Ending
 * Fund Balance → Fund Balance Components → Projected Unassigned Fund Balance."
 *
 * That is one table, read top to bottom, where each row is the next line of an arithmetic a
 * finance officer already knows. The previous screen split the same numbers across two
 * cards — a "budget forecast" and a "fund balance forecast" — which meant the ending
 * balance appeared in one and the components that reduce it in the other, and the reader
 * had to hold the link between them in their head.
 *
 * Every figure below comes from lib/forecast/engine.ts, which now reads the district's own
 * component rules rather than carrying every component forward flat.
 */
export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string; period?: string; fund?: string }>;
}) {
  const { db, user, districtId } = await getTenantDb();
  if (!userCan(user, "view_dashboards")) redirect("/master-data");

  const sp = await searchParams;
  const scope = await resolveScope(db, districtId, sp, await labelMode());

  if (scope.empty) {
    return (
      <div className="animate-fade-up space-y-[18px]">
        <PageHeader title="Fund Balance" description="Plan for the future." />
        <EmptyState title="Nothing to project yet" action="Upload data" href="/data/upload">
          A projection needs at least one committed period to extrapolate from.
        </EmptyState>
      </div>
    );
  }

  const core = await loadCore(db, districtId, scope);
  const { policy, alerts, codes } = core;
  const fbAlerts = (alerts?.alerts ?? []).filter((a) => a.group === "fundBalance");
  const options = scopeOptions(scope);

  // The multi-year projection is General-Fund-only, per the workbook's own note. Without a
  // General Fund there is no coherent reserve percentage to project.
  const fund = scope.fund ?? scope.generalFund;

  if (!fund) {
    return (
      <FundBalanceShell scope={scope} active="/fund-balance/forecast" alertCount={fbAlerts.length}>
        <EmptyState title="No General Fund identified" icon="database" action="Manage funds" href="/master-data?tab=funds">
          Multi-year projection and the projected unassigned reserve apply to the General Fund
          only. Set one of your funds to the &ldquo;General&rdquo; fund type to see this view.
        </EmptyState>
      </FundBalanceShell>
    );
  }

  const [growth, projection, componentRules] = await Promise.all([
    districtGrowth(db, scope.fiscalYear),
    projectFundBalance(
      db,
      { fiscalYear: scope.fiscalYear, period: scope.period, fundId: fund.id, years: 4 },
      codes,
    ),
    componentAssumptions(db, { fiscalYear: scope.fiscalYear, fundId: fund.id }),
  ]);

  const reserveT = reserveThresholds(policy);
  const fcT = forecastReserveThresholds(policy);
  const statutoryMinimum = Number(policy.fundBalance.boardPolicyMinimum);

  const first = projection[0];
  const last = projection[projection.length - 1];
  const change = first && last ? last.unassigned.minus(first.unassigned) : null;
  const changePct =
    first && change && !first.unassigned.isZero()
      ? toNumber(change.dividedBy(first.unassigned.abs()).times(100))
      : null;
  const lowest = projection.reduce(
    (lo, y) =>
      lo === null ||
      (y.unassignedPercentOfRevenue &&
        lo.unassignedPercentOfRevenue &&
        y.unassignedPercentOfRevenue.lessThan(lo.unassignedPercentOfRevenue))
        ? y
        : lo,
    null as (typeof projection)[number] | null,
  );

  // Days of operating expenses at the end of the plan — the rail's last card.
  const daysAtEnd =
    last && !last.projectedExpenditure.isZero()
      ? toNumber(last.unassigned.dividedBy(last.projectedExpenditure.dividedBy(365)))
      : null;

  const canEdit = userCan(user, "edit_forecast_assumptions");

  // The recurring operating base, echoed into the form so a district can see the arithmetic
  // its growth rate is about to compound on.
  const currentYearSpend = first?.projectedExpenditure ?? null;
  const oneTimeSpend = growth.oneTimeExpenditure;
  const recurringBase =
    currentYearSpend === null ? null : currentYearSpend.minus(oneTimeSpend ?? 0);

  /**
   * A figure's share of that year's projected revenues.
   *
   * Revenues is the divisor for every percentage on this screen — components and the
   * unassigned balance alike — because that is the denominator the district's own workbook
   * uses when it plans. Elsewhere in the platform a reserve percentage divides by
   * expenditures, and the two must not be quietly mixed; see the note on
   * `unassignedPercentOfRevenue` in lib/forecast/engine.ts.
   */
  const shareOfRevenue = (
    value: Prisma.Decimal,
    y: (typeof projection)[number],
  ): Prisma.Decimal | null =>
    y.projectedRevenue.isZero() ? null : value.dividedBy(y.projectedRevenue).times(100);

  /**
   * A row of the calculation flow.
   *
   * `showPercent` prints the share of revenues UNDER the dollars rather than behind a
   * toggle. The screen used to offer "Dollars | % of Expenditures" and show one or the
   * other; the client's answer to that was "I noticed it's programmed to toggle but adding
   * to the screen is better for the user" — a board reading a component against policy
   * wants the dollars and the percentage in the same glance, not one click apart.
   */
  const moneyRow = (
    label: string,
    pick: (y: (typeof projection)[number]) => { value: Prisma.Decimal; negative?: boolean },
    opts: {
      emphasis?: boolean;
      indent?: boolean;
      tone?: "positive" | "negative" | "auto";
      showPercent?: boolean;
    } = {},
  ) => ({
    id: label,
    cells: {
      row: {
        value: (
          <span className={cn(opts.indent && "pl-3", opts.emphasis && "font-semibold text-ink")}>
            {label}
          </span>
        ),
      },
      ...Object.fromEntries(
        projection.map((y) => {
          const { value, negative } = pick(y);
          const display = negative ? accounting(value.negated()) : money(value);
          const tone =
            opts.tone === "auto"
              ? value.isNegative()
                ? ("negative" as const)
                : ("positive" as const)
              : opts.tone;
          return [
            y.fiscalYear,
            {
              value: opts.showPercent ? (
                <>
                  <span className="block">{display}</span>
                  <span className="mt-0.5 block text-[10.5px] font-normal tabular-nums text-muted-2">
                    {percent(shareOfRevenue(value, y))}
                  </span>
                </>
              ) : (
                display
              ),
              tone,
              strong: opts.emphasis,
            },
          ];
        }),
      ),
    },
  });

  const componentRow = (component: FundBalanceComponent) =>
    moneyRow(
      `Less: ${FUND_BALANCE_COMPONENT_LABELS[component]}`,
      (y) => ({ value: y.componentBreakdown[component], negative: true }),
      { indent: true, tone: "negative", showPercent: true },
    );

  const methodOf = new Map<FundBalanceComponent, ForecastMethod>(
    componentRules.map((r) => [r.component, r.method]),
  );

  /**
   * ===================================================================================
   * THE REDESIGNED PAGE — a transcription of Figma 55:4317, on the same vocabulary as the
   * Current Position tab: the rail's four cards promoted to the Overview tile band (the
   * design's own move), the two calculation-flow cards on the 62%-white panels, the
   * reserve trend beside the forecast alerts on the 702/400 grid, and the planning note
   * at the floor. Every figure keeps the engine it always had.
   * ===================================================================================
   */
  const years = Math.max(projection.length - 1, 1);

  return (
    <FundBalanceShell scope={scope} active="/fund-balance/forecast" alertCount={fbAlerts.length}>
      {/* ---------- the Overview band — the old rail, as tiles ---------- */}
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
            label={`Projected ${years}-year change`}
            caption="Unassigned fund balance"
            value={accounting(change, { compact: true })}
            valueInk={change === null ? undefined : change.isNegative() ? "#fd4438" : "#1a932e"}
            sub={
              first && last
                ? `From ${compactMoney(first.unassigned)} to ${compactMoney(last.unassigned)}`
                : undefined
            }
            delta={
              changePct === null
                ? undefined
                : {
                    text: `${signedPercent(changePct)} ${changePct < 0 ? "decrease" : "increase"}`,
                    tone: deltaTone(changePct, "up"),
                    direction: changePct < 0 ? "down" : "up",
                  }
            }
          />

          <OverviewKpiTile
            arrow={false}
            icon="chart"
            tone="red"
            label="Projected lowest point"
            caption={lowest ? `FY ${lowest.fiscalYear}` : "Not enough data"}
            value={percent(lowest?.unassignedPercentOfRevenue)}
            sub="Unassigned fund balance % of revenues"
            status={ladder(toNumber(lowest?.unassignedPercentOfRevenue), fcT)}
          />

          <OverviewKpiTile
            arrow={false}
            icon="calendar"
            tone="green"
            label="Days of operating expenses"
            caption="Unassigned reserve, at plan end"
            value={daysAtEnd === null ? NOT_AVAILABLE : fmtDays(daysAtEnd)}
            chip={`Days in reserve${last ? ` by FY ${last.fiscalYear}` : ""}`}
          />

          <OverviewKpiTile
            arrow={false}
            icon="shield"
            tone="purple"
            label="Board policy"
            caption={`${fund.name} only`}
            value={`${reserveT.target.toFixed(2)}%`}
            valueInk="#1a932e"
            sub={
              <span>
                Unassigned fund balance %
                <span className="block font-normal text-[#797979]">Target (minimum)</span>
              </span>
            }
            chipRow={
              <>
                <span
                  className="inline-flex items-center whitespace-nowrap rounded-[20px] px-[8px] py-px text-[10px] leading-normal tracking-[0.1px]"
                  style={{ background: "rgba(230,95,43,0.18)", color: "#e65f2b" }}
                >
                  Warning below {reserveT.warning.toFixed(2)}%
                </span>
                <span
                  className="inline-flex items-center whitespace-nowrap rounded-[20px] px-[8px] py-px text-[10px] leading-normal tracking-[0.1px]"
                  style={{ background: "rgba(238,32,28,0.18)", color: "#fd4438" }}
                >
                  Critical below {reserveT.critical.toFixed(2)}%
                </span>
              </>
            }
          />
        </OverviewTileRow>
      </OverviewSection>

      {/* ================= the calculation flow ================= */}
      <OverviewPanel className="p-[18px]">
        <OverviewPanelHeader
          title="1. Forecast assumptions"
          subtitle="Set your assumptions for revenues, expenditures and fund balance components."
        />
        <div className="mt-[10px]">
          <AssumptionsForm
            fiscalYear={scope.fiscalYear}
            fundId={fund.id}
            fundName={fund.name}
            revenueGrowth={toNumber(growth.revenuePercent)}
            expenditureGrowth={toNumber(growth.expenditurePercent)}
            recurringRevenueAdjustment={toNumber(growth.recurringRevenueAdjustment)}
            oneTimeRevenueAdjustment={toNumber(growth.oneTimeRevenueAdjustment)}
            recurringExpenditureAdjustment={toNumber(growth.recurringExpenditureAdjustment)}
            oneTimeExpenditure={toNumber(growth.oneTimeExpenditure)}
            totalBudgetedDisplay={compactMoney(currentYearSpend)}
            oneTimeDisplay={accounting(oneTimeSpend?.negated() ?? 0, { compact: true })}
            recurringBaseDisplay={compactMoney(recurringBase)}
            components={componentRules.map((r) => ({
              component: r.component,
              method: r.method,
              annualIncreasePercent: toNumber(r.annualIncreasePercent),
              currentDisplay: compactMoney(r.current),
            }))}
            canEdit={canEdit}
          />
        </div>
      </OverviewPanel>

      <OverviewPanel className="p-[18px]">
        <OverviewPanelHeader
          title="2. Fund balance forecast"
          subtitle="Financial health view · forecast results update automatically when you adjust assumptions"
        />
        <div className="mt-[10px]">
          <DataTable
            dense
            columns={[
              // No basis label. It named a toggle that no longer exists, and with dollars
              // and percentages now on the same row there is no single basis to name.
              { key: "row", label: "" },
              ...projection.map((y) => ({
                key: y.fiscalYear,
                label:
                  y.index === 0
                    ? `FY ${y.fiscalYear} · current`
                    : `FY ${y.fiscalYear} · forecast ${y.index}`,
                align: "right" as const,
              })),
            ]}
            rows={[
              moneyRow("Beginning total fund balance", (y) => ({ value: y.beginning }), {
                emphasis: true,
              }),
              moneyRow("(+) Total revenues", (y) => ({ value: y.projectedRevenue }), {
                indent: true,
              }),
              moneyRow(
                "(−) Total expenditures (recurring + additions)",
                (y) => ({ value: y.projectedExpenditure, negative: true }),
                { indent: true, tone: "negative" },
              ),
              moneyRow("= Net surplus / (deficit)", (y) => ({ value: y.netChange }), {
                emphasis: true,
                tone: "auto",
              }),
              moneyRow("Ending total fund balance", (y) => ({ value: y.total }), {
                emphasis: true,
              }),
              componentRow("RESTRICTED"),
              componentRow("COMMITTED"),
              componentRow("NONSPENDABLE"),
              componentRow("ASSIGNED"),
              moneyRow("= Projected unassigned fund balance", (y) => ({ value: y.unassigned }), {
                emphasis: true,
                tone: "auto",
              }),
              {
                id: "reserve-percent",
                cells: {
                  row: { value: "Unassigned fund balance % of revenues" },
                  ...Object.fromEntries(
                    projection.map((y) => [
                      y.fiscalYear,
                      percent(y.unassignedPercentOfRevenue),
                    ]),
                  ),
                },
              },
              {
                id: "status",
                cells: {
                  row: { value: "Reserve status", strong: true },
                  ...Object.fromEntries(
                    projection.map((y) => [
                      y.fiscalYear,
                      {
                        value: (
                          <span className="flex justify-end">
                            <StatusBadge
                              status={ladder(
                                toNumber(y.unassignedPercentOfRevenue),
                                y.index === 0 ? reserveT : fcT,
                              )}
                              size="sm"
                              dot={false}
                            />
                          </span>
                        ),
                      },
                    ]),
                  ),
                },
              },
            ]}
          />
        </div>

        <p className="mt-[12px] text-[10px] leading-[1.7] tracking-[0.1px] text-[#060606]/[0.56]">
          Percentages are each figure&apos;s share of that year&apos;s projected revenues.
          Growth is applied from the current year&apos;s projected pace, not from the adopted
          budget. Expenditure growth compounds on the recurring operating base only, so
          one-time and carryforward spending does not build into future years.
          {projection.some((y) => y.componentsExceedTotal) && (
            <span className="mt-1 block text-[#b76a12]">
              In at least one year the designated components add up to more than the projected
              ending balance, which leaves a negative unassigned reserve.
            </span>
          )}
        </p>
      </OverviewPanel>

      {/* ================= trend and alerts — the 702 / 400 grid ================= */}
      <div className="grid grid-cols-1 items-stretch gap-x-[10px] gap-y-[12px] xl:grid-cols-[minmax(0,1.76fr)_minmax(0,1fr)]">
        <OverviewPanel className="flex flex-col p-[18px]">
          <OverviewPanelHeader
            title="Reserve trend"
            subtitle="Projected unassigned fund balance as a share of revenues"
          />
          <div className="mt-[10px]">
            <LineChart
              title="Projected reserve percentage"
              summary={`Projected unassigned reserve as a share of projected revenues across ${projection.length} fiscal years, against the district's own thresholds.`}
              categories={projection.map((y) => `FY${y.fiscalYear.slice(2)}`)}
              format={(v) => `${v.toFixed(1)}%`}
              height={260}
              zeroBased={false}
              legend={false}
              thresholds={[
                { at: reserveT.target, label: `Target ${reserveT.target}%`, color: "var(--color-strong-mark)" },
                { at: fcT.warning, label: `Warning ${fcT.warning}%`, color: "var(--color-monitor-mark)" },
                { at: fcT.critical, label: `Critical ${fcT.critical}%`, color: "var(--color-action-mark)" },
              ]}
              series={[
                {
                  key: "reserve",
                  label: "Projected reserve %",
                  color: "var(--color-viz-forecast)",
                  labelLast: true,
                  points: projection.map((y) => ({
                    value: toNumber(y.unassignedPercentOfRevenue),
                    label: percent(y.unassignedPercentOfRevenue, 1),
                  })),
                },
              ]}
            />
          </div>
        </OverviewPanel>

        <OverviewPanel className="flex flex-col p-[18px]">
          <div className="flex flex-wrap items-center justify-between gap-[10px]">
            <OverviewPanelHeader title="Forecast alerts" />
            <PillLink href={options.link("/alerts")} arrow="#FD4438" className="border-[0.8px] border-[#e7e7e7]">
              {GO_TO.alerts}
            </PillLink>
          </div>
          <div className="mt-[6px]">
            <AlertList
              mode={scope.labelMode}
              alerts={fbAlerts
                .filter((a) => a.id.startsWith("FORECAST"))
                .map((a) => ({ id: a.id, severity: a.severity, title: a.title, message: a.message }))}
              href={options.link("/alerts")}
              empty="The projected reserve stays within your thresholds across the plan."
            />
          </div>

          <dl className="mt-auto flex flex-col border-t border-[#e7e7e7] pt-[10px]">
            {componentRules.map((r) => (
              <div
                key={r.component}
                className="flex items-baseline justify-between gap-3 py-[5px] text-[12px]"
              >
                <dt className="text-[#797979]">{FUND_BALANCE_COMPONENT_LABELS[r.component]}</dt>
                <dd className="text-right font-semibold text-[#060606]">
                  {methodLabel(methodOf.get(r.component))}
                </dd>
              </div>
            ))}
          </dl>
        </OverviewPanel>
      </div>

      {/* ---------- the planning note — Figma 55:4459 ---------- */}
      <OverviewPanel className="p-[18px]">
        <p className="text-[12px] font-bold leading-[22px] tracking-[-0.43px] text-black/85">
          Note
        </p>
        <p className="text-[12px] leading-[16px] tracking-[-0.23px] text-black/50">
          These projections extrapolate the current year&apos;s pace and apply your own growth
          assumptions and component rules. They are a planning aid, not a budget. Statutory
          minimum {statutoryMinimum.toFixed(2)}% · forecast warning {fcT.warning.toFixed(2)}% ·
          forecast critical {fcT.critical.toFixed(2)}%.
        </p>
        {userCan(user, "configure_district") && (
          <Link
            href="/policies"
            className="mt-[8px] inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#301a93] hover:underline"
          >
            <Icon name="settings" size={13} />
            {MANAGE.fundBalancePolicies}
          </Link>
        )}
      </OverviewPanel>
    </FundBalanceShell>
  );
}


function methodLabel(method: ForecastMethod | undefined): string {
  switch (method) {
    case "ONE_TIME_CARRYFORWARD":
      return "One-time carryforward";
    case "INCREASE_BY_PERCENT":
      return "Increase by %";
    case "MANUAL_OVERRIDE":
      return "Manual override";
    default:
      return "Carry forward";
  }
}
