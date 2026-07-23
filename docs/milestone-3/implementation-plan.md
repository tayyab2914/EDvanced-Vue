# Milestone 3 — Dashboards, Documentation & Launch

**Project:** K–12 School Finance SaaS (EDvanced Vue)
**Status:** Screens delivered — remaining: backups, security review, deployment, UAT
**Companions:** [dashboard-spec.md](./dashboard-spec.md) — the screen-by-screen requirement, transcribed from the client's reference screenshots

---

## What shipped

All five dashboards, both entry screens, the alerts page and the export layer are built and
running against committed data.

| Screen | Route | Spec |
|---|---|---|
| Executive dashboard | `/dashboard` | §3 |
| Revenue dashboard | `/revenues` | §4 |
| Expenditures dashboard | `/expenditures` | §5 |
| Fund balance — current position | `/fund-balance` | §6.1 |
| Fund balance — forecast & planning | `/fund-balance/forecast` | §6.2 |
| Fund balance — policies | `/fund-balance/policies` | §6.3 |
| Fund balance — alerts | `/fund-balance/alerts` | §6.4 |
| Fund balance override entry | `/fund-balance/override` | §6.5 — closes a known gap |
| Cash position | `/cash` | §7 |
| Alerts | `/alerts` | §5.17 |
| Excel / CSV export | `/<dashboard>/export[?format=csv]` | §8.5 |
| PDF | browser print, `@media print` in globals.css | §8.5 |

**Verification: 18 scripts, 888 assertions, 0 failures.** Production build clean; every page
returns 200 with real figures; access control verified per role against a running server.

### Defects found and fixed along the way

Five, all in code that already existed and all covered by passing tests that tested the
wrong layer:

1. **Cross-tenant leak** — `ForecastAssumption` unscoped; one district's growth assumptions
   could drive another's forecast. Reproduced against the live database.
2. **Raw SQL bypassed tenant scoping** entirely on a scoped client.
3. **`projectFundBalance()` never moved** — the three-year projection was flat by
   construction, so "projected 3-year change" was structurally always $0.
4. **Four of the 24 alerts could never fire** — two facts were hardcoded in `gatherFacts`.
5. **"Replace clears the fund-balance override" was documented but not implemented** — an
   override survived a data replacement and went on correcting the new numbers.

A sixth was caught by rendering the finished page: the reserve KPI was computing an
**all-funds** percentage (5.71%, "Strong") when the workbook restricts it to the General
Fund (4.8%, "Acceptable"). Now enforced in `loadCore` and regression-tested.

---

## Context

Milestone 1 shipped the platform foundation. Milestone 2 shipped the entire data pipeline *and*
the calculation engines behind the dashboards — fund balance, cash, utilisation, forecasting,
27 thresholds and a 24-alert catalogue, each covered by a verification script.

**Milestone 3 is display work on engines that already compute.** That sentence is the plan's
thesis and also its main risk: it is nearly true, and the gap between "nearly" and "true" is
where this milestone will actually be spent.

The engines were built to feed the alert catalogue, so they answer **one figure, one period,
one fund**. Every dashboard number that is a *breakdown* (by revenue source, function, object,
fund) or a *series* (twelve periods, four forecast years) has no engine behind it. That is the
real body of work, and it is data-layer work, not chart work.

Six parallel audits mapped the spec onto the codebase and found **102 gaps**. This plan is
what to do about them.

---

## Verified before planning

Findings we checked ourselves rather than took on trust. Each was reproduced against the live
database.

### Two live security defects — FIXED

**1. Cross-tenant data leak in the forecast engine.** `lib/tenant-scope.ts` holds an allowlist
that **fails open**: a district-owned model missing from it is silently not scoped at all.
`DistrictPolicy`, `ForecastAssumption` and `FundBalanceProjection` were all added in Milestone 2
and never added to it.

`ForecastAssumption` was leaking in production code. `lib/forecast/engine.ts:109` asks for
`{ fiscalYear, kind }` with no district filter, and the rows come back keyed by `RevenueType` /
`ObjectType` — which are **global** ids shared by every district. One district's growth
assumption could therefore land in another district's forecast, silently.

> Reproduced: a row planted in *River Valley* was returned by *Demo ISD*'s **scoped** client.

