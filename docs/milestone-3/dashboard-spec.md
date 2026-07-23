# Milestone 3 — Dashboard Visual & Functional Specification

**Source:** six reference screenshots supplied by the client (Gary), July 2026.
**Status:** transcription of intent. Not a pixel contract — the client's words: *"They are not
intended to be copied exactly, but they reflect the overall direction I want. Clean, modern,
executive-focused, easy to interpret quickly. Carry forward the KPI hierarchy, financial health
indicators, trend views, alert visibility, and use of white space."*

This document is the **single source of truth** for what each Milestone 3 screen contains.
Every figure named below must resolve to a real query against committed data, or be listed in
§9 as a gap with a decision attached. No screen ships with a number nobody can trace.

---

## 1. What carries forward from the reference design

Five things the client named explicitly. Everything else is negotiable; these are not.

1. **KPI hierarchy.** A single row of large-format tiles at the top of every dashboard. The most
   important number is the biggest thing on the page. Each tile: icon chip · uppercase label ·
   large value · one sub-line of context · optional status badge or delta.
2. **Financial health indicators.** Status is a first-class visual: the four-rung ladder
   (Strong / Acceptable / Monitor / Action Required) appears as a coloured badge everywhere a
   figure is measured against a policy, and it always comes from `reserveStatus()` and the
   district's own thresholds — never a second ladder.
3. **Trend views.** Every domain shows movement over time, not just a point in time. Line charts
   for balances, bar charts for period variance, sparklines inside tables.
4. **Alert visibility.** Alerts are never buried. Every dashboard carries an alert card scoped to
   its own domain, and the Executive dashboard carries the cross-domain summary.
5. **White space.** Generous card padding, clear section separation, no dense grids. Cards group
   related figures; a card does one job.

---

## 2. Global chrome

### 2.1 Sidebar (dark navy, existing `AppShell`)

Reference nav, grouped:

| Group | Items |
|---|---|
| MAIN | Executive Dashboard · Revenues · Expenditures · Fund Balance · Cash Position |
| DATA MANAGEMENT | Data Uploads · Validation · Data Browse · Chart of Accounts |
| ADMINISTRATION | Users · District Settings · Financial Policies · Audit Log |

Notes:
- The reference also shows **Capital Projects** and **Grants** under MAIN. Both are **V2 paid
  modules** per Feature Spec §5.14 and Milestone Plan §"Reduced, deliberately". They are **not
  built in M3**. See §9.1.
- Fund Balance is a parent with sub-items when active: *Current Position*, *Forecast & Planning*.
- The reference shows a "Need Help? / View Help Center" card and a COLLAPSE control at the
  sidebar foot. Collapse is worth having; the help centre has no content behind it and is out.
- Existing `SidebarNav` already renders groups and active state. Extend, do not replace.

### 2.2 Header bar

Left: page title with an info affordance, and a one-line description.
Right, in order:

| Control | Behaviour |
|---|---|
| **Scope selector** ("District View") | All Funds ⟷ a single fund. Drives every figure on the page. URL param `fund`. |
| **Period selector** ("May 2026 (FY 2025-26)") | Fiscal year + reporting period. Only periods with committed data are offered. URL params `fy`, `period`. |
| **Export** | CSV / Excel / PDF of the dashboard's underlying data. |
| **Filters** | Secondary filters where a dashboard has them. |
| **User chip** | Initials avatar, name, role. Already exists in the sidebar foot — the reference puts it top-right. Keep one, not two. |

Below the header, right-aligned: **"Data as of: <date>"** — the effective date of the current
period's committed data. This is a trust signal and appears on every dashboard.

### 2.3 Status ladder — one vocabulary, everywhere

| Label | Colour family | Meaning |
|---|---|---|
| Strong | green | at or above target |
| Acceptable | blue / teal | between warning and target |
| Monitor | amber | between critical and warning |
| Action Required | red | below critical |
| N/A | grey | cannot be computed — never reads as "fine" |

Sourced from `lib/alerts/catalog.ts#reserveStatus` and the district's `DistrictPolicy`. A badge
and the alert printed beside it can never disagree, because they read the same thresholds.

