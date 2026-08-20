import { Prisma } from "@/lib/generated/prisma/client";
import type { TenantDb } from "@/lib/tenant-db";
import type { DatasetKind } from "@/lib/enums";
import { currentVersionIds } from "@/lib/finance/versions";
import { listFunds } from "@/lib/finance/funds";
import { pace, utilisation, availableBudget } from "@/lib/finance/variance";
import { projectYearEnd } from "@/lib/forecast/engine";
import { memo, dbKey } from "@/lib/request-cache";
import { compactMoney } from "@/lib/dashboard/format";
import {
  detailWhere,
  fundWhere,
  filterKey,
  type FinanceFilter,
} from "@/lib/finance/filter";

/**
 * WHICH FUND — the "where do I go?" line under an alert.
 *
 * ---------------------------------------------------------------------------
 * THE PROBLEM THIS SOLVES
 *
 * The client, on the All Funds view: "The Alerts doesn't tell me which fund is under
 * collected or overspent so I do not know where to go."
 *
 * They are right, and the reason is structural rather than cosmetic. `gatherFacts` sums
 * every fund together and hands the catalogue ONE set of figures, so an alert reading
 * "Collections are 8.2% below budget" is a true statement about a district and a useless
 * statement about a district's day. It cannot say which fund, because by the time the
 * threshold is tested the funds have already been added up.
 *
 * WHAT THIS DOES NOT DO
 *
 * It does NOT re-evaluate the twenty-four alerts once per fund. That would be the obvious
 * fix and it is the wrong one twice over: `gatherFacts` is the most query-hungry call in
 * the app (the activity engine, the forecast, the reserve and the cash position), so
 * multiplying it by the fund count would cost tens of round trips to a database on another
 * continent — and it would also change what the alerts MEAN. A district's thresholds are
 * set for a district. A $40k activity fund is 30% "over budget" every month it buys
 * uniforms, and nine alerts firing for it would bury the one that matters.
 *
 * So the alert stays a district-level statement and gains an ATTRIBUTION: the two or three
 * funds carrying most of what the alert is about, ranked by dollars, each linking to the
 * same dashboard scoped to that fund. The alert says what happened; the attribution says
 * where to look.
 *
 * WHAT IT COSTS
 *
 * Three grouped aggregates, and never on a ONE-fund page — there the alert already names its
 * own scope and lib/alerts/engine.ts does not call this at all. Each query
 * covers BOTH the scoped period and the one before it (`versionId: { in: [now, prev] }`,
 * grouped by fund AND version), which is what lets the month-over-month lenses be
 * attributed without doubling the query count.
 *
 * IT IS COMPUTED OVER THE SAME SLICE AS THE ALERT
 *
 * The client, on the global filters: "when filtering for General Fund the alerts for Debt Svc
 * and Food Svc was still visible." They were — the alert SENTENCES honoured the filter (every
 * figure in `gatherFacts` is computed over `scope.filter`) but this file took only a fiscal
 * year and a period, so the "where to look" chips underneath were always district-wide. A
 * reader who had narrowed to one fund type was shown funds that filter excludes, and an alert
 * that says one thing while the row under it names another fund is worse than no attribution.
 *
 * So the filter comes in and reaches every query. The two detail tables take the whole
 * narrowing; `CashPosition` and the adopted-budget lines take the fund half only, because
 * neither carries a cost centre — the same split `detailWhere` / `fundWhere` enforce
 * everywhere else, and the same one `daysCash()` in lib/alerts/engine.ts applies so that the
 * per-fund days-cash figures still reconcile with the district figure in the alert above them.
 *
 * WHAT IT DELIBERATELY LEAVES ALONE
 *
 * The reserve alerts (FUND_BALANCE_*, FORECAST_*) get no attribution. A reserve percentage
 * is unassigned fund balance over adopted budget, and a per-fund version of it needs the
 * opening components and the full activity engine — not three aggregates. Guessing at it
 * from what is here would produce a plausible wrong answer, which is the one thing these
 * screens cannot afford. An alert with no attribution simply shows none.
 * ---------------------------------------------------------------------------
 */

