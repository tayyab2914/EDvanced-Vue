# Alert & Warning Language — for review

Every sentence the platform can put in front of a district, in one place, so the wording can be
reviewed without opening the app.

**How to read this.** Each alert shows the **title** (the bold line on screen), **when it fires**,
and the **sentence** exactly as the district sees it. Figures in the examples are illustrative;
`$12.37M`, `23.7%` and so on are filled in from that district's own numbers at the moment the alert
is generated. Nothing here is written by AI — every sentence is fixed text with the district's
figures and its own thresholds dropped in, so the same numbers always produce the same words.

**How to mark it up.** Edit the sentence in place, or add a note under it. Anything changed here
gets changed in the product.

---

## 1. The two severities, and the third tier

| On screen | Badge word | What it means |
|---|---|---|
| Critical | **Action Required** | A threshold the district set as critical has been crossed |
| Warning | **Review** | A threshold the district set as a warning has been crossed |
| Informational | **Informational** | An observation. No threshold involved — shown under "For Awareness" |

Severity is never carried by colour alone: every row has a warning triangle **and** the word.

**Page copy on the Alerts screen**

- Page title: **Financial Alerts**
- Page subtitle: *Alerts across revenue, expenditures, cash position, and fund balance.*
- With no data yet: **No data to monitor yet** — button: *Upload data*
- Section: **Alert Overview**
- Section: **For Awareness** — *Financial items to monitor that have not triggered an alert threshold.*
- Group headings: **Revenue Alerts (3)**, **Expenditure Alerts (2)**, **Cash Alerts (1)**, **Fund Balance Alerts (2)** — the count is live.

---

## 2. Revenue alerts (5)

### 2.1 Collections Below Expected — *Review* or *Action Required*

Fires when collections to date are behind where the budget says they should be, by at least the
Revenue Variance warning threshold (default **5%**); critical at the critical threshold (default **10%**).

> Revenue collections are **$12.37M** below expected year-to-date levels (**23.7%**).

If the district has collected nothing at all, there is no figure to subtract from and the sentence
drops the dollars:

> Revenue collections are **100.0%** below expected year-to-date levels.

### 2.2 Collections Above Expected — *Review* only

Fires when collections are ahead of pace by the same warning threshold. Over-collection is never
raised to critical — it is a real state to surface, not a failure.

> Collections are **6.2%** above expected YTD levels (**$55.48M** against **$52.23M**).

### 2.3 Forecast revenue below budget — *Review* or *Action Required*

Fires when the year-end projection lands below budget by the Forecast Variance warning threshold
(default **3%**); critical at **5%**.

> On current pace, year-end revenue lands **4.1%** below budget.

### 2.4 Forecast revenue above budget — *Review* only

> On current pace, year-end revenue lands **4.1%** above budget.

### 2.5 Significant Monthly Revenue Change — *Review*

Fires when revenue moves more than the Month-over-Month threshold (default **15%**), in either
direction.

> Revenue **decreased 18.4%** from the prior month.
> Revenue **increased 21.0%** from the prior month.

> **Note on duplication (2.1–2.4).** The pace figure and the forecast figure are arithmetically the
> same number, so 2.3/2.4 used to print a second row saying exactly what 2.1/2.2 had just said. The
> forecast row now stays silent when it would repeat the row above it — and the surviving row is
> raised to the louder of the two severities, so nothing is quietly downgraded. Between 3% and 5%
> off pace, where the current-performance alert is silent, the forecast row still fires on its own.

---

## 3. Expenditure alerts (8)

### 3.1 Budget utilization — *Review*

Fires at the Budget Utilization warning threshold (default **80%** of budget committed), and stops
where the critical alert starts.

> **84.2%** of budget is committed (spend plus encumbrances).

### 3.2 Budget utilization critical — *Action Required*

Fires at the critical threshold (default **95%**), up to the point the budget is actually exceeded.

> **96.4%** of budget is committed, at or past your **95%** critical threshold.

### 3.3 Budget exceeded — *Action Required*

> Spending has passed the budget: **$212.44M** against **$208.30M**.

### 3.4 Negative available budget — *Action Required*

Only when the district has "Flag Budget Overcommitted" switched on.