**"We cannot say yet" is not "all clear."** Where a figure has no data behind it, the tile shows
an em-dash and a grey N/A badge with a reason on hover. It never shows `$0` or a green badge.

---

## 3. Executive Dashboard (`/dashboard`)

> *"Financial summary and key indicators of fiscal health."*

### 3.1 KPI row — six tiles

| # | Label | Value | Sub-line | Status / delta | Source |
|---|---|---|---|---|---|
| 1 | TOTAL REVENUES (YTD) | money | `<pct>% of Budget` | ▲/▼ `$X vs Budget` | `activityTotals().totalRevenueYtd`, budget from detail rows |
| 2 | TOTAL EXPENDITURES (YTD) | money | `<pct>% of Budget` | ▲/▼ `$X vs Budget` | `activityTotals().totalExpenditureYtd` |
| 3 | UNASSIGNED FUND BALANCE % | percent | `of Total GF Expenditures` | badge + `Target ≥ X%` | `reservePercent()` + `policy.fundBalance.target` |
| 4 | DAYS OF OPERATING CASH | integer | `Days in Reserve` | badge + `Policy ≥ X Days` | `gatherFacts().daysCashOnHand` |
| 5 | BUDGET VARIANCE | money, parenthesised when negative | `<pct>% Under/Over Budget` | tone by sign | expenditure YTD − pro-rated budget |
| 6 | ALERTS | count | `Require Attention` | link "View All Alerts →" | `evaluateAlerts().alerts.length` |

Icon chips: green $, blue card, purple shield, orange clock, green trend, red bell.

### 3.2 Row two — three cards

**a. FINANCIAL HEALTH SUMMARY** — *"Key indicators compared to policy targets"*

Table: `Indicator | Current | Target / Policy | Status | Trend`

Rows (each a real threshold comparison, each with a 12-point sparkline):
- Unassigned Fund Balance %
- Days of Operating Cash
- Budget Utilization
- Revenue Variance (YTD)
- Expenditure Variance (YTD)

Footer link → `/policies`.

**b. FUND BALANCE TREND (ALL FUNDS)** — range toggle `5Y | 3Y | 1Y`

Two line series with point labels:
- Total Fund Balance (navy)
- Unassigned Fund Balance, General Fund only (green)

X axis = reporting periods with committed data. Footer link → `/fund-balance`.

**c. CASH POSITION (ALL FUNDS)** — *"As of <date>"*

Semicircular gauge, red→amber→green arc, scale `0 · 15 · 30 · 45 · 60+`, needle at days-cash,
centre reads the number and the status word. Below the gauge, two figures side by side:
`Cash Balance` and `Avg Monthly Expenses`. Footer link → `/cash`.

### 3.3 Row three — three cards

**a. REVENUES vs BUDGET (YTD)** — horizontal grouped bars by major revenue source (top 5 by
budget). Series: Actual (YTD) green · Budget (YTD) navy · Budget (Full Year) dashed outline.
Value labels at bar ends. Footer link → `/revenues`.

**b. EXPENDITURES vs BUDGET (YTD)** — same construction, by function (top 5 by budget).
Footer link → `/expenditures`.

**c. ALERT SUMMARY** — three rows, each icon + label + description + count:
- Critical Alerts — *Action required immediately* — red
- Warning Alerts — *Monitor and address soon* — amber
- Informational Alerts — *For awareness* — blue *(see §9.3 — severity gap)*

Footer link → `/alerts`.

### 3.4 Row four — KEY INSIGHTS

Three plain-English sentences derived from the facts, each with a coloured circular icon
(↑ / ↓ / shield). These are **generated from the same facts the alerts read**, not written by
hand and not an LLM call. Example forms:

- *"Revenues are ahead of budget by 11.50%, primarily from <top positive variance source>."*
- *"Expenditures are under budget by 16.55% across most major function categories."*
- *"Unassigned fund balance is below the policy target of 5.00%. Continued monitoring is recommended."*

An insight only appears when its underlying fact is non-null. Three is a maximum, not a quota.

---