const D = Prisma.Decimal;
const ZERO = new D(0);

/** How many funds an attribution names. Three is a glance; five is a second table. */
const KEEP = 3;

/**
 * The question an attribution answers. One lens per DIRECTION, not one per alert — "below
 * budget" and "forecast below budget" both want the funds that are behind on collections.
 */
export type AlertLens =
  | "revenueBehind"
  | "revenueAhead"
  | "revenueMoved"
  | "revenueForecastOff"
  | "spendAhead"
  | "spendForecastOff"
  | "spendOverBudget"
  | "spendJumped"
  | "cashThin"
  | "cashFell"
  | "balanceFalling";

export interface FundContribution {
  id: string;
  code: string;
  name: string;
  /**
   * "$1.24M below expected" — formatted HERE, deliberately.
   *
   * An alert crosses into a React component, and lib/dashboard/format.ts exists so that no
   * Prisma.Decimal ever has to. Carrying the raw figure would put the choice of compact-vs-
   * exact on whichever card renders it next, and two cards would eventually choose
   * differently for the same number.
   */
  detail: string;
  /**
   * WHAT THIS ROW IS, for the renderers that need to treat it differently.
   *
   * `driver` is the default and the only kind the pace lenses produce — a fund carrying
   * part of what the alert is about. The forecast lenses add two more:
   *
   *   `offset` — a fund moving the figure the OTHER way, materially. It is not driving the
   *     alert and is deliberately not ranked among the funds that are, but a fund heading
   *     over budget inside a district projected under is the one a finance officer would
   *     most want to know about, and the driver ranking is the one list guaranteed to hide
   *     it. Named at the client's request.
   *
   *   `total` — the closing "+ 9 other funds" line. NOT a fund: its id is synthetic, it
   *     links nowhere, and its name is already display-ready (it must not be run through
   *     `codeName`/`displayName`, which would title-case it into "+ 9 Other Funds").
   *     It exists so the column visibly adds up to the figure in the alert above it.
   */
  role?: "driver" | "offset" | "total";
}

/** The id on the closing line. Not a fund, so nothing may link to it. */
export const REST_ROW_ID = "__rest__";

export type AlertAttribution = Record<AlertLens, FundContribution[]>;

/**
 * Which lens each alert reads.
 *
 * An alert absent from this map gets no "where" line. That is a deliberate default: a
 * missing attribution is a blank, and a wrong one is a finance officer opening the wrong
 * fund.
 */
export const ALERT_LENS: Record<string, AlertLens> = {
  REVENUE_BELOW_BUDGET: "revenueBehind",
  REVENUE_ABOVE_BUDGET: "revenueAhead",
  // Both forecast alerts state a PROJECTION, so both are attributed by projected variance
  // rather than by year-to-date pace. See `forecastContributions`.
  REVENUE_FORECAST_BELOW_BUDGET: "revenueForecastOff",
  REVENUE_FORECAST_ABOVE_BUDGET: "revenueForecastOff",
  REVENUE_SIGNIFICANT_CHANGE: "revenueMoved",

  BUDGET_UTILIZATION_WARNING: "spendAhead",
  BUDGET_UTILIZATION_CRITICAL: "spendAhead",
  FORECAST_EXCEEDS_BUDGET: "spendForecastOff",
  MATERIAL_FORECAST_VARIANCE: "spendForecastOff",
  BUDGET_EXCEEDED: "spendOverBudget",
  NEGATIVE_AVAILABLE_BUDGET: "spendOverBudget",
  ENCUMBRANCES_EXCEED_AVAILABLE: "spendOverBudget",
  SIGNIFICANT_MOM_INCREASE: "spendJumped",

  DAYS_CASH_WARNING: "cashThin",
  DAYS_CASH_CRITICAL: "cashThin",
  SIGNIFICANT_CASH_DECREASE: "cashFell",

  NEGATIVE_CHANGE_IN_FUND_BALANCE: "balanceFalling",
};