**2. Raw SQL bypassed tenant scoping entirely.** The extension registered its hook under
`query.$allModels.$allOperations`, and raw operations carry no model — so they were never
intercepted. `$queryRaw` on a scoped client returned every district's rows.

This one mattered *specifically* for this milestone: the twelve-period pivot behind every trend
chart looks much easier in SQL than in Prisma. It is, and it would have made the platform
single-tenant.

**Both are fixed**, plus the reason they survived: the allowlist's comment claimed
`verify:m1` and `verify:import` checked it. They did not — they only imported the module.
`npm run verify:tenancy` now reads `prisma/schema.prisma`, finds every model carrying a
`districtId`, and fails if one is unscoped. 10/10 passing; full suite (17 scripts, 622
assertions) green.

### Three correctness defects in delivered engines — TO FIX

| Defect | Evidence | Consequence |
|---|---|---|
| `projectFundBalance()` carries the same total across every forecast year | `lib/forecast/engine.ts:315` — `runningTotal = out[out.length-1].total` re-assigns the value just pushed | §6.2's "PROJECTED 3-YEAR CHANGE" is structurally always $0 and the forecast trend line is flat |
| `AlertFacts.forecastReservePercent` is hardcoded `null` | `lib/alerts/engine.ts:203` | Three of the 24 alerts can never fire, and §6.2's "Forecast Alerts" card is permanently empty |
| `AlertFacts.componentsExceedTotal` is hardcoded `false` | `lib/alerts/engine.ts:205` | The 24th alert can never fire |

The 24-alert catalogue is verified by `verify:alerts`, which tests each definition against a
fixture. It does not test that `gatherFacts` supplies the facts — which is how four alerts
shipped permanently silent behind a passing test.

---

## Scope

### In

The five dashboards, the two entry screens the spec lists as known gaps, and what they rest on.

| # | Deliverable | Spec |
|---|---|---|
| 1 | Executive dashboard | §3 |
| 2 | Revenue dashboard | §4 |
| 3 | Expenditures dashboard | §5 |
| 4 | Fund Balance — Current Position, Forecast & Planning, Policies, Alerts | §6 |
| 5 | Cash Position dashboard | §7 |
| 6 | Forecast assumptions entry screen | §6.2, closes a known gap |
| 7 | Fund-balance override entry screen | §6.5, closes a known gap |
| 8 | Alert panel and status indicators | §3.3c, §5.17 |
| 9 | Excel export; PDF via print stylesheet | §8.5 |
| 10 | Nav restructure, header scope bar, top-level Data entry | §2.1, §2.2, §5.19 |
| 11 | Twelve periods + a prior year of demo data | §9.2, §9.5 |
| 12 | Documentation, backups, security review, deployment, UAT | Milestone Plan |

### Deliberately out

| Dropped | Why |
|---|---|
| **Grants & Capital Projects modules** | V2 paid modules in both client documents. They appear in the reference nav — raise it with Gary explicitly rather than let it pass silently. |
| **Enrollment** | Phase 2. No source data exists. |
| **5Y / 3Y / 1Y range toggle** (§3.2b) | A control that cannot do anything: the platform will hold at most two fiscal years. Ship the trend without it; add it when there is history to toggle. |
| **A charting dependency** | See decision D2. |

---

## Decisions

Where the audits disagreed or the spec was ambiguous, this is the call.

**D1 — "Variance" means two different things, and both are needed.**
The code already contains both readings and the spec asks for both without distinguishing them.
Left alone, this ships two tiles that disagree.

- **`% of Budget`** = YTD ÷ **full-year** budget. Answers *"how much of the budget have we
  used?"* Used by §3.1 tiles 1–2 and every "% of Budget" table column.
- **`Variance`** = YTD − **pro-rated** budget (`budget × periods ÷ 12`). Answers *"are we on
  pace?"* This is what `gatherFacts` already computes and what the alerts fire on, so a tile
  and the alert beside it cannot disagree.

Both live in `lib/finance/variance.ts`, named `consumption()` and `pace()`, so no caller can
pick one by accident.