## 4. Revenue Dashboard (`/revenues`)

> *"Track revenue performance against budget and forecast."*

### 4.1 KPI row — six tiles

| Label | Value | Sub-line |
|---|---|---|
| TOTAL REVENUES (YEAR TO DATE) | money | `<pct>% of Budget` |
| REVENUE VARIANCE (YEAR TO DATE) | money | `<pct>% Above/Below Budget` |
| FORECAST VARIANCE (YEAR END) | money | `<pct>% Above/Below Budget` |
| MONTH OVER MONTH CHANGE (VS <prev month>) | money | `+<pct>% Increase / −<pct>% Decrease` |
| REVENUE STATUS (YEAR TO DATE) | status word | `Within / Below Policy (±X%)` |
| DAYS IN FISCAL YEAR | integer | `of 365 Days` |

### 4.2 Cards

**REVENUES – BUDGET VS ACTUAL** — *"Year to date through <date>"* — line chart, three series:
Actual (YTD) green solid with markers · Budget (YTD) blue dashed with markers · Budget (Full
Year) grey dashed flat line. End-of-line value labels.

**REVENUE BY MAJOR SOURCE** — table:
`Revenue Source | Budget (Full Year) | Actual (YTD) | % of Budget | Variance $ | Variance %`
Variance % coloured by sign. Bottom TOTAL row, emphasised. Footer "View all revenue sources →"
(→ periodic data browse, filtered).

**REVENUE POLICY (GENERAL FUND ONLY)** — read-only echo of the district's own thresholds:
Warning ±X% · Critical ±X% · Forecast Warning ±X% · Forecast Critical ±X%.
Link "⚙ Manage Revenue Policies" → `/policies#revenue` (only for those who can edit).

**TOP POSITIVE VARIANCES** / **TOP NEGATIVE VARIANCES** — two small cards, three to five rows
each: source name + variance amount, coloured.

**REVENUE VARIANCE TREND (YTD)** — *"Actual vs Budget Variance %"* — vertical bars per period,
green above zero, red below, with % labels and a zero baseline.

**REVENUE BY CATEGORY (YTD)** — donut, centre = total actual YTD. Legend rows: category name,
share %, amount. Categories = `RevenueType` (the global list the forecast also groups by).
Footer "View full breakdown →"

**REVENUE ALERTS (n)** — the revenue-group alerts from the catalogue, each with severity icon,
message and status badge. Footer "View all alerts →"

**Footer info bar** — *"Revenue data is imported from your financial system. Review revenue
policies to adjust alert thresholds."* + button → `/policies`.

---

## 5. Expenditures Dashboard (`/expenditures`)

> *"Track spending performance against budget and forecast."*

### 5.1 KPI row — six tiles

TOTAL EXPENDITURES · BUDGET UTILIZATION (`<pct>% Remaining`) · FORECAST VARIANCE ·
MONTH OVER MONTH CHANGE · EXPENDITURE STATUS (`Approaching X% Threshold`) · DAYS IN FISCAL YEAR.

### 5.2 Cards

**EXPENDITURES – BUDGET VS ACTUAL** — same three-series line chart as revenue, plus a summary
strip beneath it: `Actual (YTD) | Budget (YTD) | Variance (YTD) | Variance % (YTD)`.

**EXPENDITURES BY FUNCTION (YTD)** — table, same six columns as Revenue by Major Source, grouped
by `AccountFunction`, with a TOTAL row.

**EXPENDITURE POLICY (GENERAL FUND ONLY)** — Budget Utilization Warning / Critical · Forecast
Variance Warning / Critical · Month-over-Month Increase Warning / Critical.

**TOP POSITIVE / NEGATIVE VARIANCES (YTD)** — five rows each, by object or function.

**BUDGET UTILIZATION TREND (YTD)** — vertical bars per period with % labels, plus two dashed
horizontal threshold lines (Warning, Critical). Bars past the warning line take the amber fill;
past critical, red.

**EXPENDITURES BY OBJECT (YTD)** — donut, centre = total actual YTD, legend by `ObjectType`.