const EMPTY: AlertAttribution = {
  revenueBehind: [],
  revenueAhead: [],
  revenueMoved: [],
  revenueForecastOff: [],
  spendAhead: [],
  spendForecastOff: [],
  spendOverBudget: [],
  spendJumped: [],
  cashThin: [],
  cashFell: [],
  balanceFalling: [],
};

/** Everything the lenses need, for one fund, across the scoped period and the one before. */
interface FundFigures {
  id: string;
  code: string;
  name: string;
  revenueBudget: Prisma.Decimal;
  revenueYtd: Prisma.Decimal;
  revenueMtd: Prisma.Decimal;
  revenueMtdBefore: Prisma.Decimal | null;
  spendBudget: Prisma.Decimal;
  spendYtd: Prisma.Decimal;
  spendMtd: Prisma.Decimal;
  spendMtdBefore: Prisma.Decimal | null;
  encumbrances: Prisma.Decimal;
  cash: Prisma.Decimal | null;
  cashBefore: Prisma.Decimal | null;
  /** The fund's share of the ANNUAL adopted expenditure budget — days-cash's divisor. */
  adoptedSpend: Prisma.Decimal | null;
}

export const attributeAlerts = memo(
  "attributeAlerts",
  (db: TenantDb, scope: { fiscalYear: string; period: number; filter?: FinanceFilter }) => {
    const k = dbKey(db);
    return k === null
      ? null
      : `${k}|${scope.fiscalYear}|${scope.period}|${filterKey(scope.filter)}`;
  },
  buildAttribution,
);

