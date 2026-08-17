# Item 7 — Administrative Review: User-Facing Language, Formatting & Display Rules

**Scope:** every district-facing screen (`app/(district)/**`), the shared dashboard components
(`components/dashboard/**`), the alert catalogue and the policy registry.
**Purpose:** one document the client can read end-to-end and mark up, so all user-facing language
is approved before MVP sign-off.

**Status of client feedback:** not yet received. Nothing in this document has been changed — it is
a faithful record of what the application says today.

## How to use this document

Every table has a **Verdict** column. Please mark each row:

| Mark | Meaning |
|---|---|
| `OK` | Approved as written |
| `CHANGE → "…"` | Replace with the wording given |
| `?` | Needs discussion |

Section 12 lists the inconsistencies we found while compiling this. Those are the rows most likely
to need a decision, so if time is short, **start with Section 12.**

---

## Table of contents

| § | Covers | Client item |
|---|---|---|
| 1 | Formatting standards — currency, percent, dates, numbers, capitalization | (d) |
| 2 | Status vocabulary and severity model | (b) |
| 3 | Alert catalogue — all 24 alerts: titles, messages, severities | (b) |
| 4 | Informational observations | (b) |
| 5 | Policy settings — labels, help text, validation messages | (b) |
| 6 | Global filters, View By / Group By, drill-down behaviour | (a) |
| 7 | Navigation, page titles and calls to action | (c), (f) |
| 8 | Dashboard-by-dashboard copy — KPI names, card titles, tooltips | (c) |
| 9 | Data display rules — Fund Code/Name, fund-level notices, label mode | (e) |
| 10 | Exports | (f) |
| 11 | Loading, empty, error and notification states | (c), (f) |
| 12 | **Inconsistencies and open questions requiring a ruling** | all |

---

## 1. Formatting standards (item d)

These are the rules the code enforces today. Source: `lib/dashboard/format.ts`, `lib/format.ts`,
`lib/text.ts`.

### 1.1 Currency

| Context | Rule | Example | Verdict |
|---|---|---|---|
| KPI tiles, chart axes, chart labels | Abbreviated, trailing zeros trimmed | `$426.85M`, `$41.6M`, `$890K`, `$1,240` | |
| Tables, drill-downs, alert sentences | Exact, comma-grouped | `$426,845,120` | |
| Cents | Shown **only when the figure has them** — never `.00` padding | `$1,234` but `$1,234.56` | |
| Negative — variances, deficits, net flows | Accounting parentheses | `($84.8M)` | |
| Negative — signed movement figures | Leading minus | `−$1.05M` | |
| Billions / millions / thousands | `B` / `M` / `K` suffix, uppercase | `$1.2B` | |

> **Note on mixed decimals.** Because cents are shown only when present, a single column can read
> `$1,234` on one row and `$1,234.56` on the next. This was a deliberate choice (padding every
> whole-dollar figure with `.00` trains the eye to skip the end of the number). **Please confirm
> this is what you want in board-facing tables.**

### 1.2 Percentages

| Context | Decimal places | Example | Verdict |
|---|---|---|---|
| KPI tiles, tables, policy echoes | 2 | `12.34%` | |
| Share-of-total bars, "% of total" columns | 1 | `12.3%` | |
| Alert message sentences | 1 | `Collections are 5.2% below budget` | |
| Key Insight sentences | 2 | `Revenues are 5.21% above budget` | |
| Chart axis / column labels | 0 or 1 | `82%`, `5.2%` | |
| Signed percentages (deltas) | 2, sign always shown | `+3.21%`, `−0.80%` | |

> ⚠️ **This is inconsistent today** — the same reserve figure reads `3.5%` in an alert, `3.50%` in
> a KPI tile, and `3.50%` in an insight. See §12.3.

### 1.3 Dates and periods

| Context | Format | Example | Verdict |
|---|---|---|---|
| "Data as of" line (every dashboard) | Month name in full | `Data as of May 31, 2026` | |
| Audit log, version history, general dates | Month abbreviated | `Sep 30, 2026` | |
| Date + time | Abbreviated month, 24h-padded time | `Sep 30, 2026, 02:15 PM` | |
| Period label on a dashboard | `Month Year (FY start-end)` | `May 2026 (FY 2025-26)` | |
| Period option in the Filters panel | `Month Year · FY start-end` | `May 2026 · FY 2025-26` | |
| Period label on the upload screen | `Month (Period N)` | `May (Period 11)` | |
| Comparison caption on KPI tiles | Raw period **number** | `vs period 11` | |

> ⚠️ Four different renderings of the same reporting period, and the KPI captions use a bare
> period number where every other surface uses a month name. See §12.4.

### 1.4 Numbers and units

| Context | Rule | Example | Verdict |
|---|---|---|---|
| Days of cash | Whole number, rounded | `62` | |
| Days of cash — Cash dashboard | Whole number **with unit** | `62 days` | |
| Days of cash — Executive dashboard | Whole number, unit in the sub-line | `62` / "days in reserve" | |
| Counts (funds, projects, alerts) | Plain integer | `84` | |
| Unavailable figure | Em dash — never `0`, never `$0` | `—` | |
| Unavailable status | Badge reads `Not available` | | |

### 1.5 Capitalization

The application already has a documented rule for **district-supplied data** (`lib/text.ts`):

> Title Case for names and labels. Reserve ALL CAPS only for abbreviations and codes such as FEFP,
> IDEA, ESSER, FTE, 1000.

This is applied automatically to every fund, function, object, cost centre and project name on the
read path — `GENERAL FUND`, `general fund` and `General Fund` all display as **General Fund**. The
stored value is untouched.

There is **no equivalent rule for our own interface copy**, and the result is mixed:

| Surface | Convention today | Example | Verdict |
|---|---|---|---|
| Page titles (H1) | Title Case | `Executive Dashboard`, `Cash Position` | |
| Sidebar navigation | Title Case | `Fund Balance`, `Chart of Accounts` | |
| Card titles | Sentence case (rendered uppercase by CSS) | `Fund balance trend` | |
| KPI tile labels | Sentence case (rendered uppercase by CSS) | `Total revenues (YTD)` | |
| Table column headers | Sentence case (rendered uppercase by CSS) | `Revenue source`, `Variance %` | |
| Filter dimension names | Title Case | `Fund Type`, `Fund Code` | |
| View By options | Title Case | `Cost Center Type`, `Revenue Code & Name` | |
| Policy setting labels | Title Case | `Revenue Variance — Warning` | |
| "Go to" links | Title Case | `Go to Revenues Dashboard` | |
| "Manage" links | Sentence case | `Manage revenue policies` | |
| Tooltips and body copy | Sentence case | | |

**Decision needed:** a single rule for interface copy. Our recommendation is *sentence case
everywhere except page titles and navigation*, with Title Case retained for named dimensions
(Fund Type, Cost Center Type) because those are labels on the district's own chart of accounts.

### 1.6 Spelling variant

**Decision needed.** The interface currently mixes British and American spellings of the same two
words, sometimes on adjacent elements:

| American (used in) | British (used in) |
|---|---|
| `Budget Utilization — Warning` (policy form)<br>`Budget utilization` (alert title) | `Budget utilisation` (Expenditures KPI)<br>`Utilised` (table column)<br>`Budget utilisation (spend + enc.)` (Executive) |
| `Cost Center Type` (filter, View By)<br>`Cost center type` (column header) | `Cost centre types in their configured order` (tooltip)<br>`Cost centre filters do not apply here.` (notice) |

For a US school-district audience we recommend standardising on **utilization** and **cost center**
throughout. Please confirm.

---

## 2. Status vocabulary and severity model (item b)

### 2.1 The four-rung status ladder

Every status badge on every dashboard uses these four words plus one for "cannot be computed".
Source: `lib/dashboard/status.ts`, `components/dashboard/status-badge.tsx`.

| Rung | Meaning | Colour | Verdict |
|---|---|---|---|
| `Strong` | At or better than the district's target | Green | |
| `Acceptable` | Past the warning bar but short of target | Blue | |
| `Monitor` | Past the warning threshold | Amber | |
| `Action Required` | Past the critical threshold | Red | |
| `Not available` | The figure could not be computed for this period | Grey | |