**FORECAST VS BUDGET (YEAR END)** — vertical bars per category, positive green / negative red,
showing projected year-end variance. Footer "View full forecast →" → Fund Balance ▸ Forecast.

**EXPENDITURE ALERTS (n)** — expenditure-group alerts.

**Footer info bar** — *"Adjust your assumptions in Forecast & Planning to see how changes in
spending impact fund balance and reserves."* + button → `/fund-balance/forecast`.

---

## 6. Fund Balance (`/fund-balance`)

Tabbed screen. Tabs: **Current Position** · **Forecast & Planning** · **Policies** · **Alerts (n)**.

### 6.1 Tab: Current Position

**KPI row — five tiles**

| Label | Value | Sub-line |
|---|---|---|
| TOTAL FUND BALANCE | money | `vs <prev month>` ▲ delta + % |
| CHANGE FROM PRIOR MONTH | money | `vs <prev month>` ▲ delta + % |
| UNASSIGNED FUND BALANCE (GENERAL FUND ONLY) | money | `vs <prev month>` ▲ delta + % |
| UNASSIGNED FUND BALANCE % (GENERAL FUND ONLY) | percent | `Target ≥ X%` + badge |
| RESERVE STATUS (GENERAL FUND ONLY) | status word | `Policy Range: X% – Y%` |

**Fund Balance by Fund** — table `Fund | Total Fund Balance | Primary Classification | Status`,
with a TOTAL ALL FUNDS row. Footnote: *"Unassigned Fund Balance and Unassigned Fund Balance %
apply to the General Fund only. Other funds are shown with their primary fund balance
classification."*

**Fund Balance Trend (All Funds)** — two-series line chart with a `View by: Month ▾` control.

**Fund Balance % – Policy Benchmark** — a horizontal gradient bar divided into the four policy
bands (red / amber / blue / green) with the district's own thresholds as the boundaries, and a
marker at the current percentage. Caption states the policy in words.

**Fund Balance Waterfall (All Funds)** — six bars:
`Beginning Fund Balance` (grey) → `Revenues` (green) → `Expenditures` (red) →
`Transfers In` (green) → `Transfers Out, net` (red) → `Ending Fund Balance` (grey).
Every one of these is already computed by `activityTotals()` + `transferIds()`.

**Fund Balance Composition (General Fund)** — donut, centre = total fund balance, legend:
Nonspendable · Restricted · Committed · Assigned · Unassigned, each with amount and share.

**Footer info bar** → Forecast & Planning.

### 6.2 Tab: Forecast & Planning

> *"Plan for the future. Adjust assumptions to see how revenues, expenditures and fund balance
> may change."*

**1. FORECAST ASSUMPTIONS** — the entry screen the spec lists as a known gap.
Two stepper inputs: `Revenue Growth (Annual) %` and `Expenditure Growth (Annual) %`.
`Save Assumptions` button. An explanatory panel beside them. District Admin + Finance User only.
*(See §9.4 — the reference uses two district-level rates; the schema stores per-category
assumptions. Both must work.)*

**2. BUDGET FORECAST (PLANNING VIEW)** — *"Can we balance the budget?"* — table, dollars in
millions, four columns (current budget year + three forecast years). Rows:
Projected Revenues · Projected Expenditures · Surplus/(Deficit) · Fund Balance Used to Balance ·
Cumulative Fund Balance Used · Fund Balance Used as % of Revenues.
Footnote explains positive vs negative.

**3. FUND BALANCE FORECAST (FINANCIAL HEALTH VIEW)** — *"Will our reserves remain healthy?"* —
same four columns. Rows: Beginning Fund Balance · Net Surplus/(Deficit) · Estimated Ending Fund
Balance · Less: Nonspendable/Restricted/Assigned · Projected Unassigned Fund Balance ·
Unassigned Fund Balance % of Expenditures · Reserve Status (badge per column).

**4. FUND BALANCE FORECAST TREND** — line chart of projected reserve % across the four years,
drawn over four horizontal threshold bands (Strong / Acceptable / Monitor / Action Required)
taken from the district's own policy.