**D2 — Charts stay dependency-free.** The strongest opposing case is real: `d3-scale` +
`d3-shape` are pure math, server-safe, and would supply exactly the fiddliest three pieces
(nice ticks, band scales, arc paths). We are not taking it, because those three pieces are
*already written and tested* in `lib/dashboard/scale.ts` (~200 lines), and the charts must
render inside a Server Component and into a printed PDF, which is where charting libraries
actually fail. Revisit only if a chart form arrives that the primitives cannot express.

**D3 — The status ladder gets two tokens per rung, not one.** A `mark` step for chart fills
(validated ≥3:1 on white) and a darker `ink` step for badge text (≥4.5:1 on its tint). See
"Colour" below — this was measured, not chosen.

**D4 — Alerts gain a third severity, `INFORMATIONAL`.** §3.3c counts Critical / Warning /
Informational and the catalogue has two. Several facts worth stating are genuinely not
concerns ("cash disbursements exceeded receipts this month"). `verify:alerts` asserts group
counts and must be updated in the same commit.

**D5 — Scope lives in the URL, resolved once per request.** `fy` · `period` · `fund`, exactly
as the data-browse page already does it. Layouts cannot read `searchParams`, so scope is
resolved per page and shared through a request-memoised loader rather than hoisted.

**D6 — Reserve figures are General-Fund-only, enforced in code.** The workbook is explicit and
the schema comment repeats it, but nothing stops an All-Funds reserve percentage being
computed. `lib/finance/funds.ts` resolves *the* General Fund; the reserve helpers refuse a
scope that is not it.

---

## Colour — measured, not chosen

The dashboards are the first screens in this product where colour carries meaning, so the
palette was run through a colour-blindness validator rather than eyeballed. Two results worth
recording:

1. **The existing `warn` and `bad` tokens were too close.** `#b57a17` and `#c2542e` measure
   ΔE 4.7 apart under deuteranopia and 9.6 under normal vision — a **Monitor** badge and an
   **Action Required** badge were genuinely hard to tell apart. Re-stepped to `#b8880f` /
   `#c0342b`: ΔE 11.8. This is the one confusion a finance dashboard cannot afford.
2. **Green-vs-red for positive/negative variance fails outright** (ΔE 5.3 deutan). Splitting
   the pair by *lightness* as well as hue — a mid green `#19a86e` against a deep red `#9c2820`
   — reaches ΔE 17.9 while keeping the reading a finance office expects.

The six categorical series slots were chosen by enumerating all 120 orderings of the candidate
hues and keeping only the 8 that clear every gate. Tokens and the reasoning are in
`app/globals.css`.

---

## Build order

The spine is serial. Nothing below the line can start until the foundation lands, because
otherwise five dashboards each invent their own answer to the same five questions.

```
FOUNDATION  (serial — must land first)
  F1  tenancy fix + verify:tenancy                          ✅ DONE
  F2  status ladder tokens, series palette, print CSS       ✅ DONE (tokens)
  F3  lib/dashboard/{format,scale,status}.ts                ✅ DONE
  F4  chart chrome (grid, axes, legend, figure, empty)      ✅ DONE
  F5  lib/dashboard/scope.ts — scope resolution + "data as of"
  F6  lib/finance/{funds,variance,breakdown,series,cash}.ts — THE DATA LAYER
  F7  engine fixes: forecast carry-forward, the 4 silent alerts, INFORMATIONAL
  F8  chart primitives: line · hbar · column · donut · gauge · sparkline · waterfall · band
  F9  UI: KPI tile · section card · data table · alert list · scope bar · tabs · empty state
  F10 sample data → 12 periods + prior year, shaped to tell the reference's story

PARALLEL  (once F1–F10 land, these are independent)
  P1  Executive dashboard          P4  Fund Balance (4 tabs)
  P2  Revenue dashboard            P5  Cash Position dashboard
  P3  Expenditures dashboard       P6  Alerts page

THEN
  T1  forecast assumptions screen + fund-balance override screen (write paths)
  T2  Excel export + print stylesheet
  T3  nav restructure + header scope bar wiring
  T4  verify:dashboard, verify:scope, verify:charts, verify:override
  T5  docs, backups, security review, deploy, UAT
```

