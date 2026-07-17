# Milestone 2 — Module Breakdown & Decisions

**Companion to:** [implementation-plan.md](./implementation-plan.md)
**Purpose:** why the plan looks the way it does — the document reconciliation, the full assumptions register with reasoning, and the drafted field tables for the three datasets deferred to Phase 2.

Read the implementation plan to build. Read this when you need to know *why*, or when Phase 2 starts.

---

## 1. Why the three source documents disagree

Milestone 2 is described by three client documents written in this order:

1. **Feature Specification v1.1** — written after Milestone 1 shipped
2. **Milestone Plan v1.1** — same
3. **The Import Workbook** ("The Import Workbook, Explained") — written **last**, and it changes things

Where they conflict, the workbook's field tables win, because they are the most recent statement of client intent. Four conflicts mattered:

### The blocking question is answered

Both the Spec (§12) and the Milestone Plan (p4) name one question as *the* thing blocking the importer: *"Will each dataset be uploaded separately, or as one combined workbook per reporting period?"*

The workbook's Misc tab settles it — an import-type dropdown, one file per type. So: a per-dataset importer, not a multi-sheet workbook parser. This also retires the Spec's "all expected sheets present" structural check (§5.6), which no longer describes anything.

### The dataset count grew, then shrank

M2 was priced against four datasets ("revenue, expenditure, fund balance and cash"). The workbook's field tables define **seven**:

| | Field table | Rhythm |
|---|---|---|
| 1 | Revenue Budget | Annual |
| 2 | Expenditure Budget | Annual |
| 3 | Opening Fund Balance | Annual |
| 4 | Revenue Detail | Monthly |
| 5 | Expenditure Detail | Monthly |
| 6 | Cash Position | Monthly |
| 7 | Monthly Fund Balance Snapshot | Monthly, conditional |

Decisions then took it to six: #7 dropped (System Calculated ships alone), and Grants Activity / Capital Projects Activity / Enrollment — which have **no field table at all** — deferred to Phase 2 alongside their dashboards.

### Thresholds, alerts and forecasting arrived from Phase 3

~22 settings across four groups, 27 alert types, and two forecast engines. The Spec (§10) put a configurable rules interface and forecasting in **Phase 3**; the workbook assumes them in the MVP dashboards. Moved in-scope at +$500 / +7 days.

### Two corrections the working assumptions needed

**Cash Position was omitted from the working list but is mandatory.** Not a preference — the workbook (§3.2) names the four inputs System Calculated fund balance requires: Budget Summary, Revenue Detail, Expenditure Detail, **Cash Position**. Shipping the mode without the file leaves the headline reserve figure unbuildable.

**"Budget Summary" cannot be one file.** Revenue Budget is keyed Fund × Revenue Source; Expenditure Budget is Fund × Function × Object. One template cannot carry both column sets, and no field table describes a third, coarser grain that could. Hence two importers, and a dropdown that names all six explicitly rather than carrying the workbook's coarser five labels — a label mapping to two different templates makes the blank-template feature incoherent.

---

## 2. What Milestone 1 gives us, and where it stops

Four findings from the code that shaped the plan.

### The permissions already exist

`upload_data`, `manage_versions`, `view_dashboards` and `export_data` are already in the matrix at `lib/auth/permissions.ts:14-18`, and already mapped onto external-user View Only / Full Access levels. Nothing to design — consume them.

### The registry pattern transfers directly

`lib/master-data/registry.ts` already drives form, table, import, export and blank template from one field definition. The dataset registry is the same idea with different requiredness metadata. Its composite label→id resolution (`app/actions/master-data.ts:254-282`) — which makes a CSV unable to pair a type with the wrong category — is exactly what vocabulary and referential validation need.

### Every table in the product loads all rows and paginates in the browser

Correct at master-data scale, wrong at Expenditure Detail scale — that grain is Fund × Function × Object × Cost Center × Project, tens of thousands of rows per district-month before versions multiply it. `usePagination`, `useSort` and the client-side CSV export **do not transfer**. Server-side paging, sorting and export is new work, and it is unavoidable.

### The upload transport has a ceiling M1 never hit