**5. FORECAST ALERTS** — the forecast-group alerts, one row each with year, title, message, badge.

**Right rail** — four small cards:
- BOARD POLICY (GENERAL FUND ONLY): target, warning, critical + "⚙ Manage Policies"
- PROJECTED 3-YEAR CHANGE: money delta, `From $A to $B`, `−X% decrease`
- PROJECTED LOWEST POINT: fiscal year + percentage
- DAYS OF OPERATING EXPENSES: days, `Days in Reserve by FY <year>`

**Footer info bar** + `Adjust Assumptions →` primary button.

### 6.3 Tab: Policies

Read-only rendering of the fund-balance policy group, with an edit affordance for District
Admins that links to `/policies`. Do not duplicate the editing form.

### 6.4 Tab: Alerts

The fund-balance group alerts in full, with their messages and thresholds.

### 6.5 Fund-balance override entry

The second known gap. Reached from the Fund Balance by Fund table (per-fund row action) and from
the composition card. A modal or dedicated page that:

- lets a **District Administrator only** correct any derived component
  (`TOTAL · UNASSIGNED · NONSPENDABLE · RESTRICTED · COMMITTED · ASSIGNED`),
- **requires a written reason** — not optional, no default text,
- shows the computed figure beside the correction so both are visible,
- writes an audit entry,
- labels the figure as an override **wherever it is shown afterwards**, with who and when.

Storage, versioning, provenance and the Replace-clears rule are already delivered
(`FundBalanceOverride`, `lib/finance/fund-balance.ts#findOverride`). This is the screen only.

---

## 7. Cash Position Dashboard (`/cash`)

> *"Monitor cash availability, liquidity, and cash flow."*

### 7.1 KPI row — seven tiles

CASH BALANCE · DAYS CASH ON HAND (+badge, `Policy ≥ X Days`) · NET CASH FLOW (MTD) (sub-line
`Receipts $X  Disb. $Y`) · MONTH OVER MONTH CHANGE · CASH RECEIPTS (MTD) · CASH DISBURSEMENTS
(MTD) · CASH STATUS.

Each comparison tile carries `vs <prev month>` with a signed delta and percentage.

### 7.2 Cards

**CASH BALANCE TREND (ALL FUNDS)** — line chart: Ending Cash Balance (green solid) + 30-Day Cash
Forecast (blue dashed, forward of the last actual). Beneath, a four-figure strip:
`12-MONTH HIGH` (with month) · `12-MONTH LOW` (with month) · `AVERAGE MONTHLY CASH` ·
`CASH VOLATILITY` (Low / Moderate / High, vs prior 12 months).

**CASH BALANCE BY FUND** — table `Fund | Cash Balance | % of Total | Days Cash (Est.) | Status`,
with a TOTAL ALL FUNDS row. A fund with no expenditure base shows `—` and an N/A badge, never a
number.

**CASH POLICY SUMMARY (ALL FUNDS ONLY)** — Days Cash Warning / Critical · Cash Decrease Warning /
Critical + "⚙ Manage Cash Policies".

**MONTHLY CASH SUMMARY (ALL FUNDS)** — Beginning Cash Balance · Cash Receipts (MTD) ·
Cash Disbursements (MTD) · Net Cash Flow (MTD) · Ending Cash Balance · Days Cash on Hand.

**CASH FLOW SUMMARY (ALL FUNDS YTD)** — table
`Metric | <month> MTD | <same month prior year> MTD | YTD <month> | YTD <prior year> | Change (YTD)`.
Rows: Beginning Cash Balance · Cash Receipts · Cash Disbursements · Net Cash Flow · Ending Cash
Balance. Prior-year columns show `—` when that year has no committed data (§9.5).

**CASH ALERTS (n)** — cash-group alerts.

**CASH COMPOSITION (ALL FUNDS)** — donut, centre = total cash. Legend: Operating Accounts ·
Investment Accounts · Restricted Accounts · Other, each with amount and share. Maps to
`CashPosition.unrestrictedCash / investmentBalance / restrictedCash` and a derived remainder.

**Footer info bar** — *"Cash balances are unaudited and based on data imported through <date>."*