> Available budget is **-$1.86M** — budget minus spend minus encumbrances is below zero.

### 3.5 Encumbrances exceed available budget — *Review*

Only when "Flag Encumbrances Above Available Budget" is on, and only when 3.4 is not already saying
it louder.

> Encumbrances of **$6.2M** exceed the **$4.35M** left after spend.

### 3.6 Forecast exceeds budget — *Review*

Fires when the year-end projection lands over budget at all. It steps aside above the material
threshold, where 3.7 carries the same landing figure and says how far off it is.

> On current pace, year-end spend reaches **$214.77M** against a budget of **$208.30M**.

### 3.7 Material Forecast Variance — *Review* or *Action Required*

One alert, either severity, firing in both directions — over budget or under. Warning at **3%**,
critical at **5%** by default.

> Projected year-end expenditures are **$16.46M** below budget (**7.9%**).
> Projected year-end expenditures are **$6.47M** over budget (**3.1%**).

Where the projected dollar figure is unavailable, the percentage carries it alone:

> Projected year-end expenditures are **7.9%** off budget.

### 3.8 Significant month-over-month increase — *Review* or *Action Required*

Warning at **15%**, critical at **25%** by default.

> Spending increased **27.3%** from the prior month.

---

## 4. Cash alerts (3)

### 4.1 Days cash on hand — *Review*

Below the warning threshold (default **60 days**), but not yet critical.

> **52** days of cash on hand, below the **60**-day threshold.

### 4.2 Days cash on hand critical — *Action Required*

Below the critical threshold (default **45 days**).

> **38** days of cash on hand, below the **45**-day critical threshold.

### 4.3 Significant cash decrease — *Review* or *Action Required*

Warning at **10%**, critical at **20%** by default.

> Cash decreased **12.4%** from the prior month.

---

## 5. Fund balance alerts (8)

Three of these describe the **current** position and three describe the **projected** one, and both
can be on screen at once with different numbers. Every sentence therefore says two things
explicitly: whether it is a projection or an outturn, and what the percentage is a percentage *of*.

**The subject** is *"Projected unassigned fund balance"* while the year is still open, and
*"Unassigned fund balance"* once the figures are final. It is the same phrase the executive tile,
the fund balance band and the Key Insights use for this figure — the alerts used to be the one
place calling it a *reserve*.

**The basis** is whichever the district has chosen, named in the sentence:

- *of projected General Fund revenue* (the Florida default, s. 1011.051)
- *of actual General Fund revenue collected*
- *of the adopted General Fund revenue budget*
- *of budgeted General Fund expenditures* (for states that measure against expenditures)

### 5.1 Reserve below target — *Review*

Below the District Target (default **5%**) but not yet at the warning bar — a nudge, not an alarm.

> **Projected unassigned fund balance** is **4.2%** *of projected General Fund revenue*, below the **5%** you aim to hold.

### 5.2 Reserve below warning threshold — *Review*

Below the warning threshold (default **3%**).

> **Projected unassigned fund balance** is **2.6%** *of projected General Fund revenue*, below your **3%** warning threshold. That is **$1.04M** short of the **$6.27M** state-required minimum reserve.

The second sentence appears only when the district is actually short of the statutory floor, and
it names that floor as the state's — the figure is the **State Minimum (Required Reserve)** setting
applied to the denominator, not the district's own target or its board policy minimum, which sit
beside it in the same policy group. A district with no state minimum configured keeps the plain
wording, *"required reserve"*.

### 5.3 Reserve critical — *Action Required*

Below the critical threshold (default **2%**).

> **Projected unassigned fund balance** is **1.4%** *of projected General Fund revenue*, below your **2%** critical threshold. That is **$3.35M** short of the **$6.27M** state-required minimum reserve.

### 5.4 Forecast reserve below target — *Review*

The next three read the **pace-driven** projection — what the district's actual rate of collection
and spending implies — rather than what the amended budget implies.

> At the current projected pace, unassigned fund balance is expected to end at **4.2%** *of projected General Fund revenue*, below the **5.0%** target.

### 5.5 Forecast reserve below warning — *Review*

> At the current projected pace, unassigned fund balance is expected to end at **2.6%** *of projected General Fund revenue*, below the **3.0%** warning threshold.

