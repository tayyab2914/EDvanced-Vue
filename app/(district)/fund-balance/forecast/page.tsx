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
  FORECAST_METHOD_LABELS,
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
          Multi-year projection and the projected unassigned fund balance apply to the General Fund
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
  /*
    NO PERCENTAGE CHANGE HERE ANY MORE. The tile used to print one beside the dollars, and
    over a plan whose base can be a DEFICIT the arithmetic is not wrong so much as
    meaningless — going from −$23.31M to −$107.12M is a "−359.53% decrease" only if you
    accept a negative denominator, and a board reads that as a rate rather than as the
    $83.81M it actually is. The two endpoints are printed instead.
  */
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
          <span className={cn(opts.indent && "pl-3", opts.emphasis && "font-semibold text-[#060606]")}>
            {label}
          </span>
        ),
      },
      ...Object.fromEntries(
        projection.map((y) => {
          const { value, negative } = pick(y);
          /*
            ABBREVIATED, like every other figure on these dashboards. Written out in full,
            four columns of "$181,087,169.74" are fifteen characters each and the row reads
            as a wall of digits — the reader is comparing years, and the digits that decide
            that comparison are the first three. The exact figure stays on the cell's title
            for anyone who needs the cents.
          */
          const display = negative
            ? accounting(value.negated(), { compact: true })
            : compactMoney(value);
          const exact = negative ? accounting(value.negated()) : money(value);
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
                  <span className="mt-0.5 block text-[11px] font-normal tabular-nums text-[#060606]">
                    {percent(shareOfRevenue(value, y))}
                  </span>
                </>
              ) : (
                display
              ),
              title: exact,
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
  // The page says "three-year" in two places. `years` is derived from what was actually
  // projected, so spelling it out here keeps the sentence true if the horizon ever moves.
  const horizon = ["", "one", "two", "three", "four", "five"][years] ?? String(years);

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
            label={`${years}-year Projected Change`}
            caption="Unassigned Fund Balance"
            value={accounting(change, { compact: true })}
            valueInk={change === null ? undefined : change.isNegative() ? "#fd4438" : "#1a932e"}
            /*
              THE WALK, AS AN ARROW: "−$23.31M → −$107.12M". "From X to Y" is the same two
              endpoints spelled out, and the delta line under it ("−359.53% decrease") was a
              third statement of a change the figure above and the endpoints below both
              already make — on a base that swings through zero, a percentage change of a
              deficit is closer to noise than to information.
            */
            sub={
              first && last
                ? `${accounting(first.unassigned, { compact: true })} → ${accounting(last.unassigned, { compact: true })}`
                : undefined
            }
          />

          <OverviewKpiTile
            arrow={false}
            icon="chart"
            tone="red"
            label="Lowest Projected Reserve %"
            caption={lowest ? `FY ${lowest.fiscalYear}` : "Not enough data"}
            value={percent(lowest?.unassignedPercentOfRevenue)}
            /* Names the DENOMINATOR, since the label already names the subject. Revenues is
               this screen's divisor throughout — see `shareOfRevenue` above. */
            sub="of projected General Fund revenue"
            status={ladder(toNumber(lowest?.unassignedPercentOfRevenue), fcT)}
          />

          <OverviewKpiTile
            arrow={false}
            icon="calendar"
            tone="green"
            label="Projected Days in Reserve"
            /* The plan-end year IS the caption now; the chip under the figure used to say
               "Days in reserve by FY 2029-30", which repeated both the label and this. */
            caption={last ? `FY ${last.fiscalYear}` : "At plan end"}
            value={daysAtEnd === null ? NOT_AVAILABLE : fmtDays(daysAtEnd)}
          />

          <OverviewKpiTile
            arrow={false}
            icon="shield"
            tone="purple"
            label="Board Reserve Target"
            caption={fund.name}
            value={`${reserveT.target.toFixed(2)}%`}
            valueInk="#1a932e"
            /* One line, not two: "Target (minimum)" under "Unassigned fund balance %" split
               a single idea across two rows, and "minimum" is what the two rules below
               (warning / critical) are measured down from. */
            sub="Minimum Unassigned Fund Balance"
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
          title="1. Forecast Assumptions"
          subtitle={`Set assumptions for revenue, expenditures, and fund balance components used in the ${horizon}-year forecast.`}
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
          title="2. Fund Balance Forecast"
          subtitle={`${horizon.charAt(0).toUpperCase()}${horizon.slice(
            1,
          )}-year outlook · results update automatically as assumptions change`}
        />
        <div className="mt-[10px]">
          <DataTable
            dense
            columns={[
              // No basis label. It named a toggle that no longer exists, and with dollars
              // and percentages now on the same row there is no single basis to name.
              { key: "row", label: "" },
              /*
                THE YEAR, THEN WHAT IT IS. "FY 2026-27 · current" on one line put the two
                on equal footing and made the header the widest thing in its column; the
                year is what a reader scans across, and "current / forecast 1" is the
                qualifier under it.
              */
              ...projection.map((y) => ({
                key: y.fiscalYear,
                label: (
                  <>
                    <span className="block">FY {y.fiscalYear}</span>
                    <span className="mt-0.5 block text-[11px] font-normal text-[#060606]">
                      {y.index === 0 ? "Current" : `Year ${y.index}`}
                    </span>
                  </>
                ),
                align: "right" as const,
              })),
            ]}
            rows={[
              moneyRow("Beginning Fund Balance", (y) => ({ value: y.beginning }), {
                emphasis: true,
              }),
              moneyRow("+ Projected Revenues", (y) => ({ value: y.projectedRevenue }), {
                indent: true,
              }),
              moneyRow(
                "− Projected Expenditures",
                (y) => ({ value: y.projectedExpenditure, negative: true }),
                { indent: true, tone: "negative" },
              ),
              moneyRow("= Projected surplus / (deficit)", (y) => ({ value: y.netChange }), {
                emphasis: true,
                tone: "auto",
              }),
              moneyRow("Projected Ending Fund Balance", (y) => ({ value: y.total }), {
                emphasis: true,
              }),
              componentRow("RESTRICTED"),
              componentRow("COMMITTED"),
              componentRow("NONSPENDABLE"),
              componentRow("ASSIGNED"),
              moneyRow("= Projected Unassigned Fund Balance", (y) => ({ value: y.unassigned }), {
                emphasis: true,
                tone: "auto",
              }),
              {
                id: "reserve-percent",
                cells: {
                  row: { value: "Unassigned Fund Balance %" },
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
                  row: { value: "Reserve Status", strong: true },
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

        <p className="mt-[12px] text-[10px] leading-[1.7] tracking-[0.1px] text-[#060606]">
          Percentages represent each component&apos;s share of projected revenue for that
          year. Revenue and expenditure growth is applied to the current projected operating
          base, not the adopted budget. One-time and carryforward expenditures are excluded
          from the recurring base and do not compound into future years.
          {projection.some((y) => y.componentsExceedTotal) && (
            <span className="mt-1 block text-[#b76a12]">
              In at least one projected year, designated fund balance components exceed the
              projected ending fund balance, resulting in a negative unassigned fund balance.
            </span>
          )}
        </p>
      </OverviewPanel>

      {/* ================= trend and alerts — the 702 / 400 grid ================= */}
      <div className="grid grid-cols-1 items-stretch gap-x-[10px] gap-y-[12px] xl:grid-cols-[minmax(0,1.76fr)_minmax(0,1fr)]">
        <OverviewPanel className="flex flex-col p-[18px]">
          <OverviewPanelHeader
            title="Unassigned Fund Balance Trend"
            subtitle="Projected unassigned fund balance as a % of projected General Fund revenue"
          />
          <div className="mt-[10px]">
            <LineChart
              title="Projected reserve percentage"
              summary={`Projected unassigned fund balance as a share of projected revenues across ${projection.length} fiscal years, against the district's own thresholds.`}
              categories={projection.map((y) => `FY${y.fiscalYear.slice(2)}`)}
              format={(v) => `${v.toFixed(1)}%`}
              height={260}
              zeroBased={false}
              legend={false}
              thresholds={[
                { at: reserveT.target, label: `Board Target ${reserveT.target}%`, color: "var(--color-strong-mark)" },
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
            <OverviewPanelHeader title="Forecast Alerts" />
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

          {/* The methods chosen in panel C of card 1, restated where the alerts are read —
              a reserve alert is only interpretable next to the rules that produced it. It
              had no heading, so four "Carry Forward"s sat under the alert list looking like
              part of it. */}
          <div className="mt-auto border-t border-[#e7e7e7] pt-[10px]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-[#060606]">
              Fund Balance Component Methods
            </p>
            <dl className="mt-[4px] flex flex-col">
            {componentRules.map((r) => (
              <div
                key={r.component}
                className="flex items-baseline justify-between gap-3 py-[5px] text-[12px]"
              >
                <dt className="text-[#060606]">{FUND_BALANCE_COMPONENT_LABELS[r.component]}</dt>
                <dd className="text-right font-semibold text-[#060606]">
                  {FORECAST_METHOD_LABELS[methodOf.get(r.component) ?? "CARRY_FORWARD"]}
                </dd>
              </div>
            ))}
            </dl>
          </div>
        </OverviewPanel>
      </div>

      {/* ---------- the planning note — Figma 55:4459 ---------- */}
      <OverviewPanel className="p-[18px]">
        <p className="text-[12px] font-bold leading-[22px] tracking-[-0.43px] text-[#060606]">
          Note
        </p>
        <p className="text-[12px] leading-[16px] tracking-[-0.23px] text-[#060606]">
          Forecasts are based on the current projected operating base, user-defined growth
          assumptions, and selected fund balance component methods. Results are intended for
          planning purposes and do not represent an adopted budget.
        </p>
        {/* The four thresholds on their own line — they were the tail of the paragraph
            above, where a reader looking up "what is the warning again" had to read a
            disclaimer to find it. */}
        <p className="mt-[6px] text-[12px] leading-[16px] tracking-[-0.23px] text-[#060606]">
          Board target {reserveT.target.toFixed(2)}% · Statutory minimum{" "}
          {statutoryMinimum.toFixed(2)}% · Warning {fcT.warning.toFixed(2)}% · Critical{" "}
          {fcT.critical.toFixed(2)}%
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

