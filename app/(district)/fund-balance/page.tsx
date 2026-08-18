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
import { DataTable } from "@/components/dashboard/data-table";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { EmptyState, KeyInsightBar } from "@/components/dashboard/shared";
import { LineChart } from "@/components/dashboard/charts/line-chart";
import { ShareBars } from "@/components/dashboard/charts/budget-bars";
import { WaterfallChart, waterfallFoots } from "@/components/dashboard/charts/waterfall-chart";
import { BenchmarkBand } from "@/components/dashboard/charts/benchmark-band";
import {
  OverviewKpiTile,
  OverviewSection,
  OverviewTileRow,
} from "@/components/dashboard/overview-kpi";
import { OverviewPeriodSelect } from "@/components/dashboard/overview-period-select";
import {
  OverviewPanel,
  OverviewPanelHeader,
  PanelRungPill,
  ArrowGlyph,
} from "@/components/dashboard/overview-panel";
import { PillSelect } from "@/components/dashboard/pill-select";
import { FundBalanceStatusCard } from "@/components/dashboard/fund-balance-status-card";
import {
  FundBalanceByFundTable,
  type FundBalanceFundRow,
} from "@/components/dashboard/fund-balance-by-fund-table";
import { FundBalanceTrendCard } from "@/components/dashboard/fund-balance-trend-card";
import {
  FundBalanceCompositionCard,
  type CompositionRow,
} from "@/components/dashboard/fund-balance-composition-card";
import { FundBalanceWaterfallCard } from "@/components/dashboard/fund-balance-waterfall-card";
import { FundBalanceBenchmarkCard } from "@/components/dashboard/fund-balance-benchmark-card";
import type { CapsuleStat } from "@/components/dashboard/revenue-shared";
import { cn } from "@/lib/cn";
import { FundBalanceShell } from "./shell";
import { COMPONENT_COLORS, SERIES_SLOTS } from "@/lib/dashboard/palette";
import { codeName } from "@/lib/text";
import { labelMode } from "@/lib/dashboard/label-mode";
import { DimLabel } from "@/components/dashboard/dim-label";
import { PageHeader } from "@/components/page-header";
import {
  FUND_BALANCE_VIEWS,
  FUND_BALANCE_BASES,
  BASIS_PARAM,
  resolveView,
} from "@/lib/dashboard/view";
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
  sheetTableNote,
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
    basis?: string;
    view?: string;
  }>;
}) {
  const { db, user, districtId } = await getTenantDb();
  if (!userCan(user, "view_dashboards")) redirect("/master-data");

  const sp = await searchParams;
  const summary = sp.view === "summary";
  const scope = await resolveScope(db, districtId, sp, await labelMode());
  const view = resolveView(FUND_BALANCE_VIEWS, sp.groupBy);
  const basis = resolveView(FUND_BALANCE_BASES, sp.basis);
  const budgetBasis = basis === "budget";

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
  const allFundsBudgetedTotal = withBalance.reduce(
    (a, f) => (f.budgetedFundBalance ? a + (toNumber(f.budgetedFundBalance) ?? 0) : a),
    0,
  );
  /**
   * The other three columns of the by-fund table's total row.
   *
   * Summed over `withBalance` — the same rows the table prints — rather than taken from
   * `activityTotals`. Those are the district's revenue and spending across every fund,
   * including funds dropped from this table for having no opening balance, so the total row
   * would not equal the column above it. A total that does not add up is worse than none.
   */
  const sumOf = (pick: (f: (typeof withBalance)[number]) => Prisma.Decimal | null) =>
    withBalance.reduce((a, f) => a + (toNumber(pick(f)) ?? 0), 0);
  const allFundsBeginning = sumOf((f) => f.beginning);
  const allFundsRevenue = sumOf((f) => f.revenueYtd);
  const allFundsExpenditure = sumOf((f) => f.expenditureYtd);
  const allFundsRevenueBudget = sumOf((f) => f.revenueBudget);
  const allFundsExpenditureBudget = sumOf((f) => f.expenditureBudget);

  /**
   * THE BUDGETED ENDING BALANCE, BY MONTH — the flat line beside the actual one.
   *
   * Opening balance plus each month's amended budget. It is drawn from the SERIES rather
   * than from `reserve` because the trend is scoped to whatever the page is filtered to and
   * `reserve` is always the General Fund's: a General-Fund line under an All Funds chart
   * would be the same category of error this whole change exists to remove.
   *
   * Suppressed under a cost-centre filter. The budget figures on these points carry the
   * whole filter while the balance is fund-level (see lib/finance/series.ts), so the two
   * lines would be answering different questions — which is exactly what the chart is
   * supposed to stop doing. The page already badges that case.
   */
  const trendOpening = scope.fundLevelOnly ? null : (series.opening?.total ?? null);
  const budgetedTrend = trendOpening
    ? series.points.map((p) =>
        p.hasData ? trendOpening.plus(p.revenueBudget).minus(p.expenditureBudget) : null,
      )
    : null;
  const hasBudgetedTrend = budgetedTrend?.some((v) => v !== null) ?? false;
  /** The budgeted ending balance as amended at the SCOPED month — the last one that reported. */
  const budgetedNow = budgetedTrend?.reduce<Prisma.Decimal | null>((a, v) => v ?? a, null) ?? null;

  /**
   * ===================================================================================
   * THE SCOPED PROJECTION — the same arithmetic `reserve` does, on the page's own slice.
   * ===================================================================================
   *
   * The client: "the Projected Ending Position appears to be only the General Fund — what if
   * they wanted to see All Funds or the other funds?" It was, and it ignored the fund
   * selector entirely: picking Capital Projects left a card captioned General Fund sitting
   * under tiles that had all moved.
   *
   * `reserve` cannot answer for another fund and must not try — the reserve PERCENTAGE is a
   * General Fund measure by statute and by the workbook, which is why lib/dashboard/load.ts
   * pins it there. But the ending POSITION underneath it — beginning balance, plus the
   * budget's two sides, equals the projected ending balance — is ordinary arithmetic that
   * holds for any fund and for all of them together. So the position follows the scope and
   * the required-reserve test stays where it belongs.
   *
   * Every term is already in hand: the beginning balance from the series' opening, the two
   * budget figures from the last period that reported, the actuals from the `activityTotals`
   * the waterfall above already asked for. No query.
   *
   * Suppressed under a cost-centre filter for the same reason the budgeted TREND is: the
   * budget figures on these points carry the whole filter while the opening balance is
   * fund-level, so the subtraction would mix two grains. The card says so rather than
   * printing the result.
   */
  const scopedBudget = scope.fundLevelOnly
    ? null
    : series.points.reduce<{ revenue: Prisma.Decimal; expenditure: Prisma.Decimal } | null>(
        (a, p) => (p.hasData ? { revenue: p.revenueBudget, expenditure: p.expenditureBudget } : a),
        null,
      );
  const budgetedNet = scopedBudget ? scopedBudget.revenue.minus(scopedBudget.expenditure) : null;

  const o = series.opening;
  /**
   * The scoped BUDGETED unassigned balance — opening unassigned plus the budget's net change.
   *
   * The designated components do not have a budgeted counterpart, and that is not an
   * omission: a district re-designates by board action, which arrives as a new Opening Fund
   * Balance, never as a budget amendment. So switching the composition card to the budgeted
   * basis moves the unassigned slice and leaves the other four where they are — which is
   * exactly what the board approved.
   */
  const budgetedUnassigned = o && budgetedNet ? o.unassigned.plus(budgetedNet) : null;
  /** True when the budgeted basis can be drawn at all. See `scopedBudget` above. */
  const budgetBasisAvailable = budgetedNet !== null;

  /**
   * The unassigned figure under "Unassigned" in the by-fund table's General Fund row, and the
   * word for it.
   *
   * Falls back to the actual when the budgeted one cannot be built — under a cost-centre
   * filter, per `scopedBudget`. A dash there would read as "this fund has no unassigned
   * balance", which is a different and more alarming claim; the label says which figure it
   * is, so falling back states something true rather than nothing.
   */
  const rowUnassigned = budgetBasis && budgetBasisAvailable ? budgetedUnassigned : unassignedNow;
  const rowUnassignedBasis = budgetBasis && budgetBasisAvailable ? "budgeted" : "actual";

  const compositionUnassigned = budgetBasis ? budgetedUnassigned : unassignedNow;
  const compositionTotal = budgetBasis ? budgetedNow : totalNow;
  const components = o
    ? [
        { label: "Nonspendable", value: toNumber(o.nonspendable) ?? 0, amount: o.nonspendable },
        { label: "Restricted", value: toNumber(o.restricted) ?? 0, amount: o.restricted },
        { label: "Committed", value: toNumber(o.committed) ?? 0, amount: o.committed },
        { label: "Assigned", value: toNumber(o.assigned) ?? 0, amount: o.assigned },
        {
          label: "Unassigned",
          value: toNumber(compositionUnassigned) ?? 0,
          amount: compositionUnassigned,
        },
      ].filter((c) => c.value > 0)
    : [];
  const componentTotal = components.reduce((a, c) => a + c.value, 0);

  /** "Actual" / "Budgeted" — the word every card on this basis prints. */
  const basisLabel = budgetBasis ? "Budgeted" : "Actual";

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
   *
   * ---------------------------------------------------------------------------
   * GENERAL FUND, EVERY ROW OF IT — which it was not before.
   *
   * The client, reading this card beside the composition card above it: "this table is
   * serving two functions so we might have to rethink the layout." It was serving three.
   * The designated lines were the SCOPED district's opening components, the required and
   * excess lines were the General Fund's, and the share column divided all of them by the
   * General Fund's revenue — so on All Funds, which is the default, every percentage in the
   * column was a district-wide dollar figure over a General Fund divisor. The column added
   * up on screen and could not be reconciled to anything.
   *
   * This card is the RESERVE breakdown: what the statutory floor is, and what sits above it.
   * That question is General Fund only, so every row of it is now General Fund only and the
   * subtitle says so. The scoped composition — the same balance split by classification or by
   * fund, on whichever basis the reader picks — is the card above, which is what the reader
   * comparing funds actually wanted. One card, one question, one scope each.
   *
   * The General Fund's own components come off the by-fund read already in hand, so this
   * costs nothing. When the page is filtered away from the General Fund that row is not in
   * the result, and the designated lines are omitted rather than guessed at — the required
   * and excess lines still stand, because `reserve` is General Fund regardless of scope.
   */
  const breakdownDivisor = reserve?.budget ?? null;
  const breakdownShare = (v: Prisma.Decimal | null) =>
    v === null || breakdownDivisor === null || breakdownDivisor.isZero()
      ? "—"
      : percent(v.dividedBy(breakdownDivisor).times(100));

  const gf = core.generalFund;
  const generalRow = gf ? fundRows.find((f) => f.fundId === gf.id) : undefined;
  const gfComponents = generalRow?.components ?? null;

  const designated = gfComponents
    ? ([
        { label: "Nonspendable", amount: gfComponents.nonspendable },
        { label: "Restricted", amount: gfComponents.restricted },
        { label: "Committed", amount: gfComponents.committed },
        { label: "Assigned", amount: gfComponents.assigned },
      ] as const).filter((c) => !c.amount.isZero())
    : [];

  const breakdownLines: {
    id: string;
    label: string;
    amount: string;
    share: string;
    strong?: boolean;
    /** The excess line's ink — green above the floor, red in shortfall. */
    tone?: "positive" | "negative";
  }[] = [
    ...designated.map((c) => ({
      id: c.label,
      label: c.label,
      amount: money(c.amount),
      share: breakdownShare(c.amount),
    })),
    {
      id: "required",
      label: `Required reserve (${reserve?.requiredPercent.toFixed(2) ?? "—"}%)`,
      amount: money(requiredReserve),
      share: breakdownShare(requiredReserve),
      strong: true,
    },
    {
      id: "excess",
      // The shortfall case tints the line and renames it. See the note above.
      label: isShort ? "Shortfall against required reserve" : "Excess unassigned above required reserve",
      amount: money(isShort && excessUnassigned ? excessUnassigned.abs() : excessUnassigned),
      share: breakdownShare(excessUnassigned === null ? null : excessUnassigned.abs()),
      strong: true,
      tone: isShort ? "negative" : "positive",
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
    // Actual or budgeted, whichever basis the card is set to. Both are already on the row
    // — the table above prints them side by side — so the toggle costs no query.
    .map((f) => ({
      id: f.fundId,
      label: codeName(f.code, f.name, scope.labelMode),
      value: toNumber(budgetBasis ? f.budgetedFundBalance : f.fundBalance) ?? 0,
    }))
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

  /**
   * THE ENDING POSITION CARD'S OWN FIGURES — General Fund's when that is the scope, the
   * scope's own otherwise. See the note on `scopedBudget` for why both exist.
   *
   * The General Fund branch reads `reserve` rather than recomputing from the series, and
   * deliberately so: that is the figure the reserve percentage, the status badge and every
   * threshold on this page are built on, and a second derivation of the same quantity is how
   * a card ends up disagreeing with the tile above it by a rounding.
   */
  const isGeneralScope = Boolean(gf && scope.fundId === gf.id);
  const positionSubject = scope.fund ? scope.fund.name : "All funds";
  const position = isGeneralScope
    ? {
        beginning: reserve?.beginning ?? null,
        revenue: (isOutturn ? reserve?.actualRevenue : reserve?.budgetedRevenue) ?? null,
        expenditure: (isOutturn ? reserve?.actualExpenditure : reserve?.budgetedExpenditure) ?? null,
        ending: reserve?.endingTotal ?? null,
      }
    : {
        beginning: series.opening?.total ?? null,
        revenue: isOutturn ? totals.totalRevenueYtd : (scopedBudget?.revenue ?? null),
        expenditure: isOutturn ? totals.totalExpenditureYtd : (scopedBudget?.expenditure ?? null),
        ending: isOutturn ? totalNow : budgetedNow,
      };
  const positionChange =
    position.ending && position.beginning ? position.ending.minus(position.beginning) : null;
  const positionTone: "positive" | "negative" | "neutral" =
    positionChange === null ? "neutral" : positionChange.isNegative() ? "negative" : "positive";

  const options = scopeOptions(scope);
  const summaryHref = options.query
    ? `/fund-balance?${options.query}&view=summary`
    : "/fund-balance?view=summary";

  // ---------- the sheet's five headline figures ----------
  const kpiData = [
    {
      key: "total",
      label: "Total Fund Balance",
      value: compactMoney(totalNow),
      sub: scope.fund ? scope.fund.name : "All funds",
      note:
        change === null
          ? previous
            ? undefined
            : "no earlier period"
          : `${accounting(change, { compact: true })}${changePct === null ? "" : ` (${signedPercent(changePct)})`} from prior month`,
      tone: change === null ? ("neutral" as const) : sheetTone(deltaTone(toNumber(change), "up")),
    },
    {
      key: "change",
      label: "Change from Prior Month",
      value: accounting(change, { compact: true }),
      sub: "Total fund balance change",
      note: previous ? undefined : "no earlier period",
      tone: change === null ? ("neutral" as const) : sheetTone(deltaTone(toNumber(change), "up")),
    },
    {
      key: "unassigned",
      label: "Unassigned Fund Balance",
      value: compactMoney(unassignedNow),
      sub: core.generalFund ? core.generalFund.name : "General Fund",
      note:
        unassignedChange === null
          ? undefined
          : `${accounting(unassignedChange, { compact: true })} in unassigned, from prior month`,
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
      label: "Reserve Status",
      value: reserveRung === "N/A" ? "Not available" : reserveRung,
      sub: `Policy ${statutoryMinimum.toFixed(2)}% – ${reserveT.target.toFixed(2)}%`,
      note: `Warning below ${reserveT.warning.toFixed(2)}%`,
      tone: rungTone(reserveRung),
    },
  ];

  // ===================== the two-page landscape summary =====================
  // Outside `FundBalanceShell`: the shell's four tabs are navigation, and navigation on
  // paper is ink spent on something nobody can click.
  //
  // Page one is the position: the five figures, the trend against policy, and the waterfall
  // that explains how the year got here. Page two is the reserve test — every fund's balance,
  // where the balance is classified, where the district sits in its own policy bands, and the
  // statutory components. The one-page version printed neither the benchmark nor the
  // components, which between them are the whole of the reserve argument.
  if (summary) {
    return (
      <PrintSheet
        title="Fund Balance Summary"
        district={user.districtName ?? "District"}
        scope={sheetScope(scope)}
        asOf={sheetAsOf(scope.dataAsOf)}
        backHref={options.query ? `/fund-balance?${options.query}` : "/fund-balance"}
        pages={[
          {
            content: (
              <>
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
                  label: "Ending fund balance (Actual)",
                  color: "var(--color-viz-budget)",
                  labelLast: true,
                  points: series.points.map((p) => ({
                    value: toNumber(p.fundBalance),
                    label: compactMoney(p.fundBalance),
                  })),
                },
                {
                  key: "unassigned",
                  label: "Unassigned fund balance (Actual)",
                  color: "var(--color-viz-actual)",
                  labelLast: true,
                  points: series.points.map((p) => ({
                    value: toNumber(p.unassignedFundBalance),
                    label: compactMoney(p.unassignedFundBalance),
                  })),
                },
                ...(budgetedTrend && hasBudgetedTrend
                  ? [
                      {
                        key: "budgeted",
                        label: "Ending fund balance (Budgeted)",
                        color: "var(--color-viz-reference)",
                        dashed: true,
                        markers: false,
                        points: budgetedTrend.map((v) => ({
                          value: toNumber(v),
                          label: compactMoney(v),
                        })),
                      },
                    ]
                  : []),
              ]}
            />
            <SheetStats
              items={[
                { label: "Ending (actual)", value: compactMoney(totalNow) },
                { label: "Ending (budgeted)", value: compactMoney(budgetedNow) },
                { label: "Unassigned (actual)", value: compactMoney(unassignedNow) },
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

      </>
            ),
          },
          {
            label: "Funds, policy & reserves",
            content: (
              <>
        <SheetBand cols="1fr">
          <SheetCard
            title="Fund balance by fund"
            note={
              withBalance.length > SHEET_TABLE_ROWS
                ? sheetTableNote(SHEET_TABLE_ROWS)
                : "Beginning + revenues − expenditures"
            }
          >
            <DataTable
              dense
              columns={[
                { key: "fund", label: "Fund" },
                { key: "beginning", label: "Beginning", align: "right" },
                { key: "revenues", label: "Revenues", align: "right" },
                { key: "expenditures", label: "Expenditures", align: "right" },
                { key: "balance", label: "Ending FB (Actual)", align: "right" },
                { key: "budgeted", label: "Ending FB (Budgeted)", align: "right" },
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
                    beginning: compactMoney(f.beginning),
                    revenues: compactMoney(f.revenueYtd),
                    expenditures: compactMoney(f.expenditureYtd),
                    balance: { value: compactMoney(f.fundBalance), strong: true },
                    budgeted: { value: compactMoney(f.budgetedFundBalance), strong: true },
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
                  beginning: compactMoney(allFundsBeginning),
                  revenues: compactMoney(allFundsRevenue),
                  expenditures: compactMoney(allFundsExpenditure),
                  balance: compactMoney(allFundsTotal),
                  budgeted: compactMoney(allFundsBudgetedTotal),
                  class: "—",
                  status: "—",
                },
              }}
              empty="No fund has a committed opening balance for this year."
            />
          </SheetCard>
        </SheetBand>

        {/* The benchmark takes the widest track: its bands are as wide as the district's
            policy ranges are, and "Monitor" between 2% and 3% has 8% of the strip to print
            its name in. Everything else on this band reads at any width. */}
        <SheetBand cols="0.95fr 1.3fr 1.15fr">
          <SheetCard
            title="Fund balance composition"
            note={`By classification · ${basisLabel}`}
          >
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
              <p className="py-3 text-center text-[10px] text-[#060606]">
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

          {/* THE POLICY BENCHMARK the one-page sheet could not fit. The reserve percentage is
              printed in three places on page one; this is the only card that says which band
              of the district's OWN policy it lands in, which is the judgement the rest of the
              page is reporting. */}
          <SheetCard title="Policy benchmark" note={`Target ${reserveT.target.toFixed(2)}%`}>
            {/* The value capsule hangs 26px above the strip, so the strip needs that much
                headroom or the capsule sits on the card's title. */}
            <div className="pt-[26px]">
              <BenchmarkBand
                value={reservePct}
                bands={statusBands(reserveT)}
                // Without this the capsule prints the raw float — "5.184824683707728%" — and
                // runs off the card. `percent` is the same two-decimal rule the tiles use.
                format={(v) => percent(v)}
                target={reserveT.target}
                label={reserveTileLabel(reserve)}
              />
            </div>
            <p className="text-[8.5px] leading-[1.4] text-[#060606]">
              Policy target: maintain unassigned fund balance at{" "}
              {reserveT.target.toFixed(2)}% {reserveOf}. The dotted rule marks the target; the
              statutory minimum is {statutoryMinimum.toFixed(2)}%.
            </p>
          </SheetCard>

          {/* The statutory reserve test, General Fund only whatever the page is filtered to —
              the same lines the screen's Reserve components card carries. */}
          <SheetCard
            title="Reserve components"
            note={`${gf ? gf.name : "General fund"} · ${isOutturn ? "Actual" : "Projected"}`}
          >
            <DataTable
              dense
              columns={[
                { key: "component", label: "Component" },
                { key: "amount", label: "Amount", align: "right" },
                { key: "share", label: `% ${reserveOf}`, align: "right" },
              ]}
              rows={breakdownLines.map((l) => ({
                id: l.id,
                cells: {
                  component: { value: l.label, strong: l.strong },
                  amount: { value: l.amount, strong: l.strong, tone: l.tone ?? "neutral" },
                  share: l.share,
                },
              }))}
              total={{
                id: "unassigned",
                total: true,
                cells: {
                  component: "Total unassigned fund balance",
                  amount: compactMoney(reserve?.unassigned ?? null),
                  share: breakdownShare(reserve?.unassigned ?? null),
                },
              }}
              empty="No General Fund components committed for this year."
            />
          </SheetCard>
        </SheetBand>
              </>
            ),
          },
        ]}
      />
    );
  }

  /**
   * ===================================================================================
   * THE REDESIGNED PAGE — a transcription of Figma 55:3640, on the same vocabulary the
   * Executive, Revenue and Expenditure redesigns already speak: the Overview tile band
   * with the reserve verdict card centred beneath it, the by-fund ledger full width with
   * its "Basis" capsule, then the 702/400 card grid — trend beside composition, waterfall
   * beside the policy benchmark, the reserve components beside the ending position — and
   * the key-insight bar at the floor. Every figure keeps the calculation it always had;
   * only the clothes changed.
   * ===================================================================================
   */

  // ---------- the by-fund ledger's rows, on the basis the capsule chose ----------
  // The STATUS and the deficit tint follow the basis on show, so a row cannot read
  // "Healthy" beside a negative figure — or the reverse.
  const tableRows: FundBalanceFundRow[] = withBalance.map((f) => {
    const isGeneral = core.generalFund?.id === f.fundId;
    const ending = budgetBasis ? f.budgetedFundBalance : f.fundBalance;
    const balance = toNumber(ending);
    const rung =
      isGeneral
        ? reserveRung
        : balance === null
          ? ("N/A" as const)
          : balance < 0
            ? ("Action Required" as const)
            : ("Strong" as const);
    const label = isGeneral
      ? reserveRung === "Strong"
        ? "Healthy"
        : reserveRung === "N/A"
          ? "N/A"
          : reserveRung
      : balance !== null && balance < 0
        ? "Deficit"
        : "Healthy";
    return {
      id: f.fundId,
      fund: <DimLabel code={f.code} name={f.name} mode={scope.labelMode} />,
      // Fixed for the year, and identical on either basis — the one column the toggle
      // does not move, which is itself the point the district was making.
      // WHOLE DOLLARS ACROSS THIS LEDGER — `money`'s default prints cents on whichever rows
      // happen to have them, which sets a seven-figure column to two different widths and
      // trains the eye to skip the tail. Nothing on this card is decided in cents.
      beginning: money(f.beginning, 0),
      revenues: money(budgetBasis ? f.revenueBudget : f.revenueYtd, 0),
      expenditures: money(budgetBasis ? f.expenditureBudget : f.expenditureYtd, 0),
      ending: money(ending, 0),
      endingNegative: balance !== null && balance < 0,
      // The unassigned figure follows the basis too; the label says which figure it is.
      // The reserve PERCENTAGE stays on its own tile, on its own basis, above.
      classification: isGeneral ? (
        <span>
          Unassigned
          <span className="block text-[10px] text-[#060606]">
            {money(rowUnassigned, 0)} {rowUnassignedBasis}
          </span>
        </span>
      ) : (
        (primaryClassification(f) ?? "—")
      ),
      status: { label, rung },
    };
  });

  // ---------- the trend card's capsule strip ----------
  const trendStats: CapsuleStat[] = [
    {
      label: "Ending FB (Actual)",
      value: compactMoney(totalNow),
      // The budgeted figure as the note rather than the reserve percentage: that
      // percentage is computed on the projected balance, so printing it under an actual
      // dollar amount invited exactly the reconciliation that cannot be done.
      note: budgetedNow ? `${compactMoney(budgetedNow)} budgeted` : undefined,
    },
    { label: "Unassigned (Actual)", value: compactMoney(unassignedNow) },
    {
      label: "Status",
      value: reserveRung === "N/A" ? "Not available" : reserveRung,
      tone:
        reserveRung === "Strong" || reserveRung === "Acceptable"
          ? "positive"
          : reserveRung === "N/A"
            ? "default"
            : "negative",
    },
    { label: "Target", value: `${reserveT.target.toFixed(2)}%` },
    { label: "Minimum", value: `${statutoryMinimum.toFixed(2)}%` },
  ];

  // ---------- the composition card's bars and strip, on the chosen view ----------
  const compositionUnavailable = budgetBasis && view === "classification" && !budgetBasisAvailable;
  const compositionRows: CompositionRow[] = compositionUnavailable
    ? []
    : view === "fund"
      ? foldedFundSlices.map((f, i) => ({
          id: f.id,
          label: f.label,
          display: compactMoney(f.value),
          share: percent(sharePercent(f.value, fundSliceTotal), 1),
          sharePct: sharePercent(f.value, fundSliceTotal) ?? 0,
          color: SERIES_SLOTS[i % SERIES_SLOTS.length],
        }))
      : components.map((c) => ({
          id: c.label,
          label: c.label,
          display: compactMoney(c.amount),
          share: percent(sharePercent(c.value, componentTotal), 1),
          sharePct: sharePercent(c.value, componentTotal) ?? 0,
          color: COMPONENT_COLORS[c.label],
        }));
  const compositionStats: CapsuleStat[] = [
    {
      // The by-fund ledger's own total on the fund view, the scoped total on the
      // classification view — so the two cards in this column cannot print different
      // totals for one district.
      label: `Total FB (${basisLabel})`,
      value: compactMoney(
        view === "fund" ? (budgetBasis ? allFundsBudgetedTotal : allFundsTotal) : compositionTotal,
      ),
    },
    { label: `Unassigned (${basisLabel})`, value: compactMoney(compositionUnassigned) },
    view === "fund"
      ? { label: "Funds", value: String(fundSlices.length) }
      : { label: "Components", value: String(components.length) },
  ];
  const compositionEmpty = compositionUnavailable
    ? "The budgeted basis is not available under a cost centre filter. The budget figures carry the whole filter while the opening balance is fund-level, so the two would not be a balance. Clear the cost centre filter, or switch to Actual."
    : view === "fund"
      ? "No fund has a positive ending balance for this period."
      : "No opening fund balance has been committed for this year.";

  // ---------- the ending position card's cells ----------
  const positionCells: {
    label: string;
    value: string;
    note?: string;
    tone?: "positive" | "negative" | "neutral";
  }[] = [
    {
      label: "Beginning fund balance",
      value: compactMoney(position.beginning),
      note: "Fixed for the year",
    },
    {
      label: isOutturn ? "Actual revenues" : "Budgeted revenues",
      value: compactMoney(position.revenue),
      note: isOutturn ? "Collected to date" : "Latest amended budget",
    },
    {
      label: isOutturn ? "Actual expenditures" : "Budgeted expenditures",
      value: compactMoney(position.expenditure),
      note: isOutturn ? "Spent to date" : "Latest amended budget",
    },
    {
      label: isOutturn ? "Ending fund balance" : "Projected ending fund balance",
      value: compactMoney(position.ending),
      note: "Beginning + revenues − expenditures",
    },
    // The fifth cell is the reserve test where the reserve test applies, and the change
    // in the balance everywhere else — same rule as before the redesign.
    isGeneralScope
      ? {
          label: isShort ? "Shortfall to required reserve" : "Room above required reserve",
          value: compactMoney(
            isShort && excessUnassigned ? excessUnassigned.abs() : excessUnassigned,
          ),
          tone: isShort ? ("negative" as const) : ("positive" as const),
        }
      : {
          label: isOutturn ? "Change in fund balance" : "Projected change",
          value: accounting(positionChange, { compact: true }),
          note: "Against the beginning balance",
          tone: positionTone,
        },
  ];
  const CELL_INK = { positive: "#1a932e", negative: "#fd4438", neutral: "#060606" } as const;

  /** The reserve components card's column grid — label, amount, share. */
  // 150 + 96 + 150 + two 12px gaps is 420px of floor, against the ~307px a 375px phone
  // leaves inside the card — so the "% of …" column was clipped clean off by the panel's
  // `overflow-clip`. The card scrolls sideways below that width (see the wrapper on the
  // Reserve components table), the same treatment the fund and cash tables already carry.
  const BREAKDOWN_COLS =
    "grid grid-cols-[minmax(150px,1fr)_minmax(96px,auto)_minmax(150px,auto)] items-center gap-x-[12px]";

  return (
    <FundBalanceShell
      scope={scope}
      active="/fund-balance"
      alertCount={fbAlerts.length}
      summaryHref={summaryHref}
    >
      {/* ---------- the Overview band: four tiles, then the reserve verdict ---------- */}
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
            label="Total Fund Balance"
            caption={scope.fund ? scope.fund.name : "All funds"}
            value={compactMoney(totalNow)}
            /* "from prior period" was a dangling fragment above a delta line that already
               ends in "from prior month". The sub-line only carries the empty state now. */
            sub={previous ? undefined : "No earlier period"}
            delta={
              change === null
                ? undefined
                : {
                    // Magnitudes, not signed accounting: the arrow beside this line is the
                    // direction, so "($1.92M) (−8.65%)" spent three marks saying "down".
                    text: `${compactMoney(change.abs())}${changePct === null ? "" : ` (${percent(Math.abs(changePct))})`}`,
                    tone: deltaTone(toNumber(change), "up"),
                    direction: change.isNegative() ? "down" : "up",
                    note: "from prior month",
                  }
            }
            unavailableReason="Needs an opening fund balance for the year."
          />

          <OverviewKpiTile
            arrow={false}
            icon="gauge"
            tone="teal"
            label="Change from Prior Month"
            caption={previous ? undefined : "No earlier period"}
            value={accounting(change, { compact: true })}
            sub="Total fund balance change"
            delta={
              change === null
                ? undefined
                : {
                    // `changePct` is null when the prior month was zero — there is no
                    // percentage to state then, only the direction the arrow already draws.
                    text:
                      changePct === null
                        ? change.isNegative()
                          ? "Decrease"
                          : "Increase"
                        : `${percent(Math.abs(changePct))} ${changePct < 0 ? "decrease" : "increase"}`,
                    tone: deltaTone(toNumber(change), "up"),
                    direction: change.isNegative() ? "down" : "up",
                  }
            }
          />

          <OverviewKpiTile
            arrow={false}
            icon="wallet"
            tone="green"
            label="Unassigned Fund Balance"
            caption={core.generalFund ? core.generalFund.name : "General Fund"}
            value={compactMoney(unassignedNow)}
            chip="Available Reserves"
            delta={
              unassignedChange === null
                ? undefined
                : {
                    // This IS the movement in the unassigned balance specifically — see
                    // `unassignedChange` above — so the line names what it measures rather
                    // than leaving the reader to assume it restates the total's change.
                    text: compactMoney(unassignedChange.abs()),
                    tone: deltaTone(toNumber(unassignedChange), "up"),
                    direction: unassignedChange.isNegative() ? "down" : "up",
                    note: "in unassigned, from prior month",
                  }
            }
          />

          <OverviewKpiTile
            arrow={false}
            icon="chart"
            tone="red"
            label={reserveTileLabel(reserve)}
            caption={core.generalFund ? core.generalFund.name : "General Fund"}
            value={percent(reserve?.percent)}
            /* The figure AND its denominator in one sentence — "4.94% of projected General
               Fund revenue" — rather than "As a % of …", which names the denominator but
               makes the reader carry the percentage down from the line above. */
            sub={`${percent(reserve?.percent)} ${reserveOf}`}
            status={reserveRung}
            statusNote={`Target ≥ ${reserveT.target.toFixed(2)}%`}
            statusInline
            unavailableReason={reserveUnavailableReason(reserve?.basis ?? "REVENUE")}
          />
        </OverviewTileRow>

        <FundBalanceStatusCard
          rung={reserveRung}
          note="Compared to Board reserve policy"
          chip={`Warning below ${reserveT.warning.toFixed(2)}%`}
        />
      </OverviewSection>

      {/* ---------- the by-fund ledger, full width ---------- */}
      <FundBalanceByFundTable
        subtitle={`${basisLabel} · beginning + revenues − expenditures`}
        basisLabel={basisLabel}
        /*
          ONE TOGGLE, NOT TWO TABLES — same bargain as before the redesign: a capsule keeps
          one row per fund and swaps the three figures that actually differ, and it is the
          same `basis` parameter the composition card below reads, so the page states one
          basis rather than disagreeing with itself card by card.
        */
        control={
          <PillSelect options={FUND_BALANCE_BASES} value={basis} param={BASIS_PARAM} label="Basis" />
        }
        rows={tableRows}
        total={{
          beginning: money(allFundsBeginning, 0),
          revenues: money(budgetBasis ? allFundsRevenueBudget : allFundsRevenue, 0),
          expenditures: money(budgetBasis ? allFundsExpenditureBudget : allFundsExpenditure, 0),
          ending: money(budgetBasis ? allFundsBudgetedTotal : allFundsTotal, 0),
        }}
        empty="No fund has a committed opening balance for this year."
        footer={
          /*
            A CORRECTION IS PER FUND, so the link has to name one — `/fund-balance/override`
            calls `notFound()` without a `fund` parameter. Gated on `override_fund_balance`:
            the target screen redirects anyone without it.
          */
          userCan(user, "override_fund_balance") ? (
            <p className="mt-[12px] text-[10px] leading-[2] tracking-[0.1px] text-[#060606]">
              {scope.fundId ? (
                <>
                  {scope.fund ? scope.fund.name : "This fund"}&apos;s balance can be corrected
                  from{" "}
                  <Link
                    href={`/fund-balance/override?fy=${scope.fiscalYear}&period=${scope.period}&fund=${scope.fundId}`}
                    className="font-bold text-[#301a93] hover:underline"
                  >
                    Corrections
                  </Link>
                  .
                </>
              ) : (
                "Select a single fund above to correct its balance — a correction applies to one fund, not to a total."
              )}
            </p>
          ) : undefined
        }
      />

      {/* ---------- the card grid — the design's 702 / 400 columns on a 10px gutter ---------- */}
      <div className="grid grid-cols-1 items-stretch gap-x-[10px] gap-y-[12px] xl:grid-cols-[minmax(0,1.76fr)_minmax(0,1fr)]">
        {/* row 1 — the trend beside the composition */}
        <FundBalanceTrendCard
          subtitle={scope.fund ? scope.fund.name : "All funds"}
          rung={reserveRung}
          categories={labels}
          total={series.points.map((p) => ({ value: toNumber(p.fundBalance) }))}
          unassigned={series.points.map((p) => ({ value: toNumber(p.unassignedFundBalance) }))}
          budgeted={
            budgetedTrend && hasBudgetedTrend
              ? budgetedTrend.map((v) => ({ value: toNumber(v) }))
              : null
          }
          format={(v) => compactMoney(v, 0)}
          summary={`Total and unassigned fund balance by month for fiscal year ${scope.fiscalYear}.`}
          stats={trendStats}
        />

        <FundBalanceCompositionCard
          subtitle={`${
            view === "fund"
              ? `By fund · ${scope.fund ? scope.fund.name : "all funds"}`
              : "By classification"
          } · ${basisLabel}`}
          controls={
            <>
              <PillSelect
                options={FUND_BALANCE_BASES}
                value={basis}
                param={BASIS_PARAM}
                label="Basis"
                size="sm"
              />
              <PillSelect options={FUND_BALANCE_VIEWS} value={view} label="View by" size="sm" />
            </>
          }
          rows={compositionRows}
          stats={compositionStats}
          empty={compositionEmpty}
        />

        {/* row 2 — the waterfall beside the policy benchmark */}
        <FundBalanceWaterfallCard
          subtitle="Beginning · this year's movements · ending"
          steps={steps}
          format={(v) => compactMoney(v, 0)}
          summary={`How the fund balance moved from ${compactMoney(series.opening?.total)} at the start of the year to ${compactMoney(totalNow)}.`}
          footNote={
            foots
              ? null
              : "The movements shown do not add up to the ending balance. This usually means a period is missing from the year."
          }
        />

        <FundBalanceBenchmarkCard
          value={reservePct}
          rung={reserveRung}
          bands={statusBands(reserveT)}
          target={reserveT.target}
          note={`Policy target: maintain unassigned fund balance at ${reserveT.target.toFixed(2)}% ${reserveOf}. The dotted rule marks the target.`}
        />

        {/* row 3 — the reserve components beside the ending position */}
        <OverviewPanel className="flex flex-col p-[18px]">
          <OverviewPanelHeader
            title="Reserve components"
            subtitle={`${gf ? gf.name : "General fund"} · ${
              isOutturn ? "Actual ending balance" : "Projected ending balance"
            }`}
          />
          {/*
            The statutory reserve test, which applies to the General Fund only — every row
            here is the General Fund's, whatever the page is filtered to. Each line is
            stated as a share of the same denominator the reserve percentage uses, so the
            column adds up to the reserve percentage above it.
          */}
          <div className="-mx-[18px] overflow-x-auto px-[18px]">
          <div className="min-w-[420px]">
          <div
            className={cn(
              BREAKDOWN_COLS,
              "mt-[14px] pb-[10px] text-[14px] leading-[1.15] tracking-[0.14px] text-[#060606]",
            )}
          >
            <span>Component</span>
            <span className="text-right">Amount</span>
            <span className="text-right">% {reserveOf}</span>
          </div>
          <div aria-hidden className="h-px w-full bg-[#060606]/20" />
          <ul>
            {breakdownLines.map((l, i) => (
              <li
                key={l.id}
                className={cn(
                  BREAKDOWN_COLS,
                  "py-[11px]",
                  i > 0 && "border-t border-dashed border-[#e7e7e7]",
                )}
              >
                <span
                  className={cn(
                    "text-[14px] leading-[1.35]",
                    l.strong && "font-bold",
                    l.tone === "negative" ? "text-[#fd4438]" : "text-[#060606]",
                  )}
                >
                  {l.label}
                </span>
                <span
                  className={cn(
                    "whitespace-nowrap text-right text-[14px] leading-normal",
                    l.strong && "font-bold",
                  )}
                  style={{ color: l.tone ? CELL_INK[l.tone] : "#060606" }}
                >
                  {l.amount}
                </span>
                <span className="whitespace-nowrap text-right text-[14px] leading-normal text-[#060606]">
                  {l.share}
                </span>
              </li>
            ))}
          </ul>
          <div aria-hidden className="h-px w-full bg-[#060606]/20" />
          <div className={cn(BREAKDOWN_COLS, "pb-[4px] pt-[14px] text-[14px] font-bold leading-normal text-[#060606]")}>
            <span>Total unassigned fund balance</span>
            <span className="whitespace-nowrap text-right">
              {money(reserve?.unassigned ?? null)}
            </span>
            <span className="whitespace-nowrap text-right">
              {breakdownShare(reserve?.unassigned ?? null)}
            </span>
          </div>
          </div>
          </div>
          <p className="mt-auto pt-[12px] text-[10px] leading-[1.7] tracking-[0.1px] text-[#060606]">
            {reserveMethodology(reserve)}
            {reserve && !reserve.actual
              ? " The projection moves when the board amends the budget, not with month-to-month collections."
              : ""}
            {gf && !generalRow
              ? ` The designated components are omitted because this page is filtered away from ${gf.name}; the required reserve and the balance above it are the General Fund's regardless.`
              : ""}
          </p>
        </OverviewPanel>

        <OverviewPanel className="flex flex-col p-[18px]">
          <div className="flex flex-wrap items-start justify-between gap-[10px]">
            <OverviewPanelHeader
              title={isOutturn ? "Ending position" : "Projected ending position"}
              subtitle={positionSubject}
            />
            {/* The badge is the RESERVE status, which exists for the General Fund only. */}
            {isGeneralScope && <PanelRungPill rung={reserveRung} size="sm" />}
          </div>
          <div className="mt-[14px] grid grid-cols-1 gap-px overflow-clip rounded-[14px] border border-[#e7e7e7] bg-[#e7e7e7] sm:grid-cols-2">
            {positionCells.map((c, i) => (
              <div
                key={c.label}
                className={cn(
                  "flex flex-col gap-[2px] bg-white px-[14px] py-[12px]",
                  i === positionCells.length - 1 && positionCells.length % 2 === 1 && "sm:col-span-2",
                )}
              >
                <span className="text-[12px] leading-[16px] text-[#060606]">{c.label}</span>
                <span
                  className="text-[20px] font-semibold leading-[26px] [font-variant-numeric:proportional-nums]"
                  style={{ color: CELL_INK[c.tone ?? "neutral"] }}
                >
                  {c.value}
                </span>
                {c.note && (
                  <span className="text-[10px] leading-[13px] text-[#060606]">
                    {c.note}
                  </span>
                )}
              </div>
            ))}
          </div>
          {!isGeneralScope && (
            <p className="mt-auto pt-[12px] text-[10px] leading-[1.7] tracking-[0.1px] text-[#060606]">
              {scope.fundLevelOnly && !isOutturn
                ? "The budgeted terms are not shown under a cost centre filter: the budget figures carry the whole filter while the beginning balance is fund-level, so the subtraction would mix two grains. "
                : ""}
              The required reserve is a General Fund test and is not applied across funds.
              {gf && reservePct !== null
                ? ` ${gf.name} is at ${percent(reservePct)} ${reserveOf} (${reserveRung}) — see Reserve components beside this card.`
                : ""}
            </p>
          )}
        </OverviewPanel>
      </div>

      {/* ---------- the key insight bar — Figma 55:4229 ---------- */}
      <OverviewPanel className="flex flex-wrap items-center justify-between gap-x-[24px] gap-y-[10px] p-[18px]">
        <div className="min-w-0 flex-1 basis-[280px]">
          <p className="text-[12px] font-bold leading-[22px] tracking-[-0.43px] text-[#060606]">
            Key insight
          </p>
          <p className="text-[12px] leading-[16px] tracking-[-0.23px] text-[#060606]">
            Want to see the future? Build a three-year projection from your own growth
            assumptions and see how reserves hold up.
          </p>
        </div>
        <Link
          href={options.link(`/fund-balance/forecast?fy=${scope.fiscalYear}&period=${scope.period}`)}
          className="flex h-[24px] flex-none items-center gap-[5px] self-end rounded-[22px] bg-[#8e62ef] pl-[7px] pr-[10px] transition-opacity hover:opacity-85"
        >
          <ArrowGlyph color="#ffffff" className="-rotate-45" />
          <span className="whitespace-nowrap text-[10px] leading-[12px] tracking-[0.2px] text-white">
            {GO_TO.forecast}
          </span>
        </Link>
      </OverviewPanel>
    </FundBalanceShell>
  );
}