Badges always render the **word**, never a colour alone. Hovering an `Not available` badge shows a
sentence explaining what data is missing.

**Domain overrides.** Some tables replace the rung word with a domain-specific one:

| Where | Rung | Word shown | Verdict |
|---|---|---|---|
| Expenditures — by-function table | `Action Required` | `Overspent` | |
| Expenditures — by-function table | `Monitor` | `Approaching` | |
| Fund Balance — by-fund table | `Action Required` | `Deficit` | |
| Fund Balance — by-fund table | `Strong` | `Healthy` | |

### 2.2 Alert severity

The catalogue has **two** severities. A third, informational tier exists but is produced by
observations rather than thresholds (§4).

| Severity | Badge word shown on the alert row | Word used in the count strip | Verdict |
|---|---|---|---|
| `CRITICAL` | `Action Required` | `Critical` | |
| `WARNING` | **`Review`** | `Warning` | |
| (observation) | `Informational` | `Informational` | |

> ⚠️ A row labelled **Review** is counted under **Warning** in the summary strip directly beneath
> it. See §12.5.

---

## 3. Alert catalogue — all 24 alerts (item b)

Source: `lib/alerts/catalog.ts`. Placeholders in `{braces}` are filled from the district's own
figures and thresholds. Percentages in alert sentences use **1 decimal place**; money uses the
exact comma-grouped form.

Counts by group are asserted by an automated check: revenue 5, expenditure 8, cash 3, fund balance 8.

### 3.1 Revenue (5)

| # | Title | Severity | Message | Verdict |
|---|---|---|---|---|
| R1 | Revenue below budget | Warning or Critical | `Collections are {5.2}% below budget ({$12,345,678} against {$13,000,000}).` | |
| R2 | Revenue above budget | Warning only¹ | `Collections are {5.2}% above budget ({$…} against {$…}). Worth confirming the budget is current.` | |
| R3 | Forecast revenue below budget | Warning or Critical | `On current pace, year-end revenue lands {3.4}% below budget.` | |
| R4 | Forecast revenue above budget | Warning only | `On current pace, year-end revenue lands {3.4}% above budget.` | |
| R5 | Significant revenue change | Warning | `Revenue {fell\|rose} {15.2}% against last month.` | |

¹ Over-collection never escalates to Critical — it is a valid state to surface, not a failure.

### 3.2 Expenditure (8)

| # | Title | Severity | Message | Verdict |
|---|---|---|---|---|
| E1 | Budget utilization | Warning | `{82.4}% of budget is committed (spend plus encumbrances).` | |
| E2 | Budget utilization critical | Critical | `{96.1}% of budget is committed, at or past your {95}% critical threshold.` | |
| E3 | Budget exceeded | Critical | `Spending has passed the budget: {$…} against {$…}.` | |
| E4 | Negative available budget² | Critical | `Available budget is {($1.2M)} — budget minus spend minus encumbrances is below zero.` | |
| E5 | Encumbrances exceed available budget² | Warning | `Encumbrances of {$…} exceed the {$…} left after spend.` | |
| E6 | Forecast exceeds budget | Warning | `On current pace, year-end spend reaches {$…} against a budget of {$…}.` | |
| E7 | Material forecast variance | Warning or Critical | `Projected year-end spend is {4.2}% off budget.` | |
| E8 | Significant month-over-month increase | Warning or Critical | `Spending jumped {18.3}% against last month.` | |

² Only fires when the corresponding toggle is on in Financial Policies (§5.2).

Alerts E1–E3 are mutually exclusive by design: each band stops where the next begins, so one
condition raises exactly one alert. E4 suppresses E5 for the same reason.

### 3.3 Cash (3)

| # | Title | Severity | Message | Verdict |
|---|---|---|---|---|
| C1 | Days cash on hand | Warning | `{52} days of cash on hand, below the {60}-day threshold.` | |
| C2 | Days cash on hand critical | Critical | `{38} days of cash on hand, below the {45}-day critical threshold.` | |
| C3 | Significant cash decrease | Warning or Critical | `Cash fell {12.4}% against last month.` | |

> The two former "Cash Balance" alerts and the "Forecast Cash" alert were retired along with the
> Cash Forecast Thresholds they read. The district's cash policy is now Days Cash on Hand and Cash
> Decrease only. **Please confirm this is still correct.**

### 3.4 Fund balance (8)

| # | Title | Severity | Message | Verdict |
|---|---|---|---|---|
| F1 | Reserve below target | Warning | `Unassigned reserve is {4.5}%, below the {5}% you aim to hold.` | |
| F2 | Reserve below warning threshold | Warning | `Unassigned reserve is {3.6}%, below your {4}% warning threshold.` | |
| F3 | Reserve critical | Critical | `Unassigned reserve is {2.4}%, below your {3}% critical threshold.` | |
| F4 | Forecast reserve below target | Warning | `Projected year-end reserve is {4.5}%, below your {5}% target.` | |
| F5 | Forecast reserve below warning | Warning | `Projected year-end reserve is {3.6}%, below your {4}% forecast warning.` | |
| F6 | Forecast reserve critical | Critical | `Projected year-end reserve is {2.4}%, below your {3}% forecast critical threshold.` | |
| F7 | Fund balance is falling | Warning | `This year's operations have reduced the fund balance by {$…}.` | |
| F8 | Components exceed the projected balance | Critical | `The projected restricted, committed and assigned components add up to more than the projected balance, which would leave the unassigned reserve negative.` | |

> ⚠️ F1–F6 say **"Unassigned reserve"**; every dashboard KPI and chart says **"Unassigned fund
> balance"**. See §12.2.

---

## 4. Informational observations (item b)

Facts worth noticing with **no threshold behind them** and no severity to escalate. They appear on
the Alerts page under "For awareness" and are counted as `Informational` in every summary strip.
Source: `lib/alerts/engine.ts`.

| Title | Message | Fires when | Verdict |
|---|---|---|---|
| Encumbrances outstanding | `{$4.12M} is committed but not yet paid, and is already counted against available budget.` | Available budget positive and encumbrances > 0 | |
| Year-end projection | `On the current pace, spending reaches {$…} against a budget of {$…}.` | A forecast exists and a budget is set | |
| Fund balance is growing | `This year's operations have added {$…} to the fund balance.` | Change in fund balance is positive | |

There is one further informational row generated on the **Cash dashboard only**:

| Title | Message | Fires when | Verdict |
|---|---|---|---|
| Cash flow trend | `Net cash flow has been negative in {4} of the last {6} months with data.` | More than one negative month in the window | |

> ⚠️ This row is counted in the Cash dashboard's "Cash alerts (N)" heading but **not** in the
> Alerts page's "Cash (N)" heading, so the same period can show different counts on the two
> screens. See §12.6.

---

## 5. Policy settings — labels, help text, validation (item b)

Source: `lib/policies/registry.ts`. These labels appear on the Financial Policies form and, in
shortened form, in the "policy echo" cards beside the figures they judge.

### 5.1 Group headings

| Group | Title | Description | Verdict |
|---|---|---|---|
| Revenue | `Revenues` | `Define when revenue activity should generate alerts.` | |
| Expenditure | `Expenditures` | `Define when spending activity should generate alerts.` | |
| Cash | `Cash Policies` | `Define when cash and liquidity should generate alerts.` | |
| Fund balance | `Fund Balance` | `The reserve level you aim to protect — unassigned fund balance as a share of General Fund revenue.` | |

> Three of the four are a verb phrase; the fourth is a noun phrase. Also, three group titles are
> plain nouns and one is `Cash Policies`.

### 5.2 Settings

