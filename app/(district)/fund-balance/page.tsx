import { redirect } from "next/navigation";
import Link from "next/link";
import type { Prisma } from "@/lib/generated/prisma/client";
import { getTenantDb, userCan } from "@/lib/auth/dal";
import { resolveScope } from "@/lib/dashboard/scope";
import { loadCore, reserveThresholds, periodAxisLabels } from "@/lib/dashboard/load";
import { byFund, primaryClassification } from "@/lib/finance/breakdown";
import { activityTotals } from "@/lib/finance/engine";
import { ladder, bands as statusBands } from "@/lib/dashboard/status";
import {
  reserveCaption,
  reserveSubject,
  reserveTileLabel,
  reserveUnavailableReason,
  reserveMethodology,
} from "@/lib/dashboard/reserve";
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
import { SectionCard, FooterInfoBar } from "@/components/dashboard/section-card";
import { KpiTile, KpiRow } from "@/components/dashboard/kpi-tile";
import { DataTable } from "@/components/dashboard/data-table";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { EmptyState, Row, KeyInsightBar } from "@/components/dashboard/shared";
import { LineChart } from "@/components/dashboard/charts/line-chart";
import { ShareBars, MetricStrip } from "@/components/dashboard/charts/budget-bars";
import { WaterfallChart, waterfallFoots } from "@/components/dashboard/charts/waterfall-chart";
import { BenchmarkBand } from "@/components/dashboard/charts/benchmark-band";
import { ViewBy } from "@/components/dashboard/view-by";
import { FundBalanceShell } from "./shell";
import { COMPONENT_COLORS, SERIES_SLOTS } from "@/lib/dashboard/palette";
import { codeName } from "@/lib/text";
import { labelMode } from "@/lib/dashboard/label-mode";
import { DimLabel } from "@/components/dashboard/dim-label";
import { PageHeader } from "@/components/page-header";
import { FUND_BALANCE_VIEWS, resolveView } from "@/lib/dashboard/view";
import { GO_TO } from "@/lib/dashboard/cta";
import { scopeOptions } from "@/lib/dashboard/options";
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
 * Fund Balance — Current Position (Spec §6.1), rebuilt to the client's M4 layout.
 *
 * Two substantive changes behind the rearrangement:
 *
 *   The by-fund table now shows the ENDING FUND BALANCE and nothing else per fund. The
 *   client's reasoning: "from an executive/CFO perspective, the primary focus is the ending
 *   fund balance for each fund and status." Revenue and spending YTD per fund were columns
 *   answering a question this page does not ask — they live on the Revenue and Expenditures
 *   dashboards, which is where someone comparing them would be.
 *
 *   "Reserve against policy" is now "Fund balance %", and the strip beneath it prints each
 *   band's name and range rather than cramming the name inside the band.
 */