---

## 8. Cross-cutting requirements

### 8.1 Scope resolution

One helper resolves the page's scope from URL params and falls back sensibly:
`fy` → latest fiscal year with committed data; `period` → latest period with committed data in
that year; `fund` → All Funds. Every dashboard reads scope through it. A district that has
uploaded nothing gets an empty state with a link to the upload screen, not a page of zeros.

### 8.2 Permissions

Dashboards require `view_dashboards`. The forecast-assumptions screen requires an editing right
(District Admin or Finance User); the fund-balance override requires District Admin. Exports
require `export_data`. External users reach all of this through their grant level, unchanged.
Enforced server-side, in the page, not only by hiding a button.

### 8.3 Performance

Every dashboard is a Server Component issuing parallel aggregate queries. No dashboard loads
detail rows into memory to sum them — `groupBy` and `aggregate` in the database. Target: a
dashboard renders in under two seconds at realistic district volumes (NFR §9).

### 8.4 Charts

Hand-rolled SVG primitives, server-renderable, no charting dependency. This is the existing
pattern (`components/dashboard/charts.tsx`) and it is the right one here: the charts must also
render into the PDF export, and a client-only charting library cannot. Interactive affordances
(range toggles, tooltips, "view by") are thin client wrappers over the same SVG.

### 8.5 Exports

- **CSV** — already live; every dashboard table exports what is on screen.
- **Excel** — via the existing `exceljs` dependency: one workbook per dashboard, one sheet per
  card, figures as real numbers with formats, not strings.
- **PDF** — the dashboard rendered to a print stylesheet. No headless browser at MVP scale.

### 8.6 Empty and partial states

Three distinct states, never conflated:
1. **No data at all** for the scope → an empty state that names what to upload.
2. **Partial data** (e.g. no cash file for the month) → the affected card shows N/A with the
   reason; the rest of the page still works.
3. **Data, no policy** → policies fall back to workbook defaults (already handled by
   `resolvePolicy`), so this state does not exist in practice. Do not build for it.

---

## 9. Known gaps and decisions

### 9.1 Grants and Capital Projects
Present in the reference nav; **V2 paid modules** in both client documents. **Not built in M3.**
Raise with Gary rather than let it pass silently — the reference implies he may expect them.

### 9.2 Twelve-month trend data
Every trend chart wants twelve periods. The sample data generator currently produces **two**
(July and August, FY2026-27). Extend it to a full fiscal year plus the prior year's opening
balance so trends, month-over-month and prior-year comparisons all have something real to show.

### 9.3 "Informational" alert severity
The reference Executive dashboard counts Critical / Warning / **Informational**. The catalogue
has two severities (`WARNING`, `CRITICAL`). Either add a third severity for facts worth stating
that are not yet a concern, or drop the third count. Adding it touches
`lib/alerts/catalog.ts` and the verification fixture that asserts one alert per fixture.

### 9.4 District-level growth assumptions
The reference forecast screen takes **two** rates (revenue growth, expenditure growth) for the
whole district. `ForecastAssumption` stores them **per category** (`RevenueType` / `ObjectType`).
Both readings are legitimate — the workbook asks for per-category, the reference screen asks for
one number. Resolve by making the screen show both: a simple district-level rate that writes to
every category, and an advanced per-category table beneath it.

### 9.5 Prior-fiscal-year comparisons
The cash flow summary compares to the same month last year. That needs a prior year of committed
data. Show `—` when it is absent; do not fabricate.

### 9.6 30-day cash forecast
Not in any delivered engine. Derive it straight-line from the trailing average net cash flow,
label it as a projection, and keep it out of any alert.

### 9.7 Cash volatility
A new derived statistic (standard deviation of the trailing twelve ending balances, banded
Low / Moderate / High). Small, and it earns its place on the trend card.

---

## 10. Out of scope for this specification

Deployment, automated backups, the security review, user-acceptance testing and the written
documentation set are all Milestone 3 deliverables, but they are not screens and are planned
separately. Enrollment, cross-district benchmarking, saved views and custom report builders
remain later phases.