### 5.6 Critical Forecast — *Action Required*

> At the current projected pace, unassigned fund balance is expected to end at **1.4%** *of projected General Fund revenue*, below the **2.0%** critical threshold.

### 5.7 Fund balance decreased — *Review*

> Fund balance has decreased by **$3.11M** this year.

### 5.8 Components exceed the projected balance — *Action Required*

Fixed sentence, no figures:

> The projected restricted, committed and assigned components add up to more than the projected balance, which would leave the unassigned fund balance negative.

---

## 6. "For Awareness" — the informational tier (3)

No threshold is consulted. These are observations, shown under the alerts.

### 6.1 Outstanding Encumbrances

> **$6.2M** is encumbered and already reflected in available budget.

### 6.2 Year-End Projection

> Projected year-end expenditures are **$214.77M** against a **$208.3M** budget.

### 6.3 Fund balance is growing

> This year's operations have added **$2.48M** to the fund balance.

---

## 7. "Where to go" — the fund lines under an alert

Alerts are evaluated on district-wide totals, so each one lists the funds carrying most of what it
is about. Each line reads *fund code — fund name · detail*, and clicks through to that fund:

> 1000 — General · **$10.92M below expected**

The detail wording, by alert family:

| Alert family | Detail line |
|---|---|
| Collections below expected | `$10.92M below expected` |
| Collections above expected | `$3.44M ahead of pace` |
| Revenue forecast off budget | `$8.10M projected below budget` / `…above budget` |
| Significant monthly revenue change | `$2.06M increase` / `$2.06M decrease` |
| Budget utilization (warning & critical) | `84.2% utilized · $3.29M above expected utilization` |
| Spend forecast off budget | `$6.47M projected over budget` / `…under budget` |
| Budget exceeded / overcommitted / encumbrances | `$1.86M over budget · -$1.86M available` |
| Significant month-over-month increase | `$2.44M more than last month` |
| Days cash on hand | `38 days · $12.10M on hand` |
| Significant cash decrease | `$4.02M down · $12.10M on hand` |
| Fund balance decreased | `Expenditures exceeded revenues by $3.11M` |

Where a fund is moving **against** the alert — an underspend inside an overspend — it is labelled
as an offset, and only when it is worth at least a tenth of the district's variance:

> 4100 — Food Service · **$1.21M projected under budget · offsets**

The list closes with the remainder, which links nowhere:

> **+ 9 other funds** · $2.44M over budget
> **+ 9 other funds** · net zero

The reserve alerts (5.1–5.6) deliberately carry no fund lines — the reserve is a General Fund figure
and there is nothing to distribute.

---

## 8. Key Insights — the plain-English lines on the Executive dashboard

Up to three, worst news first. Each is a headline plus a lighter second line saying what it means,
and each links to the dashboard that answers it. A district in good order gets fewer than three,
which is the correct output.

**Revenue against pace** → links to Revenues

> Revenues are **23.70%** below budget year to date.
> *Led by Property Taxes and State Funding. Collections are trending below expected levels.*

Without identifiable drivers, the second line is just: *Collections are trending below expected levels.*
Ahead of pace, both lines read "above".

**Available budget** → links to Expenditures

> Available budget is **$4.35M** (**2%** of full-year budget).
> *Sufficient remaining budget for planned activities.*

> Budget is overcommitted by **$1.86M**.
> *Spending plus encumbrances exceeds the current budget.*

**Spending against budget** → links to Expenditures

> **84.20%** of the expenditure budget is committed.
> *At or past your 80% warning threshold, driven by Instruction and Facilities.*

Within threshold, the second line reads: *Within your 80% warning threshold.*

**The reserve** → links to Fund Balance

> **Projected unassigned fund balance** is below policy target.
> *4.20% of projected General Fund revenue against a 5.00% target. Action needed to rebuild reserves.*

> **Projected unassigned fund balance** is **6.10%**, at or above policy target.
> *6.10% of projected General Fund revenue against a 5.00% target.*

**Cash** — appears only when below the policy minimum → links to Cash

> Days of operating cash stands at **52**.
> *Below your 60-day policy minimum.*