export default async function FundBalancePage({
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
  const view = resolveView(FUND_BALANCE_VIEWS, sp.groupBy);

  if (scope.empty) {
    return (
      <div className="animate-fade-up space-y-[18px]">
        <PageHeader title="Fund Balance" description="Track fund balance, reserve levels, and plan for the future." />
        <EmptyState title="No fund balance yet" action="Upload data" href="/data/upload">
          Fund balance is derived from your opening balance plus the year&apos;s revenue and
          spending. Upload an opening fund balance and a monthly detail file to see it.
        </EmptyState>
      </div>
    );
  }

  const core = await loadCore(db, districtId, scope);
  const { series, point, previous, policy, alerts, codes, reserve } = core;
  const fbAlerts = (alerts?.alerts ?? []).filter((a) => a.group === "fundBalance");

  const reserveT = reserveThresholds(policy);
  const reservePct = toNumber(reserve?.percent);
  const reserveRung = ladder(reservePct, reserveT);
  const statutoryMinimum = Number(policy.fundBalance.boardPolicyMinimum);

  /**
   * The reserve's own vocabulary, resolved once.
   *
   * `reserve` is the General Fund's projected ending position — not the scoped period's
   * balance, which is what `unassignedNow` below still is. The two are deliberately both on
   * this page: a district wants the balance it holds today AND the one its budget is
   * steering toward, and conflating them is what the captions here exist to prevent.
   */
  const reserveOf = reserveCaption(reserve);
  const isOutturn = reserve?.actual === true;

  /**
   * The required reserve and what sits above it — the district's own two lines.
   *
   * Their sheet reads "Required Reserve (3%)" and "Excess Unassigned Above Required
   * Reserve", and the second is what a board actually has room to spend. Both come from
   * `reserve`; neither is a new query.
   *
   * `excess` goes NEGATIVE when the district is short of the statutory floor. That is not a
   * negative surplus and must not render as one — the split below flips to a shortfall row,
   * which is the only version of this a finance officer can act on.
   */
  const requiredReserve = reserve?.required ?? null;
  const excessUnassigned = reserve?.excess ?? null;
  const isShort = excessUnassigned !== null && excessUnassigned.isNegative();

  const totalNow = point?.fundBalance ?? null;
  const totalPrev = previous?.fundBalance ?? null;
  const change = totalNow && totalPrev ? totalNow.minus(totalPrev) : null;
  const changePct = changePercent(totalNow, totalPrev);
  const unassignedNow = point?.unassignedFundBalance ?? null;
  const unassignedPrev = previous?.unassignedFundBalance ?? null;
  const unassignedChange =
    unassignedNow && unassignedPrev ? unassignedNow.minus(unassignedPrev) : null;

  const labels = periodAxisLabels(scope, series.points.length);

  // The waterfall's movements and the by-fund table: two reads with nothing between them,
  // so they go together rather than one after the other. (The totals are usually free —
  // `loadCore` already asked for this exact scope — but the by-fund read is not.)
  const [totals, fundRows] = await Promise.all([
    // The waterfall's movements, taken from the engine rather than assembled by hand.
    activityTotals(
      db,
      { fiscalYear: scope.fiscalYear, period: scope.period, filter: scope.filter },
      codes,
    ),
    byFund(db, {
      revenueVersionId: core.versions.get("REVENUE_DETAIL"),
      expenditureVersionId: core.versions.get("EXPENDITURE_DETAIL"),
      cashVersionId: core.versions.get("CASH_POSITION"),
      openingVersionId: core.versions.get("OPENING_FUND_BALANCE"),
      filter: scope.filter,
    }),
  ]);

  const opening = toNumber(series.opening?.total) ?? 0;
  const steps = [
    { label: "Beginning", value: opening, anchor: true, display: compactMoney(series.opening?.total) },
    {
      label: "Operating revenue",
      value: toNumber(totals.operatingRevenueYtd) ?? 0,
      display: compactMoney(totals.operatingRevenueYtd),
    },
    { label: "Transfers in", value: toNumber(totals.transfersInYtd) ?? 0, display: compactMoney(totals.transfersInYtd) },
    {
      label: "Other financing",
      value: toNumber(totals.otherFinancingYtd) ?? 0,
      display: compactMoney(totals.otherFinancingYtd),
    },
    {
      label: "Operating spend",
      value: -(toNumber(totals.operatingExpenditureYtd) ?? 0),
      display: accounting(totals.operatingExpenditureYtd.negated(), { compact: true }),
    },
    {
      label: "Transfers out",
      value: -(toNumber(totals.transfersOutYtd) ?? 0),
      display: accounting(totals.transfersOutYtd.negated(), { compact: true }),
    },
    { label: "Ending", value: toNumber(totalNow) ?? 0, anchor: true, display: compactMoney(totalNow) },
  ];
  // Seven components, not the reference's six — other financing sources are a real
  // movement and dropping them would stop the last bar equalling the running total.
  const foots = waterfallFoots(steps, toNumber(totalNow) ?? 0);

  const withBalance = fundRows.filter((f) => f.fundBalance !== null);
  const allFundsTotal = withBalance.reduce(
    (a, f) => (f.fundBalance ? a + (toNumber(f.fundBalance) ?? 0) : a),
    0,
  );

  const o = series.opening;
  const components = o
    ? [
        { label: "Nonspendable", value: toNumber(o.nonspendable) ?? 0, amount: o.nonspendable },
        { label: "Restricted", value: toNumber(o.restricted) ?? 0, amount: o.restricted },
        { label: "Committed", value: toNumber(o.committed) ?? 0, amount: o.committed },
        { label: "Assigned", value: toNumber(o.assigned) ?? 0, amount: o.assigned },
        { label: "Unassigned", value: toNumber(unassignedNow) ?? 0, amount: unassignedNow },
      ].filter((c) => c.value > 0)
    : [];
  const componentTotal = components.reduce((a, c) => a + c.value, 0);

  /**
   * ===================================================================================
   * THE FUND BALANCE COMPONENTS BREAKDOWN — the district's own sheet, as a table.
   * ===================================================================================
   *
   * Every line stated as a share of the SAME denominator the reserve percentage uses, so
   * the column adds up down the page and the total row is the reserve KPI in the row above.
   * That is the property the district's own workbook has and the platform did not: their
   * sheet reads 0.19% + 1.45% + 0.39% + 3.00% + 0.65% = 5.68%, and a reader can check it.
   *
   * The two lines that are new:
   *
   *   REQUIRED RESERVE — the statutory floor in dollars, `stateMinimum`% of the denominator.
   *   Not imported and not a component the district designates; it is a rule applied to the
   *   revenue figure, which is why it is computed here rather than read off a file.
   *
   *   EXCESS UNASSIGNED — what is left above that floor, and the only line on this page that
   *   answers "how much room do we actually have?". Negative when the district is short,
   *   and it renders as a SHORTFALL row in that case: a board reading "Excess: −$4.2M"
   *   would have to do the sign arithmetic itself to notice it is in trouble.
   *
   * The designated components come from the opening balance, which is correct under this
   * model — a district re-designates by board action, which arrives as a new Opening Fund
   * Balance or an override, never as a side effect of monthly activity.
   */
  const breakdownDivisor = reserve?.budget ?? null;
  const breakdownShare = (v: Prisma.Decimal | null) =>
    v === null || breakdownDivisor === null || breakdownDivisor.isZero()
      ? "—"
      : percent(v.dividedBy(breakdownDivisor).times(100));

  const designated = o
    ? ([
        { label: "Nonspendable", amount: o.nonspendable },
        { label: "Restricted", amount: o.restricted },
        { label: "Committed", amount: o.committed },
        { label: "Assigned", amount: o.assigned },
      ] as const).filter((c) => c.amount !== null && !c.amount.isZero())
    : [];

  const breakdownRows = [
    ...designated.map((c) => ({
      id: c.label,
      cells: {
        line: c.label,
        amount: { value: money(c.amount), strong: false },
        share: breakdownShare(c.amount),
      },
    })),
    {
      id: "required",
      cells: {
        line: `Required reserve (${reserve?.requiredPercent.toFixed(2) ?? "—"}%)`,
        amount: { value: money(requiredReserve), strong: true },
        share: breakdownShare(requiredReserve),
      },
    },
    {
      id: "excess",
      // The shortfall case tints the row and renames the line. See the note above.
      flag: isShort ? ("negative" as const) : undefined,
      cells: {
        line: isShort ? "Shortfall against required reserve" : "Excess unassigned above required reserve",
        amount: {
          value: money(isShort && excessUnassigned ? excessUnassigned.abs() : excessUnassigned),
          tone: isShort ? ("negative" as const) : ("positive" as const),
          strong: true,
        },
        share: breakdownShare(excessUnassigned === null ? null : excessUnassigned.abs()),
      },
    },
  ];

  /**
   * The composition card's "view by fund" rows — the client's "Fund Balance Composition is
   * View By → Fund".
   *
   * Scoped like the classification view it replaces, and unlike the by-fund TABLE in the row
   * above. That table is a directory: a district reading it while scoped to the General Fund
   * still wants to see every fund's ending balance. This is a COMPOSITION of the total
   * printed beneath it, so its slices have to come from the same slice of the district.
   *
   * Positive balances only, because a share bar cannot draw a negative slice and a deficit
   * fund would otherwise take a bar as though it held money. A fund in deficit is named in
   * the by-fund table above with a Deficit badge and a tinted row, which is where that fact
   * belongs.
   *
   * No extra query: `byFund` is already loaded.
   */
  const fundSlices = withBalance
    .filter((f) => !scope.fundId || f.fundId === scope.fundId)
    .map((f) => ({ id: f.fundId, label: codeName(f.code, f.name, scope.labelMode), value: toNumber(f.fundBalance) ?? 0 }))
    .filter((f) => f.value > 0)
    .sort((a, b) => b.value - a.value);
  // Six categorical slots; a seventh fund folds rather than taking a generated hue.
  const foldedFundSlices =
    fundSlices.length > 6
      ? [
          ...fundSlices.slice(0, 5),
          {
            id: "__other",
            label: `Other (${fundSlices.length - 5})`,
            value: fundSlices.slice(5).reduce((a, f) => a + f.value, 0),
          },
        ]
      : fundSlices;
  const fundSliceTotal = fundSlices.reduce((a, f) => a + f.value, 0);

  const options = scopeOptions(scope);
  const summaryHref = options.query
    ? `/fund-balance?${options.query}&view=summary`
    : "/fund-balance?view=summary";

  // ---------- the sheet's five headline figures ----------
  const kpiData = [
    {
      key: "total",
      label: "Total fund balance",
      value: compactMoney(totalNow),
      sub: scope.fund ? scope.fund.name : "All funds",
      note:
        change === null
          ? previous
            ? undefined
            : "no earlier period"
          : `${accounting(change, { compact: true })}${changePct === null ? "" : ` (${signedPercent(changePct)})`}`,
      tone: change === null ? ("neutral" as const) : sheetTone(deltaTone(toNumber(change), "up")),
    },
    {
      key: "change",
      label: "Change from prior month",
      value: accounting(change, { compact: true }),
      sub: "movement in total fund balance",
      note: previous ? `since period ${previous.period}` : "no earlier period",
      tone: change === null ? ("neutral" as const) : sheetTone(deltaTone(toNumber(change), "up")),
    },
    {
      key: "unassigned",
      label: "Unassigned fund balance",
      value: compactMoney(unassignedNow),
      sub: core.generalFund ? `${core.generalFund.name} only` : "General fund only",
      note:
        unassignedChange === null
          ? undefined
          : `${accounting(unassignedChange, { compact: true })} vs prior`,
      tone:
        unassignedChange === null
          ? ("neutral" as const)
          : sheetTone(deltaTone(toNumber(unassignedChange), "up")),
    },
    {
      key: "reserve-pct",
      label: reserveTileLabel(reserve),
      value: percent(reserve?.percent),
      sub: reserveOf,
      note: `Target ≥ ${reserveT.target.toFixed(2)}%`,
      tone: rungTone(reserveRung),
    },
    {
      key: "reserve-status",
      label: "Reserve status",
      value: reserveRung === "N/A" ? "Not available" : reserveRung,
      sub: `Policy ${statutoryMinimum.toFixed(2)}% – ${reserveT.target.toFixed(2)}%`,
      note: `Warning below ${reserveT.warning.toFixed(2)}%`,
      tone: rungTone(reserveRung),
    },
  ];

  // ===================== the one-page landscape summary =====================
  // Outside `FundBalanceShell`: the shell's four tabs are navigation, and navigation on
  // paper is ink spent on something nobody can click.
  if (summary) {
    return (
      <PrintSheet
        title="Fund Balance Summary"
        district={user.districtName ?? "District"}
        scope={sheetScope(scope)}
        asOf={sheetAsOf(scope.dataAsOf)}
        backHref={options.query ? `/fund-balance?${options.query}` : "/fund-balance"}
      >
        <SheetBand cols="1fr 1fr 1fr 1fr 1fr">
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

        <SheetBand cols="1.15fr 1fr">
          <SheetCard
            title="Fund balance trend"
            badge={<StatusBadge status={reserveRung} size="sm" dot={false} />}
            note={scope.fund ? scope.fund.name : "All funds"}
          >
            <LineChart
              title="Fund balance trend"
              summary={`Total and unassigned fund balance by month for fiscal year ${scope.fiscalYear}.`}
              categories={labels}
              format={(v) => compactMoney(v, 0)}
              height={240}
              series={[
                {
                  key: "total",
                  label: "Ending fund balance",
                  color: "var(--color-viz-budget)",
                  labelLast: true,
                  points: series.points.map((p) => ({
                    value: toNumber(p.fundBalance),
                    label: compactMoney(p.fundBalance),
                  })),
                },
                {
                  key: "unassigned",
                  label: "Unassigned fund balance",
                  color: "var(--color-viz-actual)",
                  labelLast: true,
                  points: series.points.map((p) => ({
                    value: toNumber(p.unassignedFundBalance),
                    label: compactMoney(p.unassignedFundBalance),
                  })),
                },
              ]}
            />
            <SheetStats
              items={[
                { label: "Ending", value: compactMoney(totalNow) },
                { label: "Unassigned", value: compactMoney(unassignedNow) },
                { label: "Target", value: `${reserveT.target.toFixed(2)}%` },
                { label: "Minimum", value: `${statutoryMinimum.toFixed(2)}%` },
              ]}
            />
          </SheetCard>

          <SheetCard
            title="Fund balance waterfall"
            note={foots ? "Beginning · movements · ending" : "Does not reconcile"}
          >
            <WaterfallChart
              title="Fund balance waterfall"
              summary={`How the fund balance moved from ${compactMoney(series.opening?.total)} at the start of the year to ${compactMoney(totalNow)}.`}
              steps={steps}
              format={(v) => compactMoney(v, 0)}
              height={260}
            />
          </SheetCard>
        </SheetBand>

        <SheetBand cols="1.5fr 1fr">
          <SheetCard title="Fund balance by fund" note={SHEET_TABLE_NOTE}>
            <DataTable
              dense
              columns={[
                { key: "fund", label: "Fund" },
                { key: "balance", label: "Ending fund balance", align: "right" },
                { key: "class", label: "Primary classification" },
                { key: "status", label: "Status", align: "right" },
              ]}
              rows={withBalance.slice(0, SHEET_TABLE_ROWS).map((f) => {
                const isGeneral = core.generalFund?.id === f.fundId;
                const balance = toNumber(f.fundBalance);
                const rung = isGeneral
                  ? reserveRung
                  : balance === null
                    ? "N/A"
                    : balance < 0
                      ? "Action Required"
                      : "Strong";
                return {
                  id: f.fundId,
                  flag: balance !== null && balance < 0 ? ("negative" as const) : undefined,
                  cells: {
                    fund: { value: codeName(f.code, f.name, scope.labelMode), strong: true },
                    balance: { value: compactMoney(f.fundBalance), strong: true },
                    class: isGeneral ? "Unassigned" : (primaryClassification(f) ?? "—"),
                    status: (
                      <span className="flex justify-end">
                        <StatusBadge status={rung} size="sm" dot={false} />
                      </span>
                    ),
                  },
                };
              })}
              total={{
                id: "total",
                total: true,
                cells: {
                  fund: "Total all funds",
                  balance: compactMoney(allFundsTotal),
                  class: "—",
                  status: "—",
                },
              }}
              empty="No fund has a committed opening balance for this year."
            />
          </SheetCard>

          <SheetCard title="Fund balance composition" note="By classification">
            {components.length > 0 ? (
              <ShareBars
                title="Fund balance composition"
                summary="How the fund balance splits between its designated components and the unassigned reserve."
                rows={components.map((c) => ({
                  id: c.label,
                  label: c.label,
                  value: c.value,
                  display: compactMoney(c.amount),
                  share: percent(sharePercent(c.value, componentTotal), 1),
                  color: COMPONENT_COLORS[c.label],
                }))}
              />
            ) : (
              <p className="py-3 text-center text-[9.5px] text-muted-2">
                No opening fund balance committed for this year.
              </p>
            )}
            {reservePct !== null && (
              <KeyInsightBar tone={reserveRung === "Strong" ? "info" : "monitor"}>
                {reserveSubject(reserve)} is {percent(reservePct)} {reserveOf},{" "}
                {reservePct >= statutoryMinimum ? "above" : "below"} the{" "}
                {statutoryMinimum.toFixed(2)}% statutory minimum and{" "}
                {reservePct >= reserveT.target ? "at or above" : "below"} the district target of{" "}
                {reserveT.target.toFixed(2)}%.
              </KeyInsightBar>
            )}
          </SheetCard>
        </SheetBand>
      </PrintSheet>
    );
  }

  return (
    <FundBalanceShell
      scope={scope}
      active="/fund-balance"
      alertCount={fbAlerts.length}
      summaryHref={summaryHref}
    >
      {/* ---------- KPI CARDS ---------- */}
      <KpiRow count={5}>
        <KpiTile
          icon="dollar"
          tone="green"
          label="Total fund balance"
          caption={scope.fund ? scope.fund.name : "All funds"}
          value={compactMoney(totalNow)}
          sub={previous ? "from prior period" : "no earlier period"}
          delta={
            change === null
              ? undefined
              : {
                  text: `${accounting(change, { compact: true })}${changePct === null ? "" : ` (${signedPercent(changePct)})`}`,
                  tone: deltaTone(toNumber(change), "up"),
                  direction: change.isNegative() ? "down" : "up",
                }
          }
          unavailableReason="Needs an opening fund balance for the year."
        />

        <KpiTile
          icon="trend-up"
          tone="teal"
          label="Change from prior month"
          caption={previous ? `Since period ${previous.period}` : "No earlier period"}
          value={accounting(change, { compact: true })}
          sub="Monthly change in total fund balance"
          delta={
            change === null
              ? undefined
              : {
                  text: signedPercent(changePct),
                  tone: deltaTone(toNumber(change), "up"),
                  direction: change.isNegative() ? "down" : "up",
                }
          }
        />

        <KpiTile
          icon="shield"
          tone="blue"
          label="Unassigned fund balance"
          caption={core.generalFund ? `${core.generalFund.name} only` : "General fund only"}
          value={compactMoney(unassignedNow)}
          sub="Available General Fund reserve"
          delta={
            unassignedChange === null
              ? undefined
              : {
                  text: accounting(unassignedChange, { compact: true }),
                  tone: deltaTone(toNumber(unassignedChange), "up"),
                  direction: unassignedChange.isNegative() ? "down" : "up",
                  note: previous ? `vs period ${previous.period}` : undefined,
                }
          }
        />

        <KpiTile
          icon="pie"
          tone="purple"
          label={reserveTileLabel(reserve)}
          caption={core.generalFund ? `${core.generalFund.name} only` : "General fund only"}
          value={percent(reserve?.percent)}
          sub={`As a % ${reserveOf}`}
          status={reserveRung}
          statusNote={`Target ≥ ${reserveT.target.toFixed(2)}%`}
          unavailableReason={reserveUnavailableReason(reserve?.basis ?? "REVENUE")}
        />

        <KpiTile
          icon="scale"
          tone={reserveRung === "Action Required" ? "red" : reserveRung === "Monitor" ? "amber" : "green"}
          label="Reserve status"
          caption={core.generalFund ? `${core.generalFund.name} only` : "General fund only"}
          value={reserveRung === "N/A" ? "Not available" : reserveRung}
          valueStatus={reserveRung}
          sub="Compared to Board reserve policy"
          statusNote={`Warning below ${reserveT.warning.toFixed(2)}%`}
        />
      </KpiRow>

      {/* ---------- ROW 2: by fund · trend ---------- */}
      <Row cols="1-2">
        <SectionCard
          title="Fund balance by fund"
          info="Unassigned fund balance and its percentage apply to the General Fund only. Other funds are shown with their primary fund balance classification."
          footerNote="All amounts are unaudited"
        >
          <DataTable
            columns={[
              { key: "fund", label: "Fund" },
              { key: "balance", label: "Ending fund balance", align: "right" },
              { key: "class", label: "Primary classification" },
              { key: "status", label: "Status", align: "right" },
            ]}
            rows={withBalance.map((f) => {
              const isGeneral = core.generalFund?.id === f.fundId;
              const balance = toNumber(f.fundBalance);
              const rung = isGeneral
                ? reserveRung
                : balance === null
                  ? "N/A"
                  : balance < 0
                    ? "Action Required"
                    : "Strong";
              const label = isGeneral
                ? reserveRung === "Strong"
                  ? "Healthy"
                  : reserveRung === "N/A"
                    ? undefined
                    : reserveRung
                : balance !== null && balance < 0
                  ? "Deficit"
                  : "Healthy";

              return {
                id: f.fundId,
                flag: balance !== null && balance < 0 ? ("negative" as const) : undefined,
                cells: {
                  fund: {
                    value: <DimLabel code={f.code} name={f.name} mode={scope.labelMode} />,
                    strong: true,
                  },
                  balance: { value: money(f.fundBalance), strong: true },
                  class: isGeneral ? (
                    <span>
                      Unassigned
                      <span className="block text-[11px] text-muted-2">
                        {money(unassignedNow)}
                        {reservePct === null ? "" : ` (${percent(reservePct)})`}
                      </span>
                    </span>
                  ) : (
                    (primaryClassification(f) ?? "—")
                  ),
                  status: (
                    <span className="flex justify-end">
                      <StatusBadge status={rung} label={label} size="sm" dot={false} />
                    </span>
                  ),
                },
              };
            })}
            total={{
              id: "total",
              total: true,
              cells: {
                fund: "Total all funds",
                balance: money(allFundsTotal),
                class: "—",
                status: "—",
              },
            }}
            empty="No fund has a committed opening balance for this year."
          />
          {userCan(user, "configure_district") && (
            <p className="mt-3 text-[11.5px] text-muted-2">
              A fund&apos;s balance can be corrected from{" "}
              <Link
                href={`/fund-balance/override?fy=${scope.fiscalYear}&period=${scope.period}`}
                className="font-medium text-brand hover:underline"
              >
                Corrections
              </Link>
              .
            </p>
          )}
        </SectionCard>

        <SectionCard
          title="Fund balance trend"
          subtitle={scope.fund ? scope.fund.name : "All funds"}
          badge={<StatusBadge status={reserveRung} size="sm" />}
          footer={GO_TO.forecast}
          footerHref={options.link(
            `/fund-balance/forecast?fy=${scope.fiscalYear}&period=${scope.period}`,
          )}
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
                label: "Ending fund balance",
                color: "var(--color-viz-budget)",
                labelLast: true,
                points: series.points.map((p) => ({
                  value: toNumber(p.fundBalance),
                  label: compactMoney(p.fundBalance),
                })),
              },
              {
                key: "unassigned",
                label: "Unassigned fund balance",
                color: "var(--color-viz-actual)",
                labelLast: true,
                points: series.points.map((p) => ({
                  value: toNumber(p.unassignedFundBalance),
                  label: compactMoney(p.unassignedFundBalance),
                })),
              },
            ]}
          />
          <div className="mt-4 flex flex-col gap-3">
            <MetricStrip
              cols={5}
              items={[
                { label: "Ending fund balance", value: compactMoney(totalNow) },
                {
                  label: "Unassigned fund balance",
                  value: compactMoney(unassignedNow),
                  note: reservePct === null ? undefined : percent(reservePct),
                },
                {
                  label: "Status",
                  value: reserveRung === "N/A" ? "Not available" : reserveRung,
                  tone:
                    reserveRung === "Strong"
                      ? "positive"
                      : reserveRung === "N/A"
                        ? "neutral"
                        : "negative",
                },
                { label: "Target", value: `${reserveT.target.toFixed(2)}%` },
                { label: "Minimum", value: `${statutoryMinimum.toFixed(2)}%` },
              ]}
            />
            {reservePct !== null && (
              <KeyInsightBar tone={reserveRung === "Strong" ? "info" : "monitor"}>
                {reserveSubject(reserve)} is {percent(reservePct)} {reserveOf}, which is{" "}
                {reservePct >= statutoryMinimum ? "above" : "below"} the{" "}
                {statutoryMinimum.toFixed(2)}% statutory minimum and{" "}
                {reservePct >= reserveT.target ? "at or above" : "below"} the district target of{" "}
                {reserveT.target.toFixed(2)}%.
              </KeyInsightBar>
            )}
          </div>
        </SectionCard>
      </Row>

      {/* ---------- ROW 3: policy % · waterfall · composition ---------- */}
      <Row cols="3">
        <SectionCard
          title="Fund balance %"
          subtitle="Policy benchmark"
          info="The bands are your own thresholds, so this strip and the badge above it cannot disagree."
        >
          <div className="pt-7">
            <BenchmarkBand
              value={reservePct}
              bands={statusBands(reserveT)}
              target={reserveT.target}
              format={(v) => `${v.toFixed(v % 1 === 0 ? 0 : 2)}%`}
              label={`Policy target: maintain unassigned fund balance at ${reserveT.target.toFixed(2)}% ${reserveOf}. The dotted rule marks the target.`}
            />
          </div>
        </SectionCard>

        <SectionCard
          title="Fund balance waterfall"
          subtitle={foots ? undefined : "Components do not reconcile to the ending balance"}
          info="Beginning balance, this year's movements, and where the balance now stands."
        >
          <WaterfallChart
            title="Fund balance waterfall"
            summary={`How the fund balance moved from ${compactMoney(series.opening?.total)} at the start of the year to ${compactMoney(totalNow)}.`}
            steps={steps}
            format={(v) => compactMoney(v, 0)}
            height={270}
          />
          {!foots && (
            <p className="mt-2 text-[11.5px] text-monitor">
              The movements shown do not add up to the ending balance. This usually means a
              period is missing from the year.
            </p>
          )}
        </SectionCard>

        {/*
          THE "VIEW BY" CARD — the client's "Fund Balance Composition is View By → Fund".

          Two perspectives on one total: the GASB 54 classification split this card has
          always drawn, and the same balance split by fund. Neither costs a query — the
          components come from the opening balance the series already loaded, and the fund
          rows from the `byFund` call the table above it already made.

          The KPI row is not re-grouped. Total fund balance, the unassigned reserve and its
          percentage are the same figures either way.
        */}
        <SectionCard
          title="Fund balance composition"
          subtitle={
            view === "fund"
              ? `By fund · ${scope.fund ? scope.fund.name : "all funds"}`
              : "By classification"
          }
          info={
            view === "fund"
              ? "Each fund's ending balance as a share of the total. Funds in deficit are listed in the table above rather than drawn here — a share bar cannot show a negative slice."
              : "Components are as reported on the opening fund balance; unassigned moves with the year's activity."
          }
          control={<ViewBy options={FUND_BALANCE_VIEWS} value={view} />}
        >
          {view === "fund" ? (
            foldedFundSlices.length > 0 ? (
              <>
                <ShareBars
                  title="Fund balance composition by fund"
                  summary="How the district's total fund balance splits across its funds."
                  rows={foldedFundSlices.map((f, i) => ({
                    id: f.id,
                    label: f.label,
                    value: f.value,
                    display: compactMoney(f.value),
                    share: percent(sharePercent(f.value, fundSliceTotal), 1),
                    color: SERIES_SLOTS[i % SERIES_SLOTS.length],
                  }))}
                />
                <div className="mt-4">
                  <MetricStrip
                    cols={3}
                    items={[
                      { label: "Total fund balance", value: compactMoney(totalNow) },
                      { label: "Unassigned", value: compactMoney(unassignedNow) },
                      { label: "Funds", value: String(fundSlices.length) },
                    ]}
                  />
                </div>
              </>
            ) : (
              <p className="py-8 text-center text-[12.5px] text-muted-2">
                No fund has a positive ending balance for this period.
              </p>
            )
          ) : components.length > 0 ? (
            <>
              <ShareBars
                title="Fund balance composition"
                summary="How the fund balance splits between its designated components and the unassigned reserve."
                rows={components.map((c) => ({
                  id: c.label,
                  label: c.label,
                  value: c.value,
                  display: compactMoney(c.amount),
                  share: percent(sharePercent(c.value, componentTotal), 1),
                  color: COMPONENT_COLORS[c.label],
                }))}
              />
              <div className="mt-4">
                <MetricStrip
                  cols={3}
                  items={[
                    { label: "Total fund balance", value: compactMoney(totalNow) },
                    { label: "Unassigned", value: compactMoney(unassignedNow) },
                    { label: "Components", value: String(components.length) },
                  ]}
                />
              </div>
            </>
          ) : (
            <p className="py-8 text-center text-[12.5px] text-muted-2">
              No opening fund balance has been committed for this year.
            </p>
          )}
        </SectionCard>
      </Row>

      {/* ---------- ROW 4: the components breakdown ---------- */}
      <Row cols="2-1">
        <SectionCard
          title="Fund balance components"
          subtitle={
            isOutturn
              ? "Actual ending balance, by component"
              : "Projected ending balance, by component"
          }
          info={`Every line is stated as a share ${reserveOf}, so the column adds up to the reserve percentage above it. ${reserveMethodology(reserve)}`}
        >
          <DataTable
            columns={[
              { key: "line", label: "Component" },
              { key: "amount", label: "Amount", align: "right", width: "24%" },
              { key: "share", label: `% ${reserveOf}`, align: "right", width: "26%" },
            ]}
            rows={breakdownRows}
            total={{
              id: "total-unassigned",
              total: true,
              cells: {
                line: "Total unassigned fund balance",
                amount: money(reserve?.unassigned ?? null),
                share: breakdownShare(reserve?.unassigned ?? null),
              },
            }}
            empty="No opening fund balance has been committed for this year."
          />
          <p className="mt-3 text-[11.5px] text-muted-2">
            {reserveMethodology(reserve)}
            {reserve && !reserve.actual
              ? " The projection moves when the board amends the budget, not with month-to-month collections."
              : ""}
          </p>
        </SectionCard>

        <SectionCard
          title={isOutturn ? "Ending position" : "Projected ending position"}
          subtitle={core.generalFund ? core.generalFund.name : "General fund"}
          badge={<StatusBadge status={reserveRung} size="sm" />}
        >
          <MetricStrip
            cols={4}
            items={[
              {
                label: "Beginning fund balance",
                value: compactMoney(reserve?.beginning ?? null),
                note: "Fixed for the year",
              },
              {
                label: isOutturn ? "Ending fund balance" : "Projected ending fund balance",
                value: compactMoney(reserve?.endingTotal ?? null),
              },
              {
                label: isOutturn
                  ? "Actual General Fund revenue"
                  : "Projected General Fund revenue",
                value: compactMoney(reserve?.budget ?? null),
              },
              {
                label: isShort ? "Shortfall to required reserve" : "Room above required reserve",
                value: compactMoney(
                  isShort && excessUnassigned ? excessUnassigned.abs() : excessUnassigned,
                ),
                tone: isShort ? "negative" : "positive",
              },
            ]}
          />
        </SectionCard>
      </Row>

      <FooterInfoBar
        action={GO_TO.forecast}
        href={options.link(`/fund-balance/forecast?fy=${scope.fiscalYear}&period=${scope.period}`)}
      >
        Want to see the future? Build a three-year projection from your own growth assumptions
        and see how reserves hold up.
      </FooterInfoBar>
    </FundBalanceShell>
  );
}