**Critical path: F6.** The data layer is the milestone. It is also the only part where a
mistake is invisible — a wrong chart looks wrong, a wrong aggregate looks fine.

---

## The data layer (F6) — the part that matters

Five new modules under `lib/finance/`. All of them return `Prisma.Decimal`, never `number`:
the float boundary is the single most likely way a dashboard figure ends up disagreeing with
the CSV export of the same number.

| Module | Job | Serves |
|---|---|---|
| `funds.ts` | Resolve *the* General Fund; list funds with data | §3.1, §4.2, §5.2, §6.*, D6 |
| `variance.ts` | `consumption()` and `pace()` — the two readings of D1 | §3.1, §4.1, §5.1 |
| `breakdown.ts` | One function shape, five dimensions: by revenue source, function, object, revenue type, fund | §4.2, §5.2, §6.1, §7.2 tables and donuts |
| `series.ts` | Up to 12 periods of any figure, plus the prior year | every trend chart and sparkline |
| `cash.ts` | Full cash aggregate, days-cash, 30-day forecast, 12-month high/low/volatility | §7 entirely |

**Three traps, all found by the audit:**

1. **The series trap.** Written the obvious way, a 12-period trend is 96+ queries, because
   every engine function re-resolves its own version ids. `currentVersionIds()` takes a single
   period. The fix is one query that omits `period` entirely and returns current-version ids
   for the whole fiscal year, keyed by period. Correct *because* of the partial unique index
   that guarantees one current version per period.
2. **Never filter periodic data by `(fiscalYear, period)`.** Filter by `versionId`. Filtering
   by period sweeps in superseded versions and double-counts every re-upload the district ever
   made. The existing schema index comments suggest otherwise; they are wrong.
3. **`groupBy.by` takes scalars only.** Grouping by `RevenueType` / `ObjectType` (relation
   fields) cannot be expressed natively. Fold in memory off the ~40-row lookup — *not* by
   `findMany`-ing every detail row, which is what `lib/forecast/engine.ts` currently does and
   what §8.3 forbids.

Target: **≤20 queries** for the Executive dashboard, all but two of them parallel.

---

## File-by-file

### Done

| File | Job |
|---|---|
| `lib/tenant-scope.ts` | Allowlist completed; raw SQL refused on a tenant client |
| `scripts/verify-tenancy.mts` | Reads schema.prisma; asserts the allowlist is complete |
| `app/actions/policies.ts` | `upsert` → scoped `updateMany` + `create` |
| `app/globals.css` | Status ladder (mark/ink/tint), six series slots, chart chrome tokens |
| `lib/dashboard/status.ts` | The four-rung ladder generalised beyond the reserve % |
| `lib/dashboard/format.ts` | Money, accounting, percent, delta, safe change/share |
| `lib/dashboard/scale.ts` | Nice ticks, linear/band scales, bar & arc paths |
| `components/dashboard/status-badge.tsx` | The badge, always with its word |
| `components/dashboard/charts/chrome.tsx` | Grid, axes, threshold rule, legend, empty, figure |

### To build

**Data layer** — `lib/finance/{funds,variance,breakdown,series,cash}.ts`;
`lib/dashboard/scope.ts`; `lib/dashboard/snapshot.ts` (request-memoised loader);
`lib/alerts/insights.ts` (§3.4 sentences — generated in `lib/`, never in a component).