async function buildAttribution(
  db: TenantDb,
  scope: { fiscalYear: string; period: number; filter?: FinanceFilter },
): Promise<AlertAttribution> {
  const [now, before, annual] = await Promise.all([
    currentVersionIds(db, { fiscalYear: scope.fiscalYear, period: scope.period }),
    // Period 1 has no predecessor, and an empty map simply leaves the month-over-month
    // lenses without figures — which reads as no attribution, not as "nothing moved".
    scope.period > 1
      ? currentVersionIds(db, { fiscalYear: scope.fiscalYear, period: scope.period - 1 })
      : Promise.resolve(new Map<DatasetKind, string>()),
    // The annual imports carry no period. This is the adopted budget `daysCash()` divides
    // by, resolved from the same year-wide lookup, so it costs no query of its own.
    currentVersionIds(db, { fiscalYear: scope.fiscalYear, period: null }),
  ]);

  const versionsOf = (kind: DatasetKind) =>
    [now.get(kind), before.get(kind)].filter((v): v is string => v !== undefined);

  const revenueVersions = versionsOf("REVENUE_DETAIL");
  const spendVersions = versionsOf("EXPENDITURE_DETAIL");
  const cashVersions = versionsOf("CASH_POSITION");
  const adoptedVersion = annual.get("EXPENDITURE_BUDGET");

  // The page's slice, applied at the grain each table can honour. See the header.
  const slice = detailWhere(scope.filter);
  const fundSlice = fundWhere(scope.filter);

  const [revenue, spending, cash, adopted, funds] = await Promise.all([
    revenueVersions.length
      ? db.revenueActual.groupBy({
          by: ["fundId", "versionId"],
          where: { versionId: { in: revenueVersions }, ...slice },
          _sum: { budget: true, actualYtd: true, actualMtd: true },
        })
      : Promise.resolve([]),
    spendVersions.length
      ? db.expenditureActual.groupBy({
          by: ["fundId", "versionId"],
          where: { versionId: { in: spendVersions }, ...slice },
          _sum: { budget: true, actualYtd: true, actualMtd: true, encumbrances: true },
        })
      : Promise.resolve([]),
    cashVersions.length
      ? db.cashPosition.groupBy({
          by: ["fundId", "versionId"],
          where: { versionId: { in: cashVersions }, ...fundSlice },
          _sum: { endingCash: true },
        })
      : Promise.resolve([]),
    adoptedVersion
      ? db.budgetLine.groupBy({
          by: ["fundId"],
          // FUND-level, matching `daysCash()`'s `fundOnly` — this is the divisor behind the
          // per-fund days-cash figures, and narrowing it by cost centre while the numerator
          // (cash) cannot be narrowed would report years of runway for one department.
          where: { versionId: adoptedVersion, kind: "EXPENDITURE", ...fundSlice },
          _sum: { amount: true },
        })
      : Promise.resolve([]),
    // Already read and memoised by the scope resolver, so this is free.
    listFunds(db),
  ]);

  const figures = new Map<string, FundFigures>();
  const at = (fundId: string): FundFigures | null => {
    const existing = figures.get(fundId);
    if (existing) return existing;
    const f = funds.find((x) => x.id === fundId);
    // A fund the district has deleted outright rather than deactivated. Nothing can be
    // named, so nothing is attributed — better than a row reading "Unknown fund".
    if (!f) return null;
    const fresh: FundFigures = {
      id: f.id,
      code: f.code,
      name: f.name,
      revenueBudget: ZERO,
      revenueYtd: ZERO,
      revenueMtd: ZERO,
      revenueMtdBefore: null,
      spendBudget: ZERO,
      spendYtd: ZERO,
      spendMtd: ZERO,
      spendMtdBefore: null,
      encumbrances: ZERO,
      cash: null,
      cashBefore: null,
      adoptedSpend: null,
    };
    figures.set(fundId, fresh);
    return fresh;
  };

  for (const r of revenue) {
    const f = at(r.fundId);
    if (!f) continue;
    if (r.versionId === now.get("REVENUE_DETAIL")) {
      f.revenueBudget = f.revenueBudget.plus(r._sum.budget ?? ZERO);
      f.revenueYtd = f.revenueYtd.plus(r._sum.actualYtd ?? ZERO);
      f.revenueMtd = f.revenueMtd.plus(r._sum.actualMtd ?? ZERO);
    } else {
      f.revenueMtdBefore = (f.revenueMtdBefore ?? ZERO).plus(r._sum.actualMtd ?? ZERO);
    }
  }

  for (const e of spending) {
    const f = at(e.fundId);
    if (!f) continue;
    if (e.versionId === now.get("EXPENDITURE_DETAIL")) {
      f.spendBudget = f.spendBudget.plus(e._sum.budget ?? ZERO);
      f.spendYtd = f.spendYtd.plus(e._sum.actualYtd ?? ZERO);
      f.spendMtd = f.spendMtd.plus(e._sum.actualMtd ?? ZERO);
      f.encumbrances = f.encumbrances.plus(e._sum.encumbrances ?? ZERO);
    } else {
      f.spendMtdBefore = (f.spendMtdBefore ?? ZERO).plus(e._sum.actualMtd ?? ZERO);
    }
  }

  for (const c of cash) {
    const f = at(c.fundId);
    if (!f) continue;
    if (c.versionId === now.get("CASH_POSITION")) {
      f.cash = (f.cash ?? ZERO).plus(c._sum.endingCash ?? ZERO);
    } else {
      f.cashBefore = (f.cashBefore ?? ZERO).plus(c._sum.endingCash ?? ZERO);
    }
  }

  for (const b of adopted) {
    const f = at(b.fundId);
    if (!f) continue;
    f.adoptedSpend = (f.adoptedSpend ?? ZERO).plus(b._sum.amount ?? ZERO);
  }

  const all = [...figures.values()];
  if (all.length === 0) return EMPTY;

  /**
   * Ranked by DOLLARS, never by percentage — the same rule `topMovers` follows and for the
   * same reason. A $40k activity fund 90% over its uniform line is not where a district's
   * money went; the fund carrying $1.2M of the shortfall is.
   */
  const rank = (
    measure: (f: FundFigures) => Prisma.Decimal | null,
    detail: (amount: Prisma.Decimal, f: FundFigures) => string,
  ): FundContribution[] =>
    all
      .map((f) => ({ f, amount: measure(f) }))
      .filter(
        (x): x is { f: FundFigures; amount: Prisma.Decimal } =>
          x.amount !== null && x.amount.greaterThan(0),
      )
      .sort((a, b) => b.amount.comparedTo(a.amount))
      .slice(0, KEEP)
      .map(({ f, amount }) => ({ id: f.id, code: f.code, name: f.name, detail: detail(amount, f) }));

  const revenuePace = (f: FundFigures) => pace(f.revenueYtd, f.revenueBudget, scope.period);

  /**
   * WHO IS PULLING THE UTILISATION UP — the ranking behind `spendAhead`.
   *
   * The obvious measure is spend against the pro-rated budget, and it is wrong here for a
   * reason that only shows up in month twelve: at period 12 the pro-rated budget IS the
   * full-year budget, so "ahead of pace" collapses into "over budget" and the lens goes
   * empty on exactly the district whose utilisation alert just fired at 93.8%. The alert
   * asked which funds are driving that. Answering "none" is worse than not answering.
   *
   * So the measure is dollars committed ABOVE what this fund would have committed at the
   * overall rate. It is meaningful in every month, it is in dollars (so a $40k activity fund
   * cannot top the list), and it sums to zero across the slice — which is the property that
   * makes "these three are pulling it up" a true statement rather than a turn of phrase.
   *
   * The rate is the rate of what is ON SCREEN, so with a filter applied it is the
   * selection's. The alert it explains was evaluated over the same slice, and measuring
   * against a district-wide rate would rank funds by a baseline no figure on the page is
   * computed from. The chip calls it "expected utilization" either way — the reader knows
   * what is filtered from the filter bar, and naming the slice in every row cost more
   * width than it bought.
   */
  const sliceBudget = all.reduce((a, f) => a.plus(f.spendBudget), ZERO);
  const sliceCommitted = all.reduce((a, f) => a.plus(f.spendYtd).plus(f.encumbrances), ZERO);
  const sliceRate = sliceBudget.isZero() ? null : sliceCommitted.dividedBy(sliceBudget);

  const committedAboveRate = (f: FundFigures): Prisma.Decimal | null => {
    if (sliceRate === null || f.spendBudget.isZero()) return null;
    return f.spendYtd.plus(f.encumbrances).minus(f.spendBudget.times(sliceRate));
  };

  /**
   * Days of cash, per fund — the ranking AND the figure behind `cashThin`.
   *
   * Divided by the ADOPTED budget over 365, which is exactly what `daysCash()` in
   * lib/alerts/engine.ts does for the district. That agreement is the whole reason this
   * reads the annual budget import rather than the current one: the alert beside it says
   * "48 days of cash on hand", and a per-fund list computed off a different divisor would
   * produce numbers that do not reconcile with it on a screen where every figure is
   * expected to.
   *
   * Null — not zero — for a fund with no adopted budget. It simply does not appear.
   */
  const daysCash = (f: FundFigures): Prisma.Decimal | null => {
    if (f.cash === null || f.adoptedSpend === null || f.adoptedSpend.isZero()) return null;
    return f.cash.dividedBy(f.adoptedSpend.dividedBy(365));
  };

  const thinnest = all
    .map((f) => ({ f, days: daysCash(f) }))
    .filter((x): x is { f: FundFigures; days: Prisma.Decimal } => x.days !== null)
    .sort((a, b) => a.days.comparedTo(b.days))
    .slice(0, KEEP)
    .map(({ f, days }) => ({
      id: f.id,
      code: f.code,
      name: f.name,
      detail: `${days.toFixed(0)} days · ${compactMoney(f.cash)} on hand`,
    }));

  return {
    revenueBehind: rank(
      (f) => revenuePace(f).amount.negated(),
      // Two decimal places are named, not defaulted: this column stacks three or four
      // shortfalls, and the trimmed default renders a round one as "$1M" beside
      // "$10.92M" — two widths that read as two different precisions.
      (a) => `${compactMoney(a, 2)} below expected`,
    ),
    revenueAhead: rank(
      (f) => revenuePace(f).amount,
      (a) => `${compactMoney(a)} ahead of pace`,
    ),
    // Movement in either direction — "significant change" is not "significant drop", and
    // the alert it serves fires both ways.
    revenueForecastOff: forecastContributions(
      all,
      scope.period,
      (f) => ({ ytd: f.revenueYtd, budget: f.revenueBudget }),
      { over: "above budget", under: "below budget" },
    ),
    spendForecastOff: forecastContributions(
      all,
      scope.period,
      (f) => ({ ytd: f.spendYtd, budget: f.spendBudget }),
      { over: "over budget", under: "under budget" },
    ),
    revenueMoved: rank(
      (f) => (f.revenueMtdBefore === null ? null : f.revenueMtd.minus(f.revenueMtdBefore).abs()),
      (a, f) =>
        `${compactMoney(a)} ${
          f.revenueMtdBefore !== null && f.revenueMtd.lessThan(f.revenueMtdBefore) ? "down" : "up"
        } on last month`,
    ),
    spendAhead: rank(committedAboveRate, (a, f) => {
      const u = utilisation(f.spendYtd, f.encumbrances, f.spendBudget).percent;
      return u === null
        ? `${compactMoney(a)} above expected utilization`
        : `${u.toFixed(1)}% utilized · ${compactMoney(a)} above expected utilization`;
    }),
    spendOverBudget: rank(
      (f) => utilisation(f.spendYtd, f.encumbrances, f.spendBudget).amount,
      (a, f) =>
        `${compactMoney(a)} over budget · ${compactMoney(
          availableBudget(f.spendBudget, f.spendYtd, f.encumbrances),
        )} available`,
    ),
    spendJumped: rank(
      (f) => (f.spendMtdBefore === null ? null : f.spendMtd.minus(f.spendMtdBefore)),
      (a) => `${compactMoney(a)} more than last month`,
    ),
    cashThin: thinnest,
    cashFell: rank(
      (f) => (f.cash === null || f.cashBefore === null ? null : f.cashBefore.minus(f.cash)),
      (a, f) => `${compactMoney(a)} down · ${compactMoney(f.cash)} on hand`,
    ),
    balanceFalling: rank(
      (f) => f.spendYtd.minus(f.revenueYtd),
      (a) => `Expenditures exceeded revenues by ${compactMoney(a)}`,
    ),
  };
}

