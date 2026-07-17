# Sample data

Demonstration files for the Milestone 2 import pipeline — one per import type, in both
`.csv` and `.xlsx`.

> **The figures are invented.** The account codes are shaped like Florida's chart of
> accounts and the expenditure categories match the client's workbook, but the numbers are
> for a demonstration. They are not any real district's.

| Command | What it does |
|---|---|
| `npm run sample:data` | Regenerates every file below from `scripts/generate-sample-data.mts` |
| `npm run verify:sample` | Checks they still parse, in both formats, with no dangling references |
| `npm run sample:load` | Loads the whole set into the demo district through the real pipeline |

`sample:load` is the fastest way to see the milestone working: it imports the master data,
the annual files and two months, then prints the fund balance, the reserve and the alerts.
It is idempotent — run it twice and the second run replaces the first.

To click through it by hand instead, follow the order below.

---

## Import them in this order

### 1. Master data — first, and not optional

`master-data/*.csv`, under **Master data** in the district console.

Nothing else will import until these are in. Every code in every file below has to resolve
to a row here, and a file referencing a fund the district has never heard of is refused —
that is the referential check doing its job, not a bug. Import them in numbered order;
grants and capital projects reference the revenue types and statuses above them.

| File | Rows | Notes |
|---|---|---|
| `01-funds.csv` | 4 | General, Debt Service, Capital Projects, Food Service |
| `02-revenue-sources.csv` | 7 | Includes `3600` Transfers In and `3730` Sale of Capital Assets — see §3 |
| `03-functions.csv` | 5 | Mapped to the three Function Types the platform ships with |
| `04-objects.csv` | 8 | Match the workbook's expenditure categories exactly. `9700` is Transfers Out |
| `05-cost-centers.csv` | 5 | Codes carry leading zeros on purpose — see §4 |
| `06-grants.csv` | 2 | Title I, IDEA Part B |
| `07-capital-projects.csv` | 2 | PECO maintenance, a roof replacement |

### 2. Annual — once a year

Under **Data → Upload data**. Fiscal year **2026-27**; these carry no reporting period.

| File | Import type |
|---|---|
| `01-revenue-budget-FY2026-27` | Revenue Budget |
| `02-expenditure-budget-FY2026-27` | Expenditure Budget |
| `03-opening-fund-balance-FY2026-27` | Opening Fund Balance |

The opening fund balance has to be in before any fund balance figure means anything —
without a starting point, the "balance" is only the year's net change wearing the balance's
name. The platform says so if it is missing.

### 3. Monthly — every reporting period

Fiscal year **2026-27**, period **July (Period 1)** then **August (Period 2)**.

| File | Import type |
|---|---|
| `04-revenue-detail-FY2026-27-P1-July` | Revenue Detail |
| `05-expenditure-detail-FY2026-27-P1-July` | Expenditure Detail |
| `06-cash-position-FY2026-27-P1-July` | Cash Position |
| `04-revenue-detail-FY2026-27-P2-August` | Revenue Detail |
| `05-expenditure-detail-FY2026-27-P2-August` | Expenditure Detail |
| `06-cash-position-FY2026-27-P2-August` | Cash Position |

Both months are here because month-over-month alerts need something to compare against.
Upload July first.

---

## What these files are built to show

**The workbook's own arithmetic.** August's General Fund cash is
`$72.0M + $48.5M − $44.2M = $76.3M` — the worked example from the Import Workbook, §3.1.
July's ending cash is August's beginning cash, so the months chain the way a real ledger
does.

**Transfers, and why they need classifying.** Revenue source `3600` (Transfers In), `3730`
(Sale of Capital Assets) and object `9700` (Transfers Out) are ordinary rows in the revenue
and expenditure files — there is no transfer column, and there does not need to be.

Classify them under **Platform → Activity codes** and one number moves:

| | Unclassified | Classified |
|---|---|---|
| Net operating surplus | **−$540,000** | **+$460,000** |
| Fund balance | $18,460,000 | $18,460,000 |

Without the classification the district looks like it is running a deficit. It isn't — it
moved $2M between its own funds. The **fund balance does not move at all**, because the
classification cancels out of that arithmetic: it is Beginning + all revenue − all
expenditure either way. That is why the fund balance shipped without waiting on the codes,
and why Net Operating Surplus could not.

**The two-tier split.** August's expenditure detail commits the roof project almost in
full — spend plus encumbrances run past its budget. That raises a **warning**, not an
error: it is a real state a district can be in, so the file imports once acknowledged. The
validation report separates the two.

**A reserve worth looking at.** The General Fund's unassigned balance is $9.5M against
~$198M of budgeted expenditure — about **4.8%**, just under the 5% target. The dashboard
reads *Acceptable* and one fund-balance alert fires. A demo where nothing ever fires
teaches nobody what the thresholds do. Change them under **Policies** and watch it move.

**Leading zeros.** Cost centre codes (`0011`, `0021`) are the column a real ERP exports as
a number, turning `0011` into `11`. Open an `.xlsx` in Excel, retype that column as a
number, save, and upload it: the importer still resolves the rows against master data and
warns you that your export is losing the zero. That recovery is why "read the column as
text" is not, by itself, a fix.

---

## Re-uploading

Upload August's revenue detail a second time and the duplicate prompt appears — replace,
cancel, or keep as a new version. All three are safe: a replace keeps the old version in
your history, and **Data → Versions** will compare or restore any of them.
