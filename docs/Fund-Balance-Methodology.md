# Fund Balance Methodology

How the platform calculates the Current Position fund balance and the reserve percentage.

**Status:** implemented. **Applies from:** the M6 release.

---

## Summary

The reserve percentage is:

```
        projected ending unassigned fund balance
        ----------------------------------------
             projected General Fund revenue
```

Two things changed from the previous release. Both halves of that fraction.

| | Before | Now |
|---|---|---|
| Numerator | Unassigned balance as at the selected month | **Projected ending** unassigned balance |
| Denominator | Adopted General Fund expenditure budget | **Projected General Fund revenue** |

The change aligns the platform with Florida statute **s. 1011.051**, which states its reserve
triggers as a share of general fund *revenues*. A Florida district can now reconcile the
figure on screen to the figure it reports to the state.

---

## 1. Two ending fund balances, and why both are on screen

The platform reports the ending fund balance two ways. They answer different questions, they
are labelled **(Actual)** and **(Budgeted)** everywhere they appear, and they are not
interchangeable.

| | Ending fund balance (Actual) | Ending fund balance (Budgeted) |
|---|---|---|
| Formula | Beginning + revenues collected − expenditures made | Beginning + budgeted revenues − budgeted expenditures |
| Answers | Where the balance stands **today** | Where the board's approved budget says the year **ends** |
| Moves when | Every month, as actuals land | Only when the board amends the budget |

**The actual figure moving month to month is expected, not an error.** Districts typically
spend ahead of collections early in the year, so the actual balance drifts down and recovers
later. If budgeted revenues and expenditures have not changed, the **Budgeted** figure will
not change either — that is the one to watch for the effect of an amendment.

Both appear as columns in *Fund Balance by Fund*, as two lines on the *Fund Balance Trend*
chart (budgeted is the dashed reference line), and as separate columns in the export.

### Fund Balance Composition — which of the two is on screen

The composition card carries its own **Basis** control beside its **View by** control, and the
card's subtitle prints the answer: *By classification · Actual*, *By fund · Budgeted*, and so
on. There is no basis to infer.

| Basis | What the card splits |
|---|---|
| **Actual** (default) | The balance as at the selected month — opening balance plus revenues collected and spending made |
| **Budgeted** | The same balance rebuilt from the latest amended budget — the projection the board voted for |

The two controls are independent: any grouping can be read on either basis.

**Switching to Budgeted moves the unassigned slice only.** Nonspendable, Restricted, Committed
and Assigned stay where they are, and that is correct rather than an oversight — a district
re-designates fund balance by board action, which reaches the platform as a new Opening Fund
Balance file, never as a budget amendment. The whole of the budgeted net change lands in
unassigned.

Under a cost-centre filter the *Budgeted* basis is unavailable for the classification view and
the card says so, for the reason in §8: the budget figures carry the whole filter while the
opening balance is fund-level.

---

## 2. The projected ending fund balance

While the fiscal year is open:

```
projected ending fund balance = beginning fund balance
                              + amended revenue budget
                              − amended expenditure budget
```

**The beginning fund balance is fixed for the whole year.** It is the prior year's audited
ending balance, entered once during setup for the fiscal year.

**What moves the projection is a budget amendment, and only a budget amendment.**

### Worked example

July, at budget adoption:

| | |
|---|---|
| Beginning fund balance | $77,000,000 |
| Budgeted revenue | $513,000,000 |
| Budgeted expenditures | $563,000,000 |
| **Projected ending fund balance** | **$27,000,000** |

October, the board approves an amendment raising revenue by $1M without raising
appropriations. When the district uploads its October files, the Budget column carries the
revised figure and the platform recalculates on its own:

| | |
|---|---|
| Beginning fund balance | $77,000,000 (unchanged) |
| Amended revenue budget | $514,000,000 |
| Amended expenditure budget | $563,000,000 |
| **Projected ending fund balance** | **$28,000,000** |

No manual entry is required. The amended budget is already captured from the monthly detail
files.