| Group / Section | Label | Default | Help text | Verdict |
|---|---|---|---|---|
| **Revenues** — Current Performance | `Revenue Variance — Warning` | 5% | `Actual revenue is off budget by this amount.` | |
| | `Revenue Variance — Critical` | 10% | *(identical to the above)* | |
| Forecast Performance | `Forecast Variance — Warning` | 3% | `Projected year-end revenue is off budget by this amount.` | |
| | `Forecast Variance — Critical` | 5% | *(identical)* | |
| Trend Monitoring | `Month-over-Month Revenue Change` | 15% | `Revenue changes by more than this from the previous month.` | |
| Import Validation | `Flag lines collected above budget on import` | On | `Over-collection is a real state, not an error — this only surfaces it as a warning you can acknowledge.` | |
| **Expenditures** — Current Performance | `Budget Utilization — Warning` | 80% | `Budget is this much used (Actual + Encumbrances).` | |
| | `Budget Utilization — Critical` | 95% | *(identical)* | |
| Spending Trends | `Month-over-Month Increase — Warning` | 15% | `Spending changed by more than this from the previous month.` | |
| | `Month-over-Month Increase — Critical` | 25% | *(identical)* | |
| Forecast Performance | `Forecast Variance — Warning` | 3% | `Projected year-end expenditures are off budget by this amount.` | |
| | `Forecast Variance — Critical` | 5% | *(identical)* | |
| Import Validation | `Flag Budget Overcommitted` | On | `Actual expenditures and encumbrances exceed the remaining available budget.` | |
| | `Flag Spend Above Budget` | On | `Actual expenditures exceed the current budget.` | |
| | `Flag Encumbrances Above Available Budget` | On | `Encumbrances exceed the remaining available budget.` | |
| | `Ignore salary objects for month-over-month variance` | Off | `Exclude salary objects when computing month-over-month spending change.` | |
| *(hidden)* | `Budget exceeded` | 100% | `Spending has passed the budget. Rarely worth moving.` | |
| **Cash Policies** — Current Position | `Days Cash on Hand — Warning` | 60 days | `Alert when available cash falls below this number of operating days.` | |
| | `Days Cash on Hand — Critical` | 45 days | *(identical)* | |
| Trend Monitoring | `Cash Decrease — Warning` | 10% | `Cash decreased by this percentage compared to the previous month.` | |
| | `Cash Decrease — Critical` | 20% | *(identical)* | |
| **Fund Balance** — Reserve Goals | `District Target` | 5% | `What the district strives to maintain for long-term financial stability.` | |
| Compliance Requirements | `Board Policy Minimum` | 3% | `Minimum reserve levels required by board policy and state law.` | |
| | `State Minimum` | 2% | *(identical to Board Policy Minimum)* | |
| Current Position Alerts | `Warning Threshold` | 4% | `Alerts generated from CURRENT fund balance.` | |
| | `Critical Threshold` | 3% | *(identical)* | |
| Forecast Monitoring | `Forecast Warning` | 4% | `Alerts generated from PROJECTED year-end fund balance.` | |
| | `Forecast Critical` | 3% | *(identical)* | |

**Three issues to rule on:**

1. **Every warning/critical pair shares identical help text**, so the form never explains the
   difference between the two. Suggested pattern: append *"This raises a warning."* / *"This
   raises a critical alert."*