/**
 * A fund whose projection runs COUNTER to the alert must be worth at least this share of
 * the district's variance before it takes a row.
 *
 * Ten per cent, because the row is an interruption: it is the one line under the alert that
 * is NOT answering the question the alert asked, and a $12k fund drifting the other way
 * inside a $4M underspend would spend a row saying nothing. At a tenth of the variance it is
 * a figure a finance officer would act on.
 */
const OFFSET_FLOOR = new D("0.10");

/**
 * WHICH FUNDS ARE MAKING THE PROJECTION MISS — the rows under the four forecast alerts.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS SEPARATELY FROM `committedAboveRate`
 *
 * The client: "The 'Where' rows list funds whose commitment pace is furthest above the
 * districtwide rate. That's the right list when the district is projected over budget, but
 * this alert fired on a projected underspend, so the list is currently pointing at the funds
 * least responsible for it."
 *
 * Exactly right, and it is two faults rather than one. `committedAboveRate` ranks by pace
 * against the slice's own commitment rate, which (a) has no notion of which way the alert
 * fired, so on a projected UNDERSPEND it returns the funds spending fastest — the ones
 * pulling the projection back toward budget — and (b) is measured in pace dollars, which are
 * not the dollars the alert sentence quotes, so the rows never tied back to it.
 *
 * That ranking is still correct for BUDGET_UTILIZATION_*, which are genuinely alerts about
 * pace. It is wrong for the four alerts that state a PROJECTION, and those now read this.
 *
 * IT RECONCILES, EXACTLY
 *
 * `projectYearEnd` is imported rather than reimplemented, and the alert engine calls it with
 * no growth assumption (lib/alerts/engine.ts), so the projection is a straight-line run rate
 * and therefore LINEAR:
 *
 *     sum(ytd_f)/periods x 12 - sum(budget_f)  ==  sum( ytd_f/periods x 12 - budget_f )
 *
 * The district figure IS the sum of the per-fund figures. That holds only while both sides
 * read the same rows, and they do: `currentBudgets` and `activityTotals` sum `budget` and
 * `actualYtd` from the current detail version under `detailWhere(filter)`, which is the same
 * table, version and slice the aggregates at the top of this file group by fund. If the alert
 * engine ever passes a growth assumption, per category or otherwise, this stops summing and
 * must follow it there.
 *
 * WHAT THE ROWS ARE
 *
 *   - up to KEEP funds moving the variance the way the alert fired, biggest dollars first;
 *   - then the largest fund moving it the OTHER way, if it clears `OFFSET_FLOOR` — the
 *     client asked for this: "I would also surface a materially offsetting fund because I
 *     think that would be important for the finance team to see even if it isn't driving the
 *     overall alert";
 *   - then a closing "+ 9 other funds" line carrying the signed remainder, so what is on
 *     screen adds up to the figure in the alert rather than being an unexplained subset.
 *
 * Direction is taken from the slice's own net variance, not from the alert id, because
 * MATERIAL_FORECAST_VARIANCE fires BOTH ways off a single id and the map above is static.
 * The other three alerts only fire in one direction, and it is the same direction this
 * computes, so a single lens serves all four without disagreeing with any of them.
 */