**Engine fixes** — `lib/forecast/engine.ts` (carry-forward; widen for §6.2's planning table);
`lib/alerts/engine.ts` (wire the two hardcoded facts); `lib/alerts/catalog.ts` (INFORMATIONAL;
the three status helpers beside `reserveStatus`); `lib/finance/fund-balance.ts` (export
`findOverride`; add the components reader and a bulk override reader).

**Charts** — `components/dashboard/charts/`: `line-chart.tsx`, `hbar-chart.tsx`,
`column-chart.tsx`, `donut-chart.tsx`, `gauge.tsx`, `sparkline.tsx`, `waterfall-chart.tsx`,
`benchmark-band.tsx`, plus `chart-card.tsx` (`"use client"` shell that takes server-rendered
children — the pattern that keeps SVG out of the client bundle).

**UI** — `components/dashboard/`: `kpi-tile.tsx`, `section-card.tsx`, `data-table.tsx`,
`alert-list.tsx`, `insight-list.tsx`, `policy-echo-card.tsx`, `stat-strip.tsx`,
`scope-bar.tsx`, `data-as-of.tsx`, `value.tsx` (the N/A primitive);
`components/ui/`: `tab-bar.tsx`, `empty-state.tsx`, `info-tip.tsx`.

**Routes** — `app/(district)/`: `dashboard/`, `revenues/`, `expenditures/`,
`fund-balance/{page,forecast,policies,alerts}`, `cash/`, `alerts/`, plus an
`export/route.ts` per dashboard.

**Actions** — `app/actions/forecast.ts`, `app/actions/fund-balance.ts`.

**Permissions** — `lib/auth/permissions.ts`: `edit_forecast_assumptions` (District Admin +
Finance User) and `override_fund_balance` (District Admin only). Neither maps onto an existing
permission.

**Data & verification** — `scripts/generate-sample-data.mts` (12 periods × 2 years, shaped for
mild difficulty); `scripts/seed-sample-import.mts`; `scripts/verify-{dashboard,scope,charts,override}.mts`.

---

## Verification

| Script | Asserts |
|---|---|
| `verify:tenancy` ✅ | Every district-owned model is scoped; raw SQL refused | 
| `verify:scope` | Falls back correctly with no data, partial data, a bad URL |
| `verify:charts` | Tick math, band geometry, path building — pure, no DB |
| `verify:dashboard` | **Every KPI resolves to a figure or an explicit N/A**, and **a dashboard total equals the sum of its own breakdown table** (the classic dashboard bug) |
| `verify:override` | An override changes the displayed figure, is labelled, and is cleared by a Replace |
| `verify:alerts` (extend) | The four silent alerts now fire; INFORMATIONAL counted |

Sentinel fiscal years are per-script and must not collide. Taken: `2099-00` commit,
`2098-99` finance, `2097-98` browse, `2095-96` versioning, **`2093-94` tenancy**.
Free: `2094-95`, `2092-93`, `2091-92`.

---

## Risks, ranked

1. **A dashboard total disagrees with its own breakdown table.** The classic. Caused by
   Decimal→float at the component boundary, or by an aggregate filtered on `(fiscalYear,
   period)` instead of `versionId`. `verify:dashboard` exists for exactly this.
2. **Fund-balance overrides are invisible on All Funds.** `findOverride` returns `null` when
   no `fundId` is given, so §6.1's "TOTAL ALL FUNDS" row can contradict the per-fund rows
   printed directly above it. Needs a bulk reader, not a per-fund one.
3. **Twelve trend charts against two periods of demo data.** Every chart will look correct in
   review and be untestable. F10 is not cosmetic; it gates honest review.
4. **A chart primitive gets imported into a `"use client"` file** and silently joins the
   client bundle. Nothing errors, the page still works, and the PDF quietly degrades.
5. **Alerts are evaluated for the current period only**, so a trend chart that visibly dips
   below a red line will have no alert beside it and look broken.
6. **The tenant extension throws on `upsert`/`update`/`delete`.** Every new write will
   instinctively be written as an upsert against a compound unique, and every one fails at
   runtime, not compile time.
7. **`Prisma.Decimal` does not cross the Server→Client boundary.** Every interactive chart
   wrapper must take formatted strings or plain numbers, decided at the seam.

---

## Open questions for Gary

1. **Grants and Capital Projects** appear in the reference nav but are V2 paid modules in both
   documents. Confirm they are out of Milestone 3.
2. **Transfer object codes** — still the one outstanding input. Until they land, Net Operating
   Surplus ships behind a "provisional" label. (The fund *balance* itself does not need them —
   the classification cancels out. Only the transfer-excluding figures do.)
3. **Which dashboard matters most**, and which figures on it. Milestone 3 has about a week.
4. **Reserve denominator**: `reservePercent()` divides by *budgeted* expenditure; the
   reference tile reads "% of Total GF Expenditures", which a reader will take to mean actuals.
   Confirm budgeted is intended.
5. **Prior-year comparisons** (§7.2 cash flow summary) need a prior year of committed data.
   Confirm districts will upload history, or those columns ship showing "—".