**The one-line narrative under a trend chart**

> Unassigned fund balance **decreased $1.92M (8.65%)** from the prior month, ending **SEPTEMBER** at **$20.25M**.

---

## 9. The thresholds behind all of this

Every one of these is a district setting on the Policies screen. The defaults come from the
workbook, so a district that never opens that screen still behaves sensibly.

### Revenues

| Setting | Default | Help text on the form |
|---|---|---|
| Revenue Variance — Warning | 5% | Actual revenue is off budget by this amount. |
| Revenue Variance — Critical | 10% | Actual revenue is off budget by this amount. |
| Forecast Variance — Warning | 3% | Projected year-end revenue is off budget by this amount. |
| Forecast Variance — Critical | 5% | Projected year-end revenue is off budget by this amount. |
| Month-over-Month Revenue Change | 15% | Revenue changes by more than this from the previous month. |
| Flag lines collected above budget on import | On | Over-collection is a real state, not an error — this only surfaces it as a warning you can acknowledge. |

### Expenditures

| Setting | Default | Help text on the form |
|---|---|---|
| Budget Utilization — Warning | 80% | Budget is this much used (Actual + Encumbrances). |
| Budget Utilization — Critical | 95% | Budget is this much used (Actual + Encumbrances). |
| Month-over-Month Increase — Warning | 15% | Spending changed by more than this from the previous month. |
| Month-over-Month Increase — Critical | 25% | Spending changed by more than this from the previous month. |
| Forecast Variance — Warning | 3% | Projected year-end expenditures are off budget by this amount. |
| Forecast Variance — Critical | 5% | Projected year-end expenditures are off budget by this amount. |
| Flag Budget Overcommitted | On | Actual expenditures and encumbrances exceed the remaining available budget. |
| Flag Spend Above Budget | On | Actual expenditures exceed the current budget. |
| Flag Encumbrances Above Available Budget | On | Encumbrances exceed the remaining available budget. |
| Ignore salary objects for month-over-month variance | Off | Exclude salary objects when computing month-over-month spending change. |

### Cash Policies

| Setting | Default | Help text on the form |
|---|---|---|
| Days Cash on Hand — Warning | 60 days | Alert when available cash falls below this number of operating days. |
| Days Cash on Hand — Critical | 45 days | Alert when available cash falls below this number of operating days. |
| Cash Decrease — Warning | 10% | Cash decreased by this percentage compared to the previous month. |
| Cash Decrease — Critical | 20% | Cash decreased by this percentage compared to the previous month. |

### Fund Balance

*The reserve level you aim to protect — unassigned fund balance as a share of General Fund revenue.*

| Setting | Default | Help text on the form |
|---|---|---|
| Measure reserves against General Fund revenue | On | Florida measures reserves against revenue (s. 1011.051). Turn this off to measure against budgeted expenditures, which some other states use. |
| District Target | 5% | What the district strives to maintain for long-term financial stability. |
| Board Policy Minimum | 3% | Minimum reserve level required by board policy. |
| State Minimum (Required Reserve) | 3% | The statutory floor. Also the required reserve the fund balance breakdown separates from excess unassigned. Florida: 3% of General Fund revenue (s. 1011.051). |
| Warning Threshold | 3% | Alerts generated from CURRENT fund balance. |
| Critical Threshold | 2% | Alerts generated from CURRENT fund balance. |
| Forecast Warning | 3% | Alerts generated from PROJECTED year-end fund balance. |
| Forecast Critical | 2% | Alerts generated from PROJECTED year-end fund balance. |

### The reserve status ladder

The same thresholds also produce the status word on the fund balance screens, so an alert and the
badge beside it can never disagree:

**Strong** (at or above target) · **Acceptable** (below target) · **Monitor** (below warning) ·
**Action Required** (below critical)

---

## 10. A note on how figures are written

Alert sentences abbreviate: **$39.86M**, not $39,859,391.29. A nine-digit figure is one the reader
counts digits through rather than reads, and it wraps to two lines in the summary card. The exact
figure is one click away on the dashboard the alert links to, which is where an exact figure
belongs. Percentages carry one decimal place — **23.7%** — and thresholds are written to match the
figure beside them.