export function forecastContributions<T extends { id: string; code: string; name: string }>(
  all: T[],
  period: number,
  pick: (f: T) => { ytd: Prisma.Decimal; budget: Prisma.Decimal },
  words: { over: string; under: string },
): FundContribution[] {
  const contributions = all
    .map((f) => {
      const { ytd, budget } = pick(f);
      // No budget AND no activity is not a contribution of zero — it is a fund this
      // projection has nothing to say about, and it must not be counted in "+ N other funds".
      if (budget.isZero() && ytd.isZero()) return null;
      const { variance } = projectYearEnd({ actualYtd: ytd, budget, periodsElapsed: period });
      return variance.isZero() ? null : { f, variance };
    })
    .filter((x): x is { f: T; variance: Prisma.Decimal } => x !== null);

  const total = contributions.reduce((a, x) => a.plus(x.variance), ZERO);
  // A district landing exactly on budget has no direction to rank by, and the alerts that
  // read this lens cannot fire on it anyway.
  if (total.isZero()) return [];

  /** Does this fund move the figure the way the district as a whole is moving? */
  const drives = (v: Prisma.Decimal) => v.isNegative() === total.isNegative();
  const word = (v: Prisma.Decimal) => (v.isNegative() ? words.under : words.over);
  const biggestFirst = (xs: { f: T; variance: Prisma.Decimal }[]) =>
    [...xs].sort((a, b) => b.variance.abs().comparedTo(a.variance.abs()));

  const rows: FundContribution[] = biggestFirst(contributions.filter((x) => drives(x.variance)))
    .slice(0, KEEP)
    .map(({ f, variance }) => ({
      id: f.id,
      code: f.code,
      name: f.name,
      detail: `${compactMoney(variance.abs())} projected ${word(variance)}`,
      role: "driver" as const,
    }));

  const [counter] = biggestFirst(contributions.filter((x) => !drives(x.variance)));
  if (counter && counter.variance.abs().greaterThanOrEqualTo(total.abs().times(OFFSET_FLOOR))) {
    rows.push({
      id: counter.f.id,
      code: counter.f.code,
      name: counter.f.name,
      // It says which way it is going AND that it runs against the alert — without the
      // second half a reader scanning the column reads it as one more driver.
      detail: `${compactMoney(counter.variance.abs())} projected ${word(counter.variance)} · offsets`,
      role: "offset",
    });
  }

  const shown = new Set(rows.map((r) => r.id));
  const rest = contributions.filter((x) => !shown.has(x.f.id));
  if (rest.length === 0) return rows;

  const remainder = rest.reduce((a, x) => a.plus(x.variance), ZERO);
  rows.push({
    id: REST_ROW_ID,
    code: "",
    name: `+ ${rest.length} other fund${rest.length === 1 ? "" : "s"}`,
    // Net, and it can land either way — the funds left over are not all going one way just
    // because the district is. "net zero" rather than "$0", which reads as a missing figure.
    detail: remainder.isZero()
      ? "net zero"
      : `${compactMoney(remainder.abs())} ${word(remainder)}`,
    role: "total",
  });

  return rows;
}
