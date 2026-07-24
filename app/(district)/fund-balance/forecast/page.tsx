import { redirect } from "next/navigation";
import Link from "next/link";
import { getTenantDb, userCan } from "@/lib/auth/dal";
import { resolveScope } from "@/lib/dashboard/scope";
import { loadCore, reserveThresholds, forecastReserveThresholds } from "@/lib/dashboard/load";
import { projectFundBalance, districtGrowth, componentAssumptions } from "@/lib/forecast/engine";
import { ladder } from "@/lib/dashboard/status";
import {
  compactMoney,
  accounting,
  percent,
  toNumber,
  signedPercent,
  days as fmtDays,
  NOT_AVAILABLE,
} from "@/lib/dashboard/format";
import { SectionCard, FooterInfoBar } from "@/components/dashboard/section-card";
import { DataTable } from "@/components/dashboard/data-table";
import { AlertList } from "@/components/dashboard/alert-list";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { EmptyState, Row } from "@/components/dashboard/shared";
import { LineChart } from "@/components/dashboard/charts/line-chart";
import { Icon } from "@/components/icons";
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
  searchParams: Promise<{ fy?: string; period?: string; fund?: string; basis?: string }>;
}) {
  const { db, user, districtId } = await getTenantDb();
  if (!userCan(user, "view_dashboards")) redirect("/master-data");

  const sp = await searchParams;
  const scope = await resolveScope(db, districtId, sp);
  const asPercent = sp.basis === "percent";

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
      lo === null || (y.reservePercent && lo.reservePercent && y.reservePercent.lessThan(lo.reservePercent))
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

  const q = new URLSearchParams();
  if (scope.fiscalYear) q.set("fy", scope.fiscalYear);
  if (scope.period) q.set("period", String(scope.period));
  if (scope.fundId) q.set("fund", scope.fundId);
  const basisHref = (basis: "dollars" | "percent") => {
    const next = new URLSearchParams(q);
    if (basis === "percent") next.set("basis", "percent");
    return `/fund-balance/forecast?${next.toString()}`;
  };

  /**
   * A row of the calculation flow.
   *
   * `basis` decides whether a money row shows dollars or its share of that year's projected
   * expenditure — the client's "Dollars | % of Expenditures" toggle. The percentage view
   * exists because a board comparing a district against its own policy is comparing
   * percentages, and doing that arithmetic in your head across four columns is how mistakes
   * get made.
   */
  const moneyRow = (
    label: string,
    pick: (y: (typeof projection)[number]) => { value: import("@/lib/generated/prisma/client").Prisma.Decimal; negative?: boolean },
    opts: { emphasis?: boolean; indent?: boolean; tone?: "positive" | "negative" | "auto" } = {},
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
          const display = asPercent
            ? y.projectedExpenditure.isZero()
              ? NOT_AVAILABLE
              : percent(value.dividedBy(y.projectedExpenditure).times(100))
            : negative
              ? accounting(value.negated(), { compact: true })
              : compactMoney(value);
          const tone =
            opts.tone === "auto"
              ? value.isNegative()
                ? ("negative" as const)
                : ("positive" as const)
              : opts.tone;
          return [y.fiscalYear, { value: display, tone, strong: opts.emphasis }];
        }),
      ),
    },
  });

  const componentRow = (component: FundBalanceComponent) =>
    moneyRow(
      `Less: ${FUND_BALANCE_COMPONENT_LABELS[component]}`,
      (y) => ({ value: y.componentBreakdown[component], negative: true }),
      { indent: true, tone: "negative" },
    );

  const methodOf = new Map<FundBalanceComponent, ForecastMethod>(
    componentRules.map((r) => [r.component, r.method]),
  );

  return (
    <FundBalanceShell scope={scope} active="/fund-balance/forecast" alertCount={fbAlerts.length}>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,272px)]">
        {/* ================= the calculation flow ================= */}
        <div className="flex min-w-0 flex-col gap-4">
          <SectionCard
            title="1. Forecast assumptions"
            subtitle="Set your assumptions for revenues, expenditures and fund balance components."
            info="A district that enters nothing gets 0% growth and every component carried forward flat — which is an assumption too, and usually an optimistic one."
          >
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
          </SectionCard>

          <SectionCard
            title="2. Fund balance forecast"
            subtitle="Financial health view · forecast results update automatically when you adjust assumptions"
            control={
              <div className="flex overflow-hidden rounded-lg border border-line text-[11.5px] font-medium">
                <Link
                  href={basisHref("dollars")}
                  className={cn(
                    "px-2.5 py-1 transition-colors",
                    asPercent ? "bg-white text-muted hover:text-ink-soft" : "bg-brand text-white",
                  )}
                >
                  Dollars
                </Link>
                <Link
                  href={basisHref("percent")}
                  className={cn(
                    "border-l border-line px-2.5 py-1 transition-colors",
                    asPercent ? "bg-brand text-white" : "bg-white text-muted hover:text-ink-soft",
                  )}
                >
                  % of expenditures
                </Link>
              </div>
            }
          >
            <DataTable
              dense
              columns={[
                { key: "row", label: asPercent ? "(% of expenditures)" : "(Dollars)" },
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
                    row: { value: "Unassigned fund balance % of expenditures" },
                    ...Object.fromEntries(
                      projection.map((y) => [y.fiscalYear, percent(y.reservePercent)]),
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
                                  toNumber(y.reservePercent),
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

            <p className="mt-3 text-[11.5px] leading-relaxed text-muted-2">
              Growth is applied from the current year&apos;s projected pace, not from the adopted
              budget. Expenditure growth compounds on the recurring operating base only, so
              one-time and carryforward spending does not build into future years.
              {projection.some((y) => y.componentsExceedTotal) && (
                <span className="mt-1 block text-monitor">
                  In at least one year the designated components add up to more than the projected
                  ending balance, which leaves a negative unassigned reserve.
                </span>
              )}
            </p>
          </SectionCard>
        </div>

        {/* ================= the rail ================= */}
        <div className="flex flex-col gap-4">
          <RailCard title="Board policy" caption={`${fund.name} only`}>
            <p className="text-[11.5px] text-muted-2">Unassigned fund balance %</p>
            <p className="mt-1 text-[28px] font-semibold leading-none tracking-[-0.6px] text-strong">
              {reserveT.target.toFixed(2)}%
            </p>
            <p className="mt-1 text-[11px] text-muted-2">Target (minimum)</p>

            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line-soft pt-3">
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-monitor">
                  Warning
                </p>
                <p className="mt-0.5 text-[17px] font-semibold tabular-nums text-monitor">
                  {reserveT.warning.toFixed(2)}%
                </p>
                <p className="text-[10.5px] text-muted-2">Below this</p>
              </div>
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-action">
                  Critical
                </p>
                <p className="mt-0.5 text-[17px] font-semibold tabular-nums text-action">
                  {reserveT.critical.toFixed(2)}%
                </p>
                <p className="text-[10.5px] text-muted-2">Below this</p>
              </div>
            </div>

            <p className="mt-3 border-t border-line-soft pt-3 text-[11px] text-muted-2">
              Statutory minimum {statutoryMinimum.toFixed(2)}% · forecast warning{" "}
              {fcT.warning.toFixed(2)}% · forecast critical {fcT.critical.toFixed(2)}%
            </p>

            {userCan(user, "configure_district") && (
              <Link
                href="/policies"
                className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-brand hover:underline"
              >
                <Icon name="settings" size={13} />
                Manage policies
              </Link>
            )}
          </RailCard>

          <RailCard title={`Projected ${Math.max(projection.length - 1, 1)}-year change`}>
            <p className="text-[11.5px] text-muted-2">Unassigned fund balance</p>
            <p
              className={cn(
                "mt-1 text-[26px] font-semibold leading-none tracking-[-0.6px]",
                change === null ? "text-muted-2" : change.isNegative() ? "text-action" : "text-strong",
              )}
            >
              {accounting(change, { compact: true })}
            </p>
            {first && last && (
              <p className="mt-1.5 text-[11.5px] text-muted-2">
                From {compactMoney(first.unassigned)} to {compactMoney(last.unassigned)}
              </p>
            )}
            {changePct !== null && (
              <p
                className={cn(
                  "mt-1 text-[12px] font-semibold tabular-nums",
                  changePct < 0 ? "text-action" : "text-strong",
                )}
              >
                {signedPercent(changePct)} {changePct < 0 ? "decrease" : "increase"}
              </p>
            )}
          </RailCard>

          <RailCard title="Projected lowest point">
            <p className="text-[11.5px] text-muted-2">
              {lowest ? `FY ${lowest.fiscalYear}` : "Not enough data"}
            </p>
            <p className="mt-1 text-[26px] font-semibold leading-none tracking-[-0.6px] text-ink">
              {percent(lowest?.reservePercent)}
            </p>
            <p className="mt-1.5 text-[11.5px] text-muted-2">
              Unassigned fund balance % of expenditures
            </p>
            <div className="mt-2.5">
              <StatusBadge status={ladder(toNumber(lowest?.reservePercent), fcT)} size="md" />
            </div>
          </RailCard>

          <RailCard title="Days of operating expenses">
            <div className="flex items-center gap-3">
              <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-lg bg-[#ece8f8] text-[#5b4bb5]">
                <Icon name="calendar" size={17} />
              </span>
              <span>
                <span className="block text-[24px] font-semibold leading-none tracking-[-0.5px] text-ink">
                  {daysAtEnd === null ? NOT_AVAILABLE : fmtDays(daysAtEnd)}
                </span>
                <span className="mt-1 block text-[11.5px] text-muted-2">
                  Days in reserve{last ? ` by FY ${last.fiscalYear}` : ""}
                </span>
              </span>
            </div>
          </RailCard>
        </div>
      </div>

      {/* ================= trend and alerts ================= */}
      <Row cols="2-1">
        <SectionCard
          title="Reserve trend"
          subtitle="Projected unassigned fund balance as a share of expenditures"
        >
          <LineChart
            title="Projected reserve percentage"
            summary={`Projected unassigned reserve across ${projection.length} fiscal years, against the district's own thresholds.`}
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
                  value: toNumber(y.reservePercent),
                  label: percent(y.reservePercent, 1),
                })),
              },
            ]}
          />
        </SectionCard>

        <SectionCard title="Forecast alerts" footer="View all alerts" footerHref="/alerts">
          <AlertList
            alerts={fbAlerts
              .filter((a) => a.id.startsWith("FORECAST"))
              .map((a) => ({ id: a.id, severity: a.severity, title: a.title, message: a.message }))}
            href="/alerts"
            empty="The projected reserve stays within your thresholds across the plan."
          />

          <dl className="mt-4 flex flex-col border-t border-line-soft pt-3">
            {componentRules.map((r) => (
              <div
                key={r.component}
                className="flex items-baseline justify-between gap-3 py-1.5 text-[11.5px]"
              >
                <dt className="text-muted">{FUND_BALANCE_COMPONENT_LABELS[r.component]}</dt>
                <dd className="text-right font-medium text-ink-muted">
                  {methodLabel(methodOf.get(r.component))}
                </dd>
              </div>
            ))}
          </dl>
        </SectionCard>
      </Row>

      <FooterInfoBar>
        These projections extrapolate the current year&apos;s pace and apply your own growth
        assumptions and component rules. They are a planning aid, not a budget.
      </FooterInfoBar>
    </FundBalanceShell>
  );
}

/** A compact card for the right-hand rail — smaller chrome than a SectionCard. */
function RailCard({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-white p-4 shadow-[0_1px_2px_rgba(15,32,56,0.04)]">
      <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.055em] text-heading">
        {title}
        {caption && (
          <span className="ml-1 font-medium normal-case tracking-normal text-muted-2">
            ({caption})
          </span>
        )}
      </h3>
      <div className="mt-2.5">{children}</div>
    </section>
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