Every M1 import runs through a Server Action, and Next 16 caps those at **1 MB by default** (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md:83`). Vercel caps a serverless request body at 4.5 MB regardless. With no object storage and no queue *by design* (Spec §3), an Excel import has a real size limit.

The way through: **a Route Handler** (not subject to the Server Action cap) plus **a staging table**.

### Also worth knowing

- The tenant extension **throws** on `upsert`, `update` and `delete` for tenant models (`lib/tenant-scope.ts:52`). Replace must be `deleteMany` + `createMany`. New periodic models must be registered in `TENANT_MODELS` or they silently lose district scoping — the extension is an allowlist and fails open.
- There are **no transactions and no upsert anywhere** in the import path today. Master-data import is deliberately row-at-a-time and partial-success. A versioned snapshot must be atomic — that is a new pattern, not a reuse.
- No Excel, chart, date or table library is installed. `xlsx`/SheetJS is not maintained on npm and has a CVE history → **ExcelJS**.
- The existing charts (`components/dashboard/charts.tsx`) are hand-rolled SVG with a hardcoded scale (`max = 16`). Fine as sample-data previews; they need a real scale/axis layer before Milestone 3 uses them.

---

## 3. Why the staging table exists

"Don't assume the file fits in one request" collides with two deliberate exclusions: no object storage, no queue (both Spec §3). A multi-request upload has to park its bytes somewhere, and both options are ruled out.

**The staging table resolves it** — parse rows, land them keyed to the import batch, validate there, commit to the real tables in one transaction, clear the staging rows. No file is ever retained, so §8's "no archive of district spreadsheets to leak" promise holds intact.

**And we need it regardless of file size.** The Spec's own lifecycle (§7) spans several requests: upload → validate → show report → acknowledge warnings → duplicate prompt → choose → commit. The parsed and validated rows must survive between the report and the user's decision, or the user re-uploads the file to commit it. Staging is what the lifecycle always implied; the size requirement just forced us to notice it early. It delivers atomicity for free, and because staging is keyed by batch, a chunked client-side upload can append to the same batch later with no rework.

---

## 4. Verified, not assumed

**The tenant extension survives `$transaction`** — run against the live DB, 6/6 passed:

| Check | Result |
|---|---|
| `create` inside an interactive tx | injects `districtId` ✓ |
| `createMany` inside a tx | injects `districtId` on every row ✓ |
| `findMany` inside a tx | stays scoped to the district ✓ |
| `upsert` inside a tx | still throws — the guard applies ✓ |
| Rollback | nothing persisted ✓ |

This is what makes Replace = `deleteMany` + `createMany` in one transaction viable **without** hand-threading `districtId` through the commit path — which was the fallback and would have been a place bugs lived. Folded into `verify:import` so it stays true.

---

## 5. Assumptions register

Nothing here blocks. All of it is reversible at known cost. The split matters: the first group are product decisions Gary should eventually confirm; the second are engineering calls he has no reason to care about.

### Product — needs Gary's sign-off

| # | Assumption | Why this call |
|---|---|---|
| A1 | Six importers; the dropdown names each explicitly, grouped Annual / Monthly | The field tables are the source of truth, and a coarse label mapping to two templates makes the blank-template feature incoherent |
| A2 | Cash Position is in | Not a preference — System Calculated fund balance names it as a required input (workbook §3.2) |
| A3 | Budget Summary = Revenue Budget + Expenditure Budget, as two importers | Their column sets genuinely differ; one file would need a grain no table describes |
| A4 | Grants Activity columns as drafted in §6 | Derived from Spec §6 grain + the Grant master + the §5.6 referential check. **Phase 2.** |
| A5 | Capital Projects Activity columns as drafted in §6 | Same, plus Project Budget and Percent Complete, which nothing we hold can supply. **Phase 2.** |
| A6 | Enrollment columns as drafted in §6; FTE required | Spec §6 fixes the grain at cost centre × survey; FEFP runs on FTE. **Phase 2.** |
| A7 | Enrollment's period selector is Survey 1 / Survey 2, not a column | Spec §5.7; consistent with every other importer. **Phase 2.** |
| A8 | KPIs divide by Current/Revised budget with an Adopted toggle; the forecast basis stays Adopted | Districts manage against current mid-year, but the workbook explicitly defaults forecasting to Adopted. Falls back to Adopted before the first monthly file lands. |
| A9 | Transfer object codes are platform-level config, not per-district | Red Book is the standardised core, and the existing Tier 1 console is exactly this shape — a seventh global list, not a new surface |

### Engineering — ours

| # | Assumption | Why this call |
|---|---|---|
| E1 | Upload via Route Handler, not Server Action | Sidesteps the 1 MB Server Action cap by using the right primitive rather than raising a limit |
| E2 | ExcelJS, streaming reader | SheetJS isn't maintained on npm and has a CVE history |
| E3 | Staging table now; chunked upload designed-for, deferred | The §7 lifecycle needs staging regardless of size; chunking then appends to the same batch with no rework |
| E4 | Leading zeros resolved against master data, not at parse | A numeric `.xlsx` cell has already lost the zero before we read it — no read mode recovers it. Master data holds the canonical value. |
| E5 | Calculation mismatch is an Error at ±$0.01 | The decision says fix it, not warn. Decimal throughout; the cent absorbs the district's own rounding without waving through a real discrepancy. |
| E6 | FB override is versioned with its period, requires a reason, is cleared by a Replace, and is labelled wherever shown | An override on a derived financial figure is exactly what an auditor asks about. A Replace changes the numbers underneath, so the correction may no longer apply. |
| E7 | Cross-dataset reconciliation warnings between the activity files and the detail files | Two sources for one number will eventually disagree. **Deferred with the activity importers — see §6.** |
| E8 | System Calculated FB shows as provisional until transfer codes are configured | A wrong reserve % shown confidently is worse than a right one shown late. Reuses the sample-data banner already on the dashboard. |

---

## 6. Phase 2 — the drafted field tables

**These three datasets have no field table in the client's workbook.** They were drafted from Spec §6 (grain and foreign keys), the §5.6 referential checks, and the master data already in the database. They are deferred to Phase 2 alongside their dashboards (Spec §5.10 puts all three there), but the drafts are preserved here so Phase 2 starts from them rather than from nothing — and so Gary has something concrete to correct rather than a blank request.

Requiredness vocabulary matches the workbook: **Required** · **Recommended** · **Optional** · **Calculated**.

### Grants Activity — one row per grant per period

| Field | Requiredness | Resolves / means |
|---|---|---|
| Grant Code | Required | Must exist in Grant master — the check Spec §5.6 names |
| Fund Code | Required | Must exist in Fund master |
| Award Amount | Optional | Master already holds it; if sent, compare and warn on mismatch |
| Revenue Recognized MTD | Required | Draw-down this month |
| Revenue Recognized YTD | Required | Draw-down to date |
| Expenditures MTD | Required | Grant spend this month |
| Expenditures YTD | Required | Grant spend to date |
| Encumbrances | Optional | Committed, not yet paid |
| Remaining Award | Calculated | Award − Revenue Recognized YTD |
| Available Balance | Calculated | Award − Expenditures YTD − Encumbrances |
| Status | Optional | Resolves to the global Statuses list |

### Capital Projects Activity — one row per project per period

| Field | Requiredness | Resolves / means |
|---|---|---|
| Project Code | Required | Must exist in Capital Project master |
| Fund Code | Required | Must exist in Fund master |
| Project Budget | Required | Master has no budget field — this file is the only source |
| Expenditures MTD | Required | Project spend this month |
| Expenditures YTD | Required | Project spend to date |
| Encumbrances | Required | Committed, not yet paid |
| Available Budget | Calculated | Budget − Expenditures YTD − Encumbrances |
| Percent Complete | Recommended | 0–100. Cannot be derived from anything we hold — Spec §5.10 names it |
| Estimated Completion Date | Optional | — |
| Status | Optional | Resolves to the global Statuses list |

### Enrollment — one row per cost centre per survey

| Field | Requiredness | Resolves / means |
|---|---|---|
| Cost Center Code | Required | Must exist in Cost Center master |
| Headcount | Recommended | Physical student count |
| FTE | Required | The figure Florida's FEFP funding runs on |
| Projected FTE | Optional | Drives Spec §5.10's "FTE against projection" |
| FTE Variance | Calculated | FTE − Projected FTE |

Survey is the **period selector** on upload, not a column — consistent with every other importer. `PeriodType.SURVEY` is already reserved in the M2 enum; only the branch is unbuilt.

### Why deferring these costs less than it looks

Project/Grant is a **required** column on both Revenue Detail and Expenditure Detail. So grant and project spend already arrives, tagged, in files Milestone 2 parses anyway — `grantId` and `capitalProjectId` FKs are on `RevenueActual` and `ExpenditureActual` from day one. A Phase 2 grants dashboard can be built largely from data this milestone already collects.

What is genuinely absent until these importers exist:

- **Enrollment** entirely — no other source feeds it
- **Project budget** and **percent complete** — nothing we hold can supply either
- **Award-level grant reconciliation** — the award is in the Grant master, but draw-down vs spend at grant grain is not

### The reconciliation layer that comes back with them

Because grant and project spend arrives twice — once at detail grain, once at activity grain — the two can disagree. When these importers land, the validator should **cross-check** them: if Grants Activity says a grant spent $40k YTD and the sum of Expenditure Detail tagged to that grant says $38k, that's a Warning naming both figures. It reuses the two-tier engine Milestone 2 builds, costs almost nothing, and turns a modelling flaw into the kind of check this platform exists to perform.

Enrollment has no such overlap — it's genuinely its own source.

---

## 7. Scope history

For the record, since the estimate and the scope moved separately:

- **Original M2:** four datasets, one combined workbook. ~1.5 weeks, $1,400.
- **+$500 / +7 days:** thresholds, alerts and forecasting moved in from Phase 3.
- **Grew the base with no time attached:** a budget-type dimension across two rhythms with different grains; a second file format plus the resolution work leading zeros actually need; streaming parse and staged ingest; a manual override on a derived figure with auditor-grade provenance.
- **Gave time back:** Import Monthly deferred (−1 importer); Grants Activity / Capital Projects Activity / Enrollment deferred (−3 importers, −3 tables, −survey periods, −the reconciliation layer).

Net: **~14 days against ~12.5 budgeted.** The Milestone 1 precedent — external access scoped and quoted separately at $250, accepted without friction — is the model if that gap needs closing.
