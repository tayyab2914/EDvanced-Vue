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

## 1. The projected ending fund balance

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

## 2. Once the year is complete

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

## 3. The fund balance components breakdown

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

## 4. Thresholds

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

## 5. Configurable measurement basis

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

## 6. Where each figure comes from

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

## 7. Scope rules

**The reserve is always the General Fund's**, whatever the dashboard is filtered to. The
workbook is explicit that a combined all-funds reserve percentage is not a meaningful figure,
and the platform will not compute one. A district with no fund typed General sees "Not
available" rather than a blended number.

**Fund balance is always a fund-level figure.** Under a cost-centre filter the platform
computes the balance at fund level and badges it as such, because an opening balance cannot be
narrowed below a fund — subtracting one department's spending from the district's opening
balance produces a number that is not anything.

---

## Open item

The status label wording is currently **Strong / Acceptable / Monitor / Action Required**. The
district's own sheet uses "Maintain Reserves". If Florida-standard wording is preferred, send
the labels and they will be applied.