2. **`Board Policy Minimum` and `State Minimum` share the same help text** ("required by board
   policy **and** state law"), which describes both and distinguishes neither.
3. **ALL CAPS is used for emphasis** (`CURRENT`, `PROJECTED`) in the fund balance help text, which
   contradicts the application's own rule that ALL CAPS is reserved for abbreviations and codes.
4. **Toggle labels mix Title Case and sentence case** — `Flag Budget Overcommitted` beside
   `Flag lines collected above budget on import`.

### 5.3 Validation messages

| Condition | Message | Verdict |
|---|---|---|
| Not a number | `{Label} must be a number.` | |
| Below the minimum | `{Label} can't be below {0}.` | |
| Above the maximum | `{Label} can't be above {100}.` | |
| Critical set before warning (rising metrics) | `{Label} should be at or above the warning threshold, or the warning never fires first.` | |
| Critical set before warning (falling metrics) | `{Label} should be at or below the warning threshold, or the warning never fires first.` | |

> Uses the contraction `can't`. Confirm whether contractions are acceptable in validation copy.

---

## 6. Global filters, View By / Group By, and drill-down (item a)

### 6.1 The filter bar

One filter set scopes **every card on the page** — there is no per-card filter anywhere in the
product. All dimensions live behind a single **Filters** button.

| Element | Copy | Behaviour | Verdict |
|---|---|---|---|
| Trigger button | `Filters` + a count badge | The badge counts **dimensions narrowed**, not values ticked | |
| Trigger button, mid-navigation | `Applying…` with a spinner | | |
| Panel heading | `Filters` | | |
| Panel action | `Clear all` | Clears the staged draft, not the page | |
| Panel buttons | `Cancel` / `Apply` | `Apply` is disabled until something changes | |
| Dimension rows | `Reporting period`, `Fund Type`, `Fund Code`, then one row per cost-centre category the district uses (`School`, `Department`, …) | | |
| Row summary when nothing picked | `All` | | |
| Row summary, one value | The value's own label | | |
| Row summary, several values | `{N} selected` | | |
| Row summary, types only | `{N} school types` | | |
| Search box | `Search {dimension}…` | Matches on code **and** name | |
| Options with no data this period | Greyed, with the hint `No data this period` | Still selectable — an honest empty card beats a vanishing option | |
| Option list actions | `Select all` / `Clear` | `Select all` takes only what is **visible** after a search term | |
| Option list count | `{N} selected` / `No selected` | | |
| Empty search result | `Nothing matches that.` | | |
| Empty dimension | `Nothing to choose from.` | | |

> ⚠️ `No selected` is grammatically wrong when nothing is ticked. Suggested: `None selected`.

### 6.2 The applied-slice line (prints with the page)

| Element | Copy | Verdict |
|---|---|---|
| Label | `Showing` | |
| Period chip | `May 2026 · FY 2025-26` | |
| Filter chip | `{Dimension}: {value}, {value} +{N}` | |
| No filter applied | `All funds` | |
| Chip remove control | `×`, labelled `Remove the {Dimension} filter` | |
| Reset link | `Clear filters` → `Clearing…` while applying | |
| Screen-reader announcement | `Applying filters, loading the dashboard.` | |

### 6.3 Saved views

| Element | Copy | Verdict |
|---|---|---|
| Trigger | `Views` → `Applying…` while applying | |
| Menu heading | `Saved views · shared with your district` | |
| Empty state | `No saved views yet. Apply some filters and save them here — everyone in your district will see them.` | |
| Save affordance | `Save current filters as a view` (disabled with tooltip `Apply a filter first.`) | |
| Name field placeholder | `Name this view…` | |
| Save button | `Save` → `Saving…` | |
| Delete confirmation | `Delete` / `No` | |

**Behaviour to confirm:** a saved view stores **filters only, never the period**. Applying one
keeps the reader on the period they are already on. Applying a view **replaces** the current
filters rather than merging with them. Views are district-wide — deleting one removes it for
colleagues.

### 6.4 View By / Group By

One selector per card, labelled `View by`, writing a `groupBy` URL parameter. The first option in
each list is the default and is what the card showed before the selector existed.

| Dashboard | Card | Options (default first) | Verdict |
|---|---|---|---|
| Revenues | Revenue by … (YTD) | `Revenue Type`, `Revenue Code & Name`, `Project / Grant` | |
| Expenditures | Expenditures by … (YTD) | `Object`, `Function`, `Cost Center Type`, `Project` | |
| Cash | Cash composition | `Cash Category`, `Fund` | |
| Fund Balance | Fund balance composition | `Classification`, `Fund` | |

**Behaviour to confirm:**
- The **KPI row is never re-grouped.** Total revenue, total spending, utilization and available
  budget are the same figures however the detail is sliced, so the headline never moves when the
  reader changes perspective.
- The selector is **hidden in print**; the card's subtitle names the active dimension instead.
- `Bank Account` was removed from the Cash options per the M6 note — there is no bank-account
  column anywhere in the import or the schema, so the control now offers only what it can draw.
- Grant revenue is grouped by the **Project / Grant** column on the revenue detail. It is labelled
  that way so nobody reads it as a grant registry (a V2 module).

### 6.5 Drill-down behaviour

| From | Click target | Lands on | Verdict |
|---|---|---|---|
| Executive KPI tile | The whole card (`Go to Dashboard →`) | The named dashboard, **carrying the current filters and period** | |
| Card footer link | `Go to … →` | The named dashboard, carrying the scope | |
| Card footer link | `View … Details →` | The underlying records browser for this period | |
| Top Positive/Negative Variances row | The fund tag (`1000 — General Fund`) | The **same** dashboard, narrowed to that fund | |
| Alert row | Anywhere on the row | The Alerts page, carrying the scope | |
| Alert "Where" chip | The fund tag | The **same** page, narrowed to that fund | |
| Key Insight row | Anywhere on the row | The dashboard that answers it | |
| Sidebar link | Any dashboard | Carries the current filters across | |

**Behaviour to confirm:** drilling into a fund from a variance row clears any Fund Type selection
(otherwise the cascade would prune the drill-down away), but **keeps** cost-centre selections.

---

## 7. Navigation, page titles and calls to action (items c, f)

### 7.1 Sidebar

| Group | Items | Verdict |
|---|---|---|
| `Main` | `Executive Dashboard`, `Revenues`, `Expenditures`, `Fund Balance`, `Cash Position`, `Alerts` | |
| `Data Management` | `Upload Data`, `Browse Data`, `Version Management`, `Chart of Accounts` | |
| `Administration` | `District Settings`, `Financial Policies`, `Users`, `Audit Log` | |

Workspace card sub-line: `Finance workspace`, or `External · {access level}` for external users.

### 7.2 Page titles and descriptions

| Route | Title | Description | Verdict |
|---|---|---|---|
| `/dashboard` | `Executive Dashboard` | `Financial summary and key indicators of fiscal health.` | |
| `/revenues` | `Revenue Dashboard` | `Track revenue performance against budget.` | |
| `/expenditures` | `Expenditures Dashboard` | `Track spending performance against budget.` | |
| `/cash` | `Cash Position` | `Monitor cash availability, liquidity and cash flow.` | |
| `/fund-balance` | `Fund Balance` | `Track fund balance, reserve levels, and plan for the future.` | |
| `/alerts` | `Alerts` | `Everything needing attention this period, judged against your own thresholds.` | |

> ⚠️ Sidebar says **Revenues**; the page is titled **Revenue Dashboard**; the link to it says
> **Go to Revenues Dashboard**. Three names for one screen. Also note `Cash Position` and
> `Fund Balance` carry no "Dashboard" suffix while the other three do. See §12.1.

### 7.3 Fund Balance tabs

`Current Position` · `Forecasting & Planning` · `Policies` · `Alerts` *(with a count badge)*

### 7.4 Calls to action

Consolidated into three families in `lib/dashboard/cta.ts` so a link and the thing it opens are
never called two different things.

| Family | Copy | Used for | Verdict |
|---|---|---|---|
| Go to | `Go to Executive Dashboard` | Another dashboard | |
| | `Go to Revenues Dashboard` | | |
| | `Go to Expenditures Dashboard` | | |
| | `Go to Fund Balance Dashboard` | | |
| | `Go to Cash Position Dashboard` | | |
| | `Go to Alerts Dashboard` | | |
| | `Go to Forecasting & Planning` | A Fund Balance tab | |
| | `Go to Financial Policies` | A module page, not a dashboard | |
| | `Go to Chart of Accounts` | | |
| Short form (KPI tiles) | `Go to Dashboard` | The whole tile is the link; the tile's label already names the module | |
| View details | `View Revenue Details` | Drill-down to the committed records | |
| | `View Expenditure Details` | | |
| | `View Cash Position Details` | | |
| | `View Version History` | | |
| Manage (permission-gated) | `Manage policies` | Appears only for users who can edit | |
| | `Manage revenue policies` | | |
| | `Manage expenditure policies` | | |
| | `Manage fund balance policies` | | |

> ⚠️ `Go to Alerts Dashboard` — the Alerts screen is titled just `Alerts` and is listed in the
> sidebar as `Alerts`, not as a dashboard.

---

## 8. Dashboard copy, screen by screen (item c)

### 8.1 Executive Dashboard

**KPI row (6 tiles)**

| Label | Sub-line | Trend / status note | Verdict |
|---|---|---|---|
| `Total revenues (YTD)` | `{82.4}% of full-year budget` / `No revenue budget uploaded` | `{+3.21%}` · `vs budget to date` | |
| `Total expenditures (YTD)` | `{78.1}% of full-year budget` / `No expenditure budget uploaded` | `{82.40%} committed` | |
| `Unassigned fund balance %` | `of projected General Fund revenue` / `no General Fund identified` | `{Strong}` · `Target ≥ {5.00}%` | |
| `Days of operating cash` | `days in reserve` | `{Monitor}` · `Policy ≥ {60} days` | |
| `Available budget` | `budget less spend and encumbrances` | `Remaining` / `Overcommitted` | |
| `Alerts` | `require attention` | `{2} critical` / `{3} warning` / `All clear` | |

Unavailable-figure tooltips:
- Reserve: `Needs a fund typed General, an opening fund balance and an adopted expenditure budget.`
- Days of cash: `Needs a cash position file and an adopted expenditure budget.`

**Cards**

| Title | Subtitle | Tooltip (ⓘ) | Footer | Verdict |
|---|---|---|---|---|
| `Revenues vs budget (YTD)` | `Five largest sources, against the budget expected by now` | `Status is judged against your revenue variance policy: warning at {5.00}%, critical at {10.00}%.` | `Go to Revenues Dashboard` | |
| `Expenditures vs budget (YTD)` | `By object, against the budget expected by now` | `Status is judged against your expenditure variance policy: warning at {3.00}%, critical at {5.00}%.` | `Go to Expenditures Dashboard` | |
| `Fund balance trend` | *(the applied filter slice)* | — | `Go to Fund Balance Dashboard`, note `All amounts are unaudited` | |
| `Cash position` | `As of {May 2026} (FY {2025-26})` | — | `Go to Cash Position Dashboard` | |
| `Financial health summary` | `Key indicators compared to policy targets` | — | `Go to Financial Policies` | |
| `Key insights` | — | — | `Go to Alerts Dashboard` | |
| `Alert summary ({N})` | — | — | `Go to Alerts Dashboard` | |

Badge on Fund balance trend when not viewing the General Fund:
`Policy targets apply to the General Fund only`

**Financial health summary — indicator names**

| Indicator | Target column | Verdict |
|---|---|---|
| `Unassigned fund balance %` | `≥ {5.00}%` | |
| `Days of operating cash` | `≥ {60} days` | |
| `Budget utilisation (spend + enc.)` | `≤ {80.00}%` | |
| `Revenue variance (YTD)` | `± {5.00}%` | |
| `Expenditure variance (YTD)` | `± {3.00}%` | |

Column headers: `Indicator` · `Current` · `Target` · `Status` · `Trend`

**Fund balance metric strip** — General Fund selected: `Ending fund balance`, `Unassigned fund
balance`, `Status`, `Policy target`, `Statutory minimum`. Any other selection: `Ending fund
balance`, `Total fund balance`, `Month over month change`, `Opening balance`.

> ⚠️ `Statutory minimum` is populated from the **Board Policy Minimum** setting, not the State
> Minimum. See §12.7 — this is the most substantive issue in the document.

**Cash position strip** — `Beginning cash`, `Receipts (YTD)`, `Disbursements (YTD)`,
`Net cash flow`, `Ending cash`, then `Cash balance`, `Avg monthly spend`,
`Cash % of expenditures`, `Trend`.

Supporting notes: `Needs spending detail`, `Needs an earlier period`, `vs prior period`.

**Key insight sentence (General Fund):**
`Unassigned fund balance is {4.50%}, which is {above|below} the {3.00}% statutory minimum and
{at or above|below} the district target of {5.00}%.`

**Footer note when the period has no committed detail:**
`This period has no committed detail data. The figures above are drawn from the periods that do,
and the cards that need this period show as unavailable.`

### 8.2 Revenue Dashboard

**KPI row (6 tiles)**

| Label | Caption | Sub-line | Tooltip | Verdict |
|---|---|---|---|---|
| `Total revenues` | `Year to date` | `{82.4}% of full-year budget` | — | |
| `Revenue variance` | `Year to date` | `against the budget expected by now` | `Actual collections against the budget expected by now, pro-rated across the year.` | |
| `Remaining to collect` | `Current budget less collections` | `of {$X} budgeted` / `collected above the full-year budget` | `Current budget − actual revenue year to date. Not a forecast: no growth or seasonality is assumed.` | |
| `Month over month change` | `vs period {10}` / `no earlier period` | `collected this period` | — | |
| `Revenue status` | `Year to date` | `Within policy (± {5.00}%)` / `Outside policy (± {5.00}%)` / `needs a revenue budget for the year` | — | |
| `Days in fiscal year` | `Through {May 2026}` | `of {365} days` | — | |

> ⚠️ `Days in fiscal year` shows **days elapsed**, not days in the year. Suggested: `Days elapsed`.

**Cards**

| Title | Subtitle | Tooltip | Verdict |
|---|---|---|---|
| `Revenues — budget vs actual` | `Year to date through {May 2026}` | `Actual collections against the budget expected by now, with the full-year budget drawn as a reference.` | |
| `Revenue by major source` | — | `Ranked by budget. Variance is measured against the budget expected by now.` | |
| `Revenue policy` | `Your own thresholds` | `Every revenue alert and status badge on this page is judged against these.` | |
| `Top positive variances` | — | — | |
| `Revenue variance trend` | `Actual against the budget expected by each month` | `A bar above the line means collections ran ahead of the pro-rated budget that month.` | |
| `Revenue by category (YTD)` | `Share of collections by revenue type` | `The same categories the forecast projects by, so a forecast and an actual compare without a translation table between them.` | |
| `Revenue by code and name (YTD)` | `Share of collections by revenue source` | `The district's own revenue source codes, largest first. The full list with variance and status is in the table above.` | |
| `Revenue by project / grant (YTD)` | `The Project / Grant column on the revenue detail` | `Grant revenue reaches the platform tagged in the required Project / Grant column, against the district's unified project master. That is what this groups by — the Grants Activity module itself is a V2 addition.` | |
| `Top negative variances` | — | — | |
| `Revenue alerts ({N})` | — | — | |

**Table columns:** `Revenue source` · `Budget (full year)` · `Actual (YTD)` · `% of budget` ·
`Variance $` · `Variance %` · `Status`. Total row: `Total revenues`.

**Chart series labels:** `Actual (YTD)`, `Budget (YTD)`, `Budget (full year)`.

**Metric strip:** `Actual (YTD)`, `Budget (YTD)`, `Variance (YTD)`, `Remaining to collect`
(note: `over-collected` / `current budget less actual`).

**Policy echo rows:** `Variance — warning`, `Variance — critical`, `Forecast — warning`,
`Forecast — critical`, `Month-over-month change`.

**Empty list copy:** `Nothing is running ahead of budget.` / `Nothing is running behind budget.` /
`No revenue thresholds have been crossed this period.`

**Footer:** `Revenue figures are drawn from the detail file committed for this period. Remaining to
collect is current budget less actual revenue — it assumes no growth and is not a forecast. Adjust
the thresholds above to change when these alerts fire.`

### 8.3 Expenditures Dashboard

**KPI row (6 tiles)**

| Label | Caption | Sub-line | Verdict |
|---|---|---|---|
| `Total expenditures` | `Year to date` | `{78.1}% of full-year budget` | |
| `Budget utilisation` | `Spend plus encumbrances` | `Warning at {80.00}% · critical at {95.00}%` | |
| `Available budget` | `Budget less spend and encumbrances` | `of {$X} budgeted` | |
| `Encumbrances` | `Committed, not yet spent` | `purchase orders and contracts outstanding` | |
| `Month over month change` | `vs period {10}` / `no earlier period` | `spent this period` | |
| `Expenditure status` | `Year to date · {305} of {365} days` | `{−2.10%} against the budget expected by now` / `needs an expenditure budget for the year` | |

**Cards**

| Title | Subtitle | Tooltip | Verdict |
|---|---|---|---|
| `Expenditures — budget vs actual` | `Year to date through {May 2026}` | `Actual spending against the budget expected by now, with the full-year budget drawn as a reference.` | |
| `Expenditures by object (YTD)` | `Salaries, benefits, services, supplies and capital` | `Object types in chart-of-accounts order, not by size, so the list reads the same every month.` | |
| `Expenditures by function (YTD)` (View By card) | `Largest first — the full list, in code order, is below` | `The biggest spending functions by budget, with the remainder folded into Other. The complete table follows in Function Type Code order.` | |
| `Expenditures by cost center type (YTD)` | `Schools, departments and operations` | `Cost centre types in their configured order. Rows whose cost centre column was left blank are shown as No Cost Center Type rather than dropped.` | |
| `Expenditures by project (YTD)` | `The Project / Grant column on the expenditure detail` | `The largest projects by budget, with the remainder folded into Other. Grant-funded spending arrives tagged here.` | |
| `Expenditure policy` | `Your own thresholds` | `Every expenditure alert and status badge on this page is judged against these.` | |
| `Top positive variances` | `Spending ahead of pace` | — | |
| `Budget utilisation trend` | `Spend plus encumbrances, against your thresholds` | — | |
| `Expenditures by function (YTD)` (reference table) | `In Function Type Code order` | `A tinted row is overspent or past its utilisation ceiling. An amber row is approaching it.` | |
| `Top negative variances` | `Spending behind pace` | — | |
| `Expenditure alerts ({N})` | — | — | |

> ⚠️ On Revenues, "Top positive variances" is good news. On Expenditures it means *spending ahead
> of pace* and the figures are coloured red. The same card title carries opposite meanings.
> Suggested: `Largest overspends` / `Largest underspends`. See §12.8.

**Table columns:** `Function` · `Budget` · `Actual (YTD)` · `Encumbered` · `Available` ·
`Utilised` · `Status`. Total row: `Total expenditures`.

**Chart threshold labels:** `Warning {80}%`, `Critical {95}%`.

**Policy echo rows:** `Budget utilisation — warning`, `Budget utilisation — critical`,
`Variance — warning`, `Variance — critical`, `Month-over-month — warning`,
`Month-over-month — critical`.

**Empty copy:** `No spending is tagged by {function} for this period.` /
`No expenditure thresholds have been crossed this period.`

**Footer:** `Adjust your growth assumptions to see how changes in spending flow through to fund
balance and reserves over the next three years.` → `Go to Forecasting & Planning`

### 8.4 Cash Position

**KPI row (6 tiles)**

| Label | Caption | Sub-line | Verdict |
|---|---|---|---|
| `Cash balance` | *(fund name or `All funds`)* | `vs period {10}` / `no earlier period` | |
| `Days cash on hand` | *(fund name or `All funds`)* | `of operating cost covered` | |
| `Net cash flow (MTD)` | `{May 2026}` | `Receipts {$X} · Paid {$Y}` | |
| `Cash receipts (MTD)` | `Collected this period` | `into the district's accounts` | |
| `Cash disbursements (MTD)` | `Paid out this period` | `out of the district's accounts` | |
| `Cash status` | *(fund name or `All funds`)* | `Policy ≥ {60} days · critical below {45}` | |

Unavailable tooltips: `No cash position file was committed for this period.` /
`Needs a cash file and an adopted expenditure budget.`
Delta words: `Inflow` / `Outflow`.

**Cards**

| Title | Subtitle | Tooltip | Verdict |
|---|---|---|---|
| `Cash balance trend` | *(fund or `All funds`)* | — | |
| `Cash balance by fund` | *(fund or `All funds`)* | — | |
| `Cash health` | *(fund or `All funds`)* | `Days cash on hand = cash balance ÷ (adopted expenditure budget ÷ 365).` | |
| `Monthly cash summary` | `{May 2026} · {All funds}` | — | |
| `Cash alerts ({N})` | — | — | |
| `Cash composition` | `By fund · {all funds}` / `By cash category · {all funds}` | `Where the balance is held, as reported on the cash file.` | |

**Cash health rows:** `Status` · `Target (board policy)` · `Critical (board policy)` ·
`Current vs target` (shown as `+8 days` / `−8 days`).

**Trend metric strip:** `Period high`, `Period low`, `Average balance`, `Volatility`
(note: `over {6} months` / `needs 3 months`).

**Monthly cash summary tiles:** `Beginning cash balance`, `Cash receipts (MTD)`,
`Cash disbursements (MTD)`, `Net cash flow (MTD)`, `Ending cash balance`.

**By-fund table columns:** `Fund` · `Ending cash balance` · `% of total`. Total: `Total all funds`.

**Cash category slices:** `Operating accounts`, `Investment accounts`, `Restricted accounts`,
`Other`.

**Chart series:** `Ending cash balance`, `30-day projection` (dashed).

**Key insight:** `{All funds} cash {increased|decreased} {$2.1M} ({5.32}%) from {period 10} to
{May 2026}, ending at {$44.8M}. The district currently has {62} days of cash on hand, which is
{at or above|below} the board target of {60} days, and sits in {Strong} status.`

**Empty copy:** `No cash position was committed for this period.` /
`This period's cash file did not break the balance down by account type.` /
`No cash thresholds have been crossed this period.`

**Footer:** `Cash balances are unaudited and reflect the file committed for {May 2026}. The 30-day
projection is straight-lined from recent months and no alert reads it.`

### 8.5 Fund Balance — Current Position

**KPI row (5 tiles)**

| Label | Caption | Sub-line | Verdict |
|---|---|---|---|
| `Total fund balance` | *(fund or `All funds`)* | `vs period {10}` / `no earlier period` | |
| `Change from prior month` | `Since period {10}` / `No earlier period` | `movement in total fund balance` | |
| `Unassigned fund balance` | `{General Fund} only` | `the reserve a board asks about` | |
| `Projected unassigned %` | `{General Fund} only` | `of projected General Fund revenue` | |
| `Reserve status` | `{General Fund} only` | `Policy range: {3.00}% – {5.00}%` | |

Status notes: `Target ≥ {5.00}%`, `Warning below {4.00}%`.
Unavailable tooltips: `Needs an opening fund balance for the year.` / `Needs a fund typed General,
an opening fund balance and an adopted expenditure budget.`

**Cards**

| Title | Subtitle | Tooltip | Verdict |
|---|---|---|---|
| `Fund balance by fund` | — | `Unassigned fund balance and its percentage apply to the General Fund only. Other funds are shown with their primary fund balance classification.` | |
| `Fund balance trend` | *(fund or `All funds`)* | — | |
| `Fund balance %` | `Policy benchmark` | `The bands are your own thresholds, so this strip and the badge above it cannot disagree.` | |
| `Fund balance waterfall` | `Components do not reconcile to the ending balance` *(only when they don't)* | `Beginning balance, this year's movements, and where the balance now stands.` | |
| `Fund balance composition` | `By classification` / `By fund · {all funds}` | See below | |

Composition tooltips:
- By fund: `Each fund's ending balance as a share of the total. Funds in deficit are listed in the table above rather than drawn here — a share bar cannot show a negative slice.`
- By classification: `Components are as reported on the opening fund balance; unassigned moves with the year's activity.`

**Table columns:** `Fund` · `Ending fund balance` · `Primary classification` · `Status`.
Total row: `Total all funds`.

**Waterfall steps:** `Beginning` · `Operating revenue` · `Transfers in` · `Other financing` ·
`Operating spend` · `Transfers out` · `Ending`.

**Classification names:** `Nonspendable`, `Restricted`, `Committed`, `Assigned`, `Unassigned`.

**Corrections link:** `A fund's balance can be corrected from Corrections.`

**Reconciliation warning:** `The movements shown do not add up to the ending balance. This usually
means a period is missing from the year.`

**Empty copy:** `No fund has a committed opening balance for this year.` /
`No fund has a positive ending balance for this period.` /
`No opening fund balance has been committed for this year.`

**Footer:** `Want to see the future? Build a three-year projection from your own growth assumptions
and see how reserves hold up.` → `Go to Forecasting & Planning`

### 8.6 Fund Balance — Policies tab

| Element | Copy | Verdict |
|---|---|---|
| Card | `Reserve goals` — `What the district aims to hold, and what it is required to hold.` | |
| Rows | `District target` (`What the district strives to maintain for long-term stability.`), `Board policy minimum` (`Required by board policy.`), `State minimum` (`Required by state law.`) | |
| Card | `Alert thresholds` — `When the platform raises a warning or a critical alert.` | |
| Rows | `Current position — warning` (`From the reserve as it stands today.`), `Current position — critical`, `Forecast — warning` (`From the projected year-end reserve.`), `Forecast — critical` | |
| Card | `Where you stand` — subtitle `Target ≥ {5}% · warning below {4}% · critical below {3}%` | |
| | Tooltip: `The bands are your own thresholds — the same ones every badge and alert on these dashboards reads.` | |
| Benchmark caption | `Projected unassigned fund balance as a share of projected General Fund revenue.` | |

> Note that **this tab separates Board Policy Minimum and State Minimum correctly**, while the
> Current Position tab and the Executive dashboard label the board figure "statutory minimum".

### 8.7 Fund Balance — Alerts tab

| Element | Copy | Verdict |
|---|---|---|
| Card | `Current position` — `Raised from the reserve as it stands` | |
| Empty | `The reserve is within every threshold you have set.` | |
| Card | `Forecast` — `Raised from the projected year-end reserve` | |
| Empty | `The projected reserve stays within your thresholds.` | |

### 8.8 Alerts page

| Element | Copy | Verdict |
|---|---|---|
| Card | `Summary` | |
| Card | `For awareness` — `Facts worth noticing, with no threshold behind them` | |
| Empty | `Nothing else of note this period.` | |
| Group cards | `Revenue ({N})`, `Expenditure ({N})`, `Cash ({N})`, `Fund balance ({N})` | |
| Group empty | `No {revenue} thresholds have been crossed.` | |
| Summary empty | `No thresholds have been crossed this period.` | |
| Count strip | `Critical` · `Warning` · `Informational` | |
| Alert row "where" label | `Where` | |
| Footer | `Alerts are evaluated for {May 2026} only. A threshold crossed in an earlier month appears on that month, not here — use the period selector to look back.` | |

> Group titles are singular (`Revenue`, `Expenditure`) while the sidebar and CTAs are plural
> (`Revenues`, `Expenditures`).

### 8.9 Key Insights (Executive dashboard)

Generated from the district's own figures, ranked worst-news-first, maximum three.

| Insight | Headline | Detail line | Verdict |
|---|---|---|---|
| Revenue pace | `Revenues are {5.21}% {above\|below} budget year to date.` | `Led by {Source A} and {Source B}. Collections are trending {above\|below} expected levels.` | |
| Available budget | `Available budget is {$12.4M} ({18}% of full-year budget).` / `Budget is overcommitted by {$1.2M}.` | `Sufficient remaining budget for planned activities.` / `Spending plus encumbrances exceeds the adopted budget.` | |
| Utilization | `{82.40}% of the expenditure budget is committed.` | `At or past your {80}% warning threshold, driven by {A} and {B}.` / `Within your {80}% warning threshold.` | |
| Reserve | `Unassigned fund balance is below policy target.` / `Unassigned fund balance is {5.40}%, at or above policy target.` | `{4.50}% against a {5.00}% target. Action needed to rebuild reserves.` | |
| Cash | `Days of operating cash stands at {52}.` | `Below your {60}-day policy minimum.` | |

Empty state: `Nothing stands out this period. Insights appear once there is enough committed data
to compare against your policies.`

---

## 9. Data display rules (item e)

### 9.1 Fund Code / Name on the All Funds view — **implemented as requested**

> *"I recommend displaying the Fund Code/Name so users know where the variance originated and can
> quickly determine where to drill down … This behavior should automatically adjust when a single
> fund is selected."*

| Surface | Behaviour on All Funds | Behaviour with one fund selected | Verdict |
|---|---|---|---|
| Top Positive / Negative Variances (Revenues) | Each row carries a fund tag, e.g. `1000 — General Fund`, linking to this page scoped to that fund | Tag is hidden | |
| Top Positive / Negative Variances (Expenditures) | Same | Tag is hidden | |
| Alert rows (all dashboards) | A `Where` line lists the funds carrying most of the condition, each with the amount, each a link | `Where` line is hidden | |
| Cash balance by fund | Always shows the fund column (it is a directory) | Still shows every fund | |
| Fund balance by fund | Always shows the fund column | Still shows every fund | |
| Cash / Fund balance **composition** | Slices are every fund | Slices narrow to the selected fund | |

Movers are computed at **fund × account grain** on the All Funds view, so a row names one fund's
account rather than netting two funds moving in opposite directions.

> One behaviour to confirm: the tags hide only when **exactly one** fund is selected. With two or
> more selected they remain, which we believe is correct.

### 9.2 Codes and names

Per the client's recommendation, dimensions display as `1000 — General Fund` by default, with a
per-reader preference on the account page:

| Setting | Label | Example | Verdict |
|---|---|---|---|
| Default | `Codes + Names` | `1000 — General Fund` | |
| | `Codes Only` | `1000` | |
| | `Names Only` | `General Fund` | |

**Rules in force:**
- Separator is an em dash with spaces: `1000 — General Fund`.
- Codes are **never re-cased** — `3xx` stays `3xx`.
- Names are title-cased on display; the district's stored text is untouched.
- A dimension carrying only one of the two renders that one whichever mode is set (a project with
  no number is never blanked by "Codes Only").
- Labels truncate at roughly 32 characters **or the column width, whichever is narrower**, with an
  ellipsis. Hovering always shows the **full Code — Name**, even in Codes Only mode.
- The preference is per-browser, does not travel in shared links, saved views or exports, and does
  not change any figure.

### 9.3 Fund-level-only notices

Cash and fund balances are stored per fund and carry no cost centre. When a cost-centre filter is
applied:

| Surface | Copy | Verdict |
|---|---|---|
| Card badge (Executive) | `Fund level` — tooltip: `{Fund balance is} tracked per fund. Cost centre filters do not apply to it.` | |
| Page notice (Cash, Fund Balance) | `Cost centre filters do not apply here.` `{Cash position} is tracked per fund, so these figures honour the Fund Type and Fund Code filters in full and are shown at fund level regardless of the cost centre selection.` | |

### 9.4 Period substitution notice

When the URL names a period with no committed data:

`{March 2026}` **has no committed data. Showing** `{May 2026}` **instead.**

The platform never substitutes silently on a dashboard.

### 9.5 "Data as of"

`🗓 Data as of {May 31, 2026} · {Fund Type: General · Fund Code: 1000 — General Fund}`

The date is the **last day of the scoped period**, not the upload timestamp.

---

## 10. Exports (item f)

### 10.1 Export menu

| Element | Copy | Verdict |
|---|---|---|
| Trigger | `Export` | |
| Heading | `One-page summary` | |
| Item | `One-page landscape PDF` — `For board meetings and leadership.` | |
| Heading | `Detailed export` | |
| Item | `Excel workbook (.xlsx)` | |
| Item | `CSV` | |
| Item | `Print this dashboard (PDF)` — `Multi-page, everything on screen.` | |

### 10.2 One-page summary sheets

| Dashboard | Sheet title | Verdict |
|---|---|---|
| Executive | `Executive Summary` | |
| Revenues | `Revenue Summary` | |
| Expenditures | `Expenditure Summary` | |
| Cash | `Cash Position Summary` | |
| Fund Balance | `Fund Balance Summary` | |

The printed header carries the district name, the applied filter slice and the "as of" date, so a
page in a board packet always says which slice it is showing.

Print-sheet table note: `Largest {N} by budget.` Print-sheet card titles: `Largest variances`
(`Against budget to date`), `Key insight` (`Cash movement and coverage`).

### 10.3 Workbook sheets and columns

| Sheet | Columns | Verdict |
|---|---|---|
| `Monthly trend` | `Period`, `Revenue budget`, `Revenue MTD`, `Revenue YTD`, `Expenditure budget`, `Expenditure MTD`, `Expenditure YTD`, `Encumbrances`, `Ending cash`, `Fund balance`, `Unassigned` | |
| | Caption: `One row per reporting period. Blank rows are periods with no committed data.` | |
| `Revenue by source` | `Code`, `Name`, `Budget (full year)`, `Actual (YTD)`, `Encumbrances`, `Available`, `% of budget`, `Budget to date`, `Variance to date`, `Variance %` | |
| `Revenue by category` | *(same)* | |
| `Spending by function` | *(same)* | |
| `Spending by object` | *(same)* | |
| `By fund` | `Code`, `Fund`, `Type`, `Revenue (YTD)`, `Spending (YTD)`, `Fund balance`, `Ending cash` | |
| `Alerts` | `Severity`, `Group`, `Alert`, `Detail` — caption `Evaluated for {May 2026} against this district's own thresholds.` | |

> ⚠️ Two vocabulary mismatches with the dashboards:
> - Sheets say **Spending**; the dashboards say **Expenditures**.
> - Columns say **Budget to date** / **Variance to date**; the dashboards were renamed to
>   **Budget (YTD)** / **Variance (YTD)** at the client's request. See §12.9.

**Rule to confirm:** exported numbers are **bare** — `1234.56`, never `$1,234.56` — so a file can
be edited in Excel and read straight back in. Severity in the Alerts sheet is exported as the raw
`WARNING` / `CRITICAL` / `INFORMATIONAL`, not as the on-screen badge word.

---

## 11. Loading, empty, error and notification states (items c, f)

### 11.1 Loading

| Where | Behaviour / copy | Verdict |
|---|---|---|
| Page navigation | Skeleton matching the real layout — header, KPI row, then cards. Screen readers hear `Loading…` | |
| Filters button | `Applying…` with a spinner | |
| Clear filters | `Clearing…` with a spinner | |
| Views button | `Applying…` with a spinner | |
| Save a view | `Saving…` | |
| Main column during a filter change | Dims until the new render lands | |
| Screen-reader announcement | `Applying filters, loading the dashboard.` | |

### 11.2 Empty states

Never a page of zeros — a grid of `$0` tiles reads as "your district has no money".

| Screen | Title | Body | Action | Verdict |
|---|---|---|---|---|
| Executive | `No financial data yet` | `Once a reporting period has been uploaded and committed, this dashboard shows your district's revenues, spending, reserves and cash position against the thresholds you have set.` | `Upload data` | |
| Revenues | `No revenue data yet` | `Upload a revenue detail file for a reporting period and this dashboard will show collections against budget, by source and by category.` | `Upload revenue detail` | |
| Revenues (period has none) | `No revenue detail for {May 2026}` | `Other periods may have data — use the period selector, or upload this one.` | `Upload revenue detail` | |
| Expenditures | `No expenditure data yet` | `Upload an expenditure detail file and this dashboard will show spending, encumbrances and available budget by function and object.` | `Upload expenditure detail` | |
| Expenditures (period has none) | `No expenditure detail for {May 2026}` | *(as above)* | `Upload expenditure detail` | |
| Cash | `No cash data yet` | `Upload a cash position file and this dashboard will show balances by fund, days of cash on hand and month-to-month flow.` | `Upload cash position` | |
| Fund Balance | `No fund balance yet` | `Fund balance is derived from your opening balance plus the year's revenue and spending. Upload an opening fund balance and a monthly detail file to see it.` | `Upload data` | |
| Alerts | `No data to monitor yet` | `Alerts are raised from committed data against the thresholds you have set. Upload a reporting period to begin.` | `Upload data` | |

### 11.3 In-card empty copy

`Nothing to show for this period yet.` · `No material variances.` ·
`Nothing needs attention in this period.` · `Nothing is materially off budget.` ·
`Nothing stands out this period.` · `Nothing matches that.` · `Nothing to choose from.`

### 11.4 Notifications

The only in-app notification today is the **pending access request** badge in the header, labelled
`pending access request`. There is no email or push notification surface in the MVP.

---

## 12. Inconsistencies and open questions requiring a ruling

Ranked by how visible each is to a district user.

### 12.1 One screen, three names

| Surface | Name |
|---|---|
| Sidebar | `Revenues` |
| Page title | `Revenue Dashboard` |
| Link from other pages | `Go to Revenues Dashboard` |
| Alerts page group | `Revenue` |

Also: `Cash Position` and `Fund Balance` page titles carry no "Dashboard" suffix while
`Executive Dashboard`, `Revenue Dashboard` and `Expenditures Dashboard` do — yet the links to all
five say "… Dashboard".

**Proposed:** pick one noun per module (`Revenues`) and use it in the sidebar, the H1, the CTA and
the alert group. Drop or add the "Dashboard" suffix consistently.

### 12.2 "Reserve" vs "Unassigned fund balance"

The same measure is called four things:

| Surface | Wording |
|---|---|
| KPI tiles | `Unassigned fund balance %` |
| KPI tile | `Reserve status` |
| Card title | `Fund balance %` |
| Alert titles F1–F6 | `Reserve below target`, `Reserve critical`, … |
| Alert messages F1–F3 | `Unassigned reserve is 4.5%…` |
| Policy section | `Reserve Goals` |

**Proposed:** `Unassigned fund balance` for the dollar figure, `Unassigned fund balance %` for the
ratio, and `reserve` only as informal prose inside a sentence.

### 12.3 Percent decimals disagree across surfaces

The same reserve percentage renders as `3.5%` in an alert, `3.50%` in a KPI tile and in a Key
Insight, and `3.5%` again in a share bar.

**Proposed:** 2 decimal places for any figure compared against a policy threshold (so it can be
read against `3.00%`), 1 decimal place for shares of a total. Apply that rule to alert sentences
too, which currently use 1.

### 12.4 Period is written four ways, and KPI captions use a raw number

| Surface | Rendering |
|---|---|
| Dashboard label | `May 2026 (FY 2025-26)` |
| Filters panel | `May 2026 · FY 2025-26` |
| Upload screen | `May (Period 11)` |
| **KPI comparison captions** | **`vs period 10`** |

The last is the problem: a tile reads `vs period 10` while every other element on the same screen
names months. This appears on Revenues, Expenditures, Cash and Fund Balance.

**Proposed:** `vs Apr 2026` everywhere, and one house form for the period label.

### 12.5 A "Review" badge is counted as a "Warning"

An alert row of severity `WARNING` displays the badge word **`Review`**, but the count strip
directly beneath the same list labels that tier **`Warning`**. A reader counting rows cannot
reconcile them.

**Proposed:** either badge `Warning` and count `Warning`, or badge `Review` and count `Review`.

### 12.6 Cash alert counts differ between two screens

The Cash dashboard adds a synthetic informational row (`Cash flow trend`) to its list and includes
it in the heading `Cash alerts (N)`. The Alerts page's `Cash (N)` heading counts only threshold
alerts. The same period can therefore show `Cash alerts (3)` on one screen and `Cash (2)` on the
other.

**Proposed:** exclude informational rows from both counts, or include them in both.

### 12.7 "Statutory minimum" is populated from Board Policy Minimum ⚠️ highest priority

The Executive dashboard and the Fund Balance Current Position tab both display a figure labelled
**`Statutory minimum`** (and a Key Insight sentence reading *"…below the 3.00% statutory
minimum…"*), but the value comes from the **Board Policy Minimum** setting. The district's actual
**State Minimum** setting is never shown on either card.

The Fund Balance → Policies tab labels both correctly, so the two tabs of the same module disagree.

**This is a wording error with compliance implications** — a board packet stating a district is
above or below "the statutory minimum" would be citing a board-policy figure. Please confirm
whether these cards should show the State Minimum, the Board Policy Minimum under its own name, or
both.

### 12.8 "Top positive variances" means opposite things

On Revenues it is good news (collections ahead of budget), coloured green. On Expenditures it means
spending ahead of pace, coloured red, with the subtitle `Spending ahead of pace` doing the work the
title should.

**Proposed:** `Largest overspends` / `Largest underspends` on Expenditures;
`Largest over-collections` / `Largest shortfalls` on Revenues. The print sheet already uses the
neutral `Largest variances`.

### 12.9 Exports use retired vocabulary

Columns say `Budget to date` and `Variance to date`; the dashboards were renamed to `Budget (YTD)`
and `Variance (YTD)` at the client's request. Sheets say `Spending by function` / `Spending by
object` where the dashboards say `Expenditures`.

### 12.10 British spellings in a US product

`utilisation` / `Utilised` / `cost centre` appear in user-facing text alongside the American
`Utilization` / `Cost Center` used in the policy form and the filter panel. Listed in full in §1.6.

### 12.11 Negative numbers have three renderings

| Helper | Negative form |
|---|---|
| Exact money in tables | `-$1,234` (ASCII hyphen) |
| Abbreviated money | `-$1.2M` (ASCII hyphen) |
| Plain grouped number | `−1,234` (true minus, U+2212) |
| Signed money / percent | `−$1.05M`, `−0.80%` (true minus) |
| Variances, deficits, net flows | `($84.8M)` (parentheses) |

The accounting parentheses are deliberate and used consistently for variances. The hyphen/true-minus
split is not.

**Proposed:** a true minus (`−`) everywhere a sign is shown, parentheses everywhere accounting form
applies.

### 12.12 "Month over month" is hyphenated three ways

`Month over month change` (KPI labels) · `Month-over-Month Revenue Change` (policy form) ·
`Month-over-month change` (policy echo) · `Significant month-over-month increase` (alert title).

**Proposed:** `Month-over-month` throughout, sentence case except where §1.5's ruling says otherwise.

### 12.13 "Days cash on hand" vs "Days of operating cash"

| Surface | Wording |
|---|---|
| Executive KPI | `Days of operating cash` |
| Executive health table | `Days of operating cash` |
| Cash KPI | `Days cash on hand` |
| Cash health card | `Days cash on hand` |
| Policy form | `Days Cash on Hand — Warning` |
| Alert titles | `Days cash on hand`, `Days cash on hand critical` |
| Key Insight | `Days of operating cash stands at 52.` |

Also, the value is rendered `62` on the Executive tile (unit in the sub-line) and `62 days` on the
Cash tile.

### 12.14 Policy help text does not distinguish warning from critical

Every one of the ten warning/critical pairs shares identical help text. Detailed in §5.2.

### 12.15 Smaller items

| Item | Detail |
|---|---|
| `No selected` | The filter panel reads `No selected` when nothing is ticked. Should be `None selected`. |
| `Days in fiscal year` | The Revenues KPI labelled `Days in fiscal year` shows days **elapsed**. |
| Sub-line capitalization | Mixed: `No revenue budget uploaded` (capital) beside `no General Fund identified` (lowercase); `Needs an earlier period` beside `needs 3 months`. |
| Screen vs print wording | Revenue status sub-line reads `Within policy (± 5.00%)` on screen and `within policy` on the printed sheet. |
| Date format split | `Data as of September 30, 2026` on dashboards; `Sep 30, 2026` in the audit log and version history. |
| Available-budget phrasing | `budget less spend and encumbrances` (Executive) / `Budget less spend and encumbrances` (Expenditures) / `budget minus spend minus encumbrances is below zero` (alert E4). |
| Serial comma | Absent in alert F8 (`restricted, committed and assigned`) and present elsewhere (`fund balance, reserve levels, and plan for the future`). |
| Trailing punctuation | Card tooltips end with a period; KPI sub-lines mostly do not. Worth stating as a rule. |

---

## Appendix A — Internal note (not for client review)

`lib/alerts/catalog.ts` opens with the comment *"The twenty-seven alerts"* while the counts
immediately below it — and the automated `verify:alerts` check — assert **24** (revenue 5,
expenditure 8, cash 3, fund balance 8). The comment is stale; the code and the count are correct.

## Appendix B — Where each item lives in the code

| Section | Files |
|---|---|
| Formatting | `lib/dashboard/format.ts`, `lib/format.ts`, `lib/text.ts` |
| Status ladder | `lib/dashboard/status.ts`, `components/dashboard/status-badge.tsx` |
| Alerts | `lib/alerts/catalog.ts`, `lib/alerts/engine.ts`, `lib/alerts/insights.ts`, `components/dashboard/alert-list.tsx` |
| Policies | `lib/policies/registry.ts`, `app/(district)/policies/page.tsx`, `app/(district)/fund-balance/policies/page.tsx` |
| Filters | `components/dashboard/filter-bar.tsx`, `components/dashboard/filter-menu.tsx`, `lib/dashboard/filter-options.ts` |
| View By | `lib/dashboard/view.ts`, `components/dashboard/view-by.tsx` |
| CTAs | `lib/dashboard/cta.ts` |
| Dashboards | `app/(district)/{dashboard,revenues,expenditures,cash,fund-balance,alerts}/page.tsx` |
| Display rules | `lib/dashboard/options.ts`, `components/dashboard/dim-label.tsx`, `components/dashboard/shared.tsx` |
| Exports | `lib/export/dashboard-export.ts`, `components/dashboard/scope-bar.tsx`, `components/dashboard/print-sheet.tsx` |
| Loading / empty | `app/(district)/loading.tsx`, `components/dashboard/shared.tsx`, `components/dashboard/scope-navigation.tsx` |