### What does *not* move the projection

Actual collections and actual spending do **not** change this figure during the year. This is
deliberate. The projection a board is accountable for is the one it voted for, not a
statistical extrapolation from two months of receipts.

A district that quietly collects above budget will see no movement here until either the
board amends the budget, or the year closes.

**The pace-based view still exists.** The Forecast screen projects year-end from the current
rate of collection and spending, and the platform raises separate alerts from it. The two
answer different questions:

- **Current Position** — where the board's approved budget says the year ends.
- **Forecast** — where the district's current pace says the year ends.

A gap between them is itself the signal.

---

## 3. Once the year is complete

At the fiscal year's final period, the platform stops reporting the plan and reports the
outcome. Both halves of the fraction switch:

| | While the year is open | Once the year is complete |
|---|---|---|
| Numerator | Projected ending balance | **Actual** ending fund balance |
| Denominator | Projected General Fund revenue | **Actual** General Fund revenue collected |

Continuing the example: the district budgeted conservatively, collected more than projected
and spent less than budgeted, and finished at $77,000,000 against $447,000,000 collected.

| | Projection | Outturn |
|---|---|---|
| Ending fund balance | $27,000,000 | $77,000,000 |
| Revenue | $513,000,000 | $447,000,000 |
| Reserve % | 5.26% | 17.23% |

Because districts always view a prior fiscal year at its final period, **prior years
automatically report actuals**. No year-close action is required.

> **Deferred to a later phase:** an explicit "close the books" control, with the ability to
> re-open a closed year. The rule above covers every prior year correctly in the meantime.

---

## 4. Reserve components — the General Fund's, always

This card answers one question: **what is the statutory floor, and what sits above it?** That
question exists for the General Fund only, so every row of the card is the General Fund's —
including the designated components — whatever the dashboard is filtered to. The subtitle
names the fund so there is nothing to infer.

> Before this, the designated lines were the *filtered* district's opening components while the
> required-reserve and excess lines were the General Fund's, and the share column divided all of
> them by General Fund revenue. On All Funds — the default view — that put district-wide dollar
> figures over a General Fund divisor. The column added up on screen and could not be tied to
> anything.

When the dashboard is filtered to a fund other than the General Fund, the designated lines are
omitted rather than guessed at, and the card says why. The required reserve and the balance
above it still stand, because they are General Fund figures regardless of the filter.

Every component is stated as a share of the same denominator, so the column adds up to the
reserve percentage shown above it.

| Component | Amount | % of revenue |
|---|---|---|
| Nonspendable | 1,000,000 | 0.19% |
| Committed | 7,470,021 | 1.45% |
| Assigned | 2,000,000 | 0.39% |
| Required reserve (3%) | 15,416,225 | 3.00% |
| Excess unassigned above required reserve | 3,350,091 | 0.65% |
| **Total unassigned fund balance** | **18,766,316** | **3.65%** |

**Required reserve** is calculated, not imported: it is the district's State Minimum setting
applied to the denominator. At Florida's default of 3%, a district with $513.87M of projected
revenue carries a $15.42M required reserve.

**Excess unassigned** is what remains above that floor — the money a district actually has
room to use.

### When the district is short

If unassigned falls below the required reserve, the excess line is negative. The platform
renders that as a **shortfall** rather than as a negative surplus, and the reserve alert
states the dollar gap:

> Projected unassigned reserve is 1.5% of projected General Fund revenue, below your 2%
> critical threshold. That is $420K short of the $360K required reserve.

---

## 5. Thresholds

Defaults for a newly created district:

| Setting | Default | Basis |
|---|---|---|
| District target | 5.00% | District's own goal |
| Board policy minimum | 3.00% | Board policy |
| State minimum (required reserve) | 3.00% | s. 1011.051 notification trigger |
| Warning threshold | 3.00% | s. 1011.051 notification trigger |
| Critical threshold | 2.00% | s. 1011.051 deeper trigger |

Status labels come from these same thresholds, so a badge and the alert beside it cannot
disagree:

| Reserve % | Status |
|---|---|
| At or above 5% | Strong |
| 3% to 5% | Acceptable |
| 2% to 3% | Monitor |
| Below 2% | Action Required |

**Districts that have already saved their own thresholds keep them.** These defaults apply
to new districts only.

---

## 6. Configurable measurement basis

The revenue-versus-expenditure basis is a district setting, not a platform constant.

**Fund Balance → Measurement Basis → "Measure reserves against General Fund revenue"**

- **On (default)** — measures against General Fund revenue. Florida.
- **Off** — measures against budgeted General Fund expenditures, as many other states use.

Switching the basis changes the divisor **only**. The projected-ending numerator is the right
numerator either way. Every caption on every screen follows the setting, so a district on the
expenditure basis is never shown a revenue caption.

Expanding into an expenditure-basis state is therefore a configuration change, not a second
pass over the finance layer.

---

## 7. Where each figure comes from

| Figure | Source |
|---|---|
| Beginning fund balance | Opening Fund Balance file, uploaded once per fiscal year |
| Amended revenue budget | Budget column on the monthly Revenue Detail file |
| Amended expenditure budget | Budget column on the monthly Expenditure Detail file |
| Actual revenue collected | Actual YTD column on the monthly Revenue Detail file |
| Designated components | Opening Fund Balance file |
| Required reserve % | District policy setting (State Minimum) |

No new file or column is required. Every input was already being captured.

**Fallback:** if a district's monthly files omit the Budget column, the platform falls back to
the adopted annual revenue budget rather than showing an unavailable figure.

---

## 8. Scope rules

**The reserve percentage is always the General Fund's**, whatever the dashboard is filtered to.
The workbook is explicit that a combined all-funds reserve percentage is not a meaningful
figure, and the platform will not compute one. A district with no fund typed General sees "Not
available" rather than a blended number.

**The ending position follows the fund selector.** The reserve *test* is General Fund only; the
arithmetic underneath it — beginning balance, plus the budget's two sides, equals the projected
ending balance — holds for any fund and for all of them together, and the Projected Ending
Position card computes it on whatever the page is scoped to:

| Scope | Card shows | Fifth figure |
|---|---|---|
| All Funds | All funds' beginning, budget and projected ending | Projected change against the beginning balance |
| General Fund | The General Fund's | Room above (or shortfall to) the required reserve, with the reserve status badge |
| Any other fund | That fund's | Projected change against the beginning balance |

On any scope other than the General Fund the card states that the required reserve is a General
Fund test, and names where the General Fund currently stands — so a reader who filtered to
Capital Projects is not left to assume the reserve moved with them.

**Under a cost-centre filter the budgeted terms are withheld**, not estimated. The budget
figures carry the whole filter while the beginning balance is fund-level, so the subtraction
would mix two grains. The card says so.

**Fund balance is always a fund-level figure.** Under a cost-centre filter the platform
computes the balance at fund level and badges it as such, because an opening balance cannot be
narrowed below a fund — subtracting one department's spending from the district's opening
balance produces a number that is not anything.

---

## 9. Checking a figure against the underlying rows

Every figure on these screens can be tied back to the imported detail without exporting.

On **Data → the relevant dataset**, the row browser now offers:

- **A filter per dimension** — Fund, Function, Object, Cost Center, Project. Each dropdown
  offers only the codes that version actually uses, so every option returns rows. Filters
  combine with each other and with the search box.
- **A totals row** for every money column, covering **all matching rows** rather than the
  fifty on screen. Applying a filter narrows the totals with it.

Both live in the URL, so a filtered view can be bookmarked or sent to a colleague, and the
Export CSV button carries the same filters — the file always matches the screen.

The CSV itself deliberately carries **no totals row**: those files re-import, and a trailing
total would come back in as an account.

---

## Open item

The status label wording is currently **Strong / Acceptable / Monitor / Action Required**. The
district's own sheet uses "Maintain Reserves". If Florida-standard wording is preferred, send
the labels and they will be applied.
