# Client Document Update Brief — v1.1 → v1.2

**What this file is:** a complete, verified set of instructions for updating the two client-facing documents after Milestone 2:

1. **K–12 School Finance Platform — Feature Specification** (v1.1 → **v1.2**)
2. **K–12 School Finance Platform — Milestone Plan & Payment Schedule** (v1.1 → **v1.2**)

**How to use it:** hand this file, plus the two existing documents, to the LLM doing the rewrite. Every instruction below names the target document and section. Where wording is given in quotes, it is drafted to be pasted in. Commercial position is settled: the base fee is $3,500, plus $250 for external user access (Milestone 1) and $500 for financial policies, alerts and forecasting (Milestone 2) — **$4,250 total**. See [Part F](#part-f--scope-ledger-added-removed-deferred) for what was charged and what was absorbed.

**Verification basis:** every "delivered" claim below was checked against the actual codebase (schema, registries, actions, routes, pages, verify scripts) — not against the internal implementation plan. Where the internal plan and the shipped code disagree, the code wins and this file records the code.

**Ground rule for the rewrite (same as v1.1):** where a v1.1 document and the delivered system disagree, the delivered system wins.

---

## Table of contents

- [Part A — Executive summary of Milestone 2](#part-a--executive-summary-of-milestone-2)
- [Part B — The four structural changes that ripple everywhere](#part-b--the-four-structural-changes-that-ripple-everywhere)
- [Part C — Feature Specification v1.2: section-by-section edits](#part-c--feature-specification-v12-section-by-section-edits)
- [Part D — New sections to ADD to the Feature Specification](#part-d--new-sections-to-add-to-the-feature-specification)
- [Part E — Milestone Plan v1.2: section-by-section edits](#part-e--milestone-plan-v12-section-by-section-edits)
- [Part F — Scope ledger: added, removed, deferred](#part-f--scope-ledger-added-removed-deferred)
- [Part G — Known gaps and what is genuinely not built](#part-g--known-gaps-and-what-is-genuinely-not-built)
- [Part H — Open questions for Gary in v1.2](#part-h--open-questions-for-gary-in-v12)
- [Part I — Reference tables for the rewrite](#part-i--reference-tables-for-the-rewrite)

---

## Part A — Executive summary of Milestone 2

Use this as the "What changed in Version 1.2" callout box at the top of **both** documents (trim to fit each).

> ### What changed in Version 1.2
>
> Milestone 2 has been delivered. Version 1.1 described the data pipeline as a plan; this version describes it as running software, and corrects the places where the plan and the delivered system diverged.
>
> - **Six importers, not one combined workbook.** The blocking question from v1.1 is answered: uploads are one dataset per file. Revenue Budget, Expenditure Budget and Opening Fund Balance are annual; Revenue Detail, Expenditure Detail and Cash Position are monthly (§5.5).
> - **Both Excel and CSV are accepted** on every importer, with a downloadable blank template per dataset.
> - **The validation engine is live** — seven layers, every finding naming sheet, row, column, value and a plain-English explanation, split into blocking Errors and acknowledgeable Warnings (§5.6).
> - **Reporting-period snapshots, duplicate detection and full version history with compare and restore** are delivered (§5.7–5.9).
> - **"Grants" and "Capital Projects" are now one unified "Projects" master.** Grant and project spend still arrives tagged on every detail row. The paid Grants and Capital Projects modules are V2 (§5.14, §6).
> - **New in Milestone 2, beyond the original scope:** district-configurable Financial Policies and thresholds; a 24-alert monitoring catalogue; year-end and multi-year forecasting; a platform-managed Financial Activity Codes list; a periodic-data browse and export surface; and a manual override on derived fund balance (§5.16–5.20).
> - **Two v1.1 known gaps are closed:** the "my account" page and an in-app notification system.
> - **The audit log now records the whole data lifecycle** — upload, validate, acknowledge, commit, cancel, restore, plus policy and configuration changes. Around 40 action types, up from 30 (§5.12).
> - **Dashboards remain Milestone 3.** The calculation engines behind them — fund balance, cash, utilisation, forecasting, alerts — are built and verified; the screens that display them are not.

---

## Part B — The four structural changes that ripple everywhere

These four are not confined to one section. Apply them consistently across **both** documents, including tables, diagrams and passing references.

### B1. "Grants" and "Capital Projects" become one "Projects" master

**What changed.** v1.1 listed seven district master-data types: Cost Centers, **Grants**, **Capital Projects**, Funds, Revenue Sources, Functions, Objects. The delivered system has **six**: Cost Centers, **Projects**, Funds, Revenue Sources, Functions, Objects.

A district now maintains a single list of Projects, keyed by a district-unique **Project Number**. Every periodic detail row that names a "Project / Grant" resolves to exactly one of them. The Grants and Capital Projects modules become V2 subscriptions that reference a Project and add their own fields on top — a grant-funded capital project is then one project referenced by two modules, rather than two lists that can disagree.

**Where to apply it:**

| Document | Location | Change |
|---|---|---|
| Spec | §4 MVP table, "District master data management" row | "seven" → "six"; drop "grants, capital projects"; add "projects" |
| Spec | §5.3 permission matrix and role descriptions | "cost centers, grants and funds" → "cost centers, projects and funds" |
| Spec | §5.14 Tier 2 | Rewrite the list; "The same capabilities on all seven" → "all six" |
| Spec | §5.15 | "all seven master-data types" → "all six master-data types" |
| Spec | §6 District master data table | Delete the Grant and Capital Project rows; add a Project row |
| Spec | §6 Periodic snapshot data table | Grants Activity / Capital Projects Activity rows move to a "Deferred to V2" note |
| Spec | §5.6 Referential integrity example | "A Grant ID in Grants Activity, or a Project ID in Capital Projects" → "A Project Number on a Revenue or Expenditure Detail row must exist in the district's Project master" |
| Spec | §11 Assumptions | Update the master-data list |
| Spec | §12 Confirmed table | Update "Who maintains a district's master data?" |
| Plan | Milestone 1 bullet "Configurable master data per district" | Restate to six types, with a footnote that the list was consolidated during Milestone 2 |

**Suggested paragraph for §5.14** (mirrors the v1.1 "School Master → Cost Center" note, which readers already know how to parse):

> **A second consolidation: "Grants" and "Capital Projects" are now "Projects".**
> Version 1.1 gave a district two separate master lists — one for grants, one for capital projects. In practice a district's financial files carry a single "Project / Grant" column, and one project is frequently both: a capital project funded by a grant. Two lists meant one number could be filed in two places and disagree.
>
> A district now maintains one **Projects** master. Every revenue and expenditure line resolves against it, so grant spend and project spend are already captured, tagged, on every detail row. The dedicated Grants and Capital Projects modules — award tracking, draw-down against award, percent complete, project budget — become subscribable V2 modules that build on this same list. Nothing is lost by consolidating; the field definitions for both modules are preserved and will reference a Project when they ship.

### B2. Status labels are now three-way, not two-way

v1.1 used `DELIVERED` / `PART-DELIVERED` / `MILESTONE 2` / `MILESTONE 3`. In v1.2, use:

- `DELIVERED M1` — shipped in Milestone 1
- `DELIVERED M2` — shipped in Milestone 2
- `PART-DELIVERED` — some of it exists (say which half)
- `MILESTONE 3` — specified and scheduled, not built
- `V2` — deferred to a later paid phase

Distinguishing M1 from M2 matters: it is the evidence that two thirds of the MVP is now running software.

### B3. "The Excel importer" becomes "the importer"

Every importer accepts **both `.xlsx` and `.csv`**. v1.1 says "Excel workbook upload" throughout. Replace with "file upload (Excel or CSV)". Reason worth stating once, in §5.5: districts that export from an ERP often get CSV, and refusing it would force a pointless round-trip through Excel.

### B4. The v1.1 blocking question is answered — remove it everywhere

v1.1 named one question as blocking Milestone 2: *"Will each dataset be uploaded separately, or as one combined workbook per reporting period?"* It appears in Spec §12 "Still to confirm", Spec §13 Next Steps, Plan p4 "One decision to settle", and Plan p6 Next Steps.

**Answer: separately — one import type per file.** Move it into the Spec §12 **Confirmed** table:

| Question from v1.1 | Decision |
|---|---|
| Will each dataset be uploaded separately, or as one combined workbook per reporting period? | **Separately — one dataset per file.** Six importers, grouped Annual and Monthly, each with its own blank template. Delivered (§5.5). |

Delete it from every "still to confirm" and "next steps" list in both documents.

---

## Part C — Feature Specification v1.2: section-by-section edits

### §3 — Recommended Technology Approach

**§3.1 architecture table.** Three rows change:

| Layer | v1.1 said | v1.2 should say |
|---|---|---|
| Import & parsing | "Server-side CSV parsing today; Excel (.xlsx) workbook parsing in Milestone 2" | "Server-side parsing of both Excel (.xlsx, via a streaming reader) and CSV, through one row pipeline so both formats validate identically. **Delivered.**" |
| Background processing | "Not used at MVP scale" | Keep, but update the note: "Imports run inside the request. A district-month of expenditure detail parses, validates and commits in seconds. The upload path is a Route Handler rather than a form action specifically so it is not bound by the 1 MB action-body limit; the practical ceiling today is a 4 MB file, roughly 30,000 CSV rows or considerably more as .xlsx. A background queue remains the right answer if that ceiling is ever reached." |
| File storage | "Not used" | Unchanged — still correct, and now proven in the delivered pipeline. Strengthen the note: "Uploaded files are parsed and discarded. Confirmed in Milestone 2: the platform stores the validated data and the file's name, size and row count — never the document." |

**Add one row:**

| Layer | Technology | Notes |
|---|---|---|
| Import staging | A staging table, cleared on commit or cancel | The upload lifecycle spans several requests — upload, review the report, acknowledge warnings, choose how to handle a duplicate, commit. Parsed rows are held in a staging table between them, so a district reviews a validation report on Tuesday and commits on Wednesday without re-uploading. It also makes the commit atomic: a failure part-way leaves nothing behind. **Delivered.** |

**§3.2 "How it scales".** Add a fourth bullet:

> **Adding volume** is handled by server-side paging, sorting and export on the periodic data. The master-data tables load every row and page in the browser, which is correct at a few hundred rows. Expenditure detail is keyed fund × function × object × cost center × project and runs to tens of thousands of rows per district-month before versions multiply it, so those tables page, sort, search and export in the database and stream the result. A district can hold years of history without any screen slowing down.

### §4 — MVP Scope at a Glance

Rewrite the status column. Suggested table:

| Capability | Status | Notes |
|---|---|---|
| Secure login & user accounts | DELIVERED M1 | Email and password, invitations, self-service reset, account lockout (§5.1). |
| My account page | DELIVERED M2 | Closes a v1.1 known gap — change your own name and password in-app (§5.1). |
| Multi-district data isolation | DELIVERED M1 | Enforced on every query, including all Milestone 2 data (§5.2). |
| Roles & permissions | DELIVERED M1 | Five roles (§5.3). |
| External user access | DELIVERED M1 | Time-boxed, district-approved (§5.4). |
| District master data management | DELIVERED M1 | Six types, CSV import and export (§5.14). |
| Platform configuration console | DELIVERED M1 | Six global lookup lists (§5.14). |
| Financial activity codes | DELIVERED M2 | A seventh platform list: which object codes mean "transfer" (§5.20). |
| Sortable, paginated tables with CSV export | DELIVERED M1 | Every list behaves the same way (§5.15). |
| Audit log | DELIVERED M1 | Extended in M2 to cover the whole data lifecycle (§5.12). |
| **File upload in your format** | **DELIVERED M2** | Six importers, Excel or CSV, blank template per dataset (§5.5). |
| **Validation engine** | **DELIVERED M2** | Seven layers, errors versus warnings, downloadable report (§5.6). |
| **Reporting-period snapshots** | **DELIVERED M2** | Every period preserved; nothing overwrites (§5.7). |
| **Duplicate detection & re-upload prompt** | **DELIVERED M2** | Replace, cancel, or keep as a new version (§5.8). |
| **Version history & rollback** | **DELIVERED M2** | View, compare and restore any prior version (§5.9). |
| **Periodic data browse & export** | **DELIVERED M2** | Server-side paged, sorted, searched and exported (§5.19). |
| **Financial policies & thresholds** | **DELIVERED M2** | 27 district-configurable settings in four groups (§5.16). |
| **Alerts & status indicators** | **DELIVERED M2 (engine)** | 24 alerts evaluated from the district's own thresholds. The engine is built and verified; the screens that display alerts arrive with the dashboards in Milestone 3 (§5.17). |
| **Forecasting** | **DELIVERED M2 (engine)** | Year-end projection and multi-year fund-balance projection (§5.18). |
| Core dashboards | MILESTONE 3 | Executive, Revenue, Expenditure, Fund Balance, Cash Position. Layouts previewable today on sample data (§5.10). |
| Exports | PART-DELIVERED | CSV is live across master data, configuration, the audit log and all periodic data. Excel and PDF export are Milestone 3 (§5.11). |
| Admin console | DELIVERED M1 | Manage districts, users and reference lists (§5.14). |

**Deferred list.** Update to: *"Grants and Capital Projects modules (V2); enrollment data and dashboards; direct integration with source financial systems; cross-district benchmarking; multi-factor authentication; single sign-on; cost-center-level access scoping; scheduled email notifications; saved views and custom report builders."*

Note that period-over-period and year-over-year trend analytics have effectively moved **forward** — the data and the engines for them exist; they need dashboard surfaces, which is Milestone 3.

### §5.1 — User Accounts

Change status to `DELIVERED` (unchanged from M1) and **replace the "Known gap" callout** with:

> **Gap closed in Milestone 2.** There is now a "Your account" page. Any signed-in user can change their own first and last name and set a new password from inside the application, without going through the forgot-password flow. Changing your own password signs out your other sessions, exactly as a reset does. Delivered at no extra cost, as proposed.

### §5.2 — Multi-District Architecture

Status stays `DELIVERED`. Add one bullet:

> Every table added in Milestone 2 — import batches, staged rows, validation findings, versions, and all five periodic datasets — is district-scoped at the same data-access layer, not screen by screen. There is no separate code path for financial data.

### §5.3 — Roles & Permissions

Add rows to the permission matrix for the capabilities that now exist. The `M2` markers on Upload data / Run validation / Publish / Manage version history should be **removed** — those features are built.

New rows to add:

| Capability | Platform Admin | District Admin | Finance User | Viewer | External User |
|---|---|---|---|---|---|
| Browse & export periodic data | ✓ | ✓ | ✓ | ✓ | View Only + Full |
| View financial policies | ✓ | ✓ | ✓ | ✓ | View Only + Full |
| Edit financial policies | ✓ | ✓ | — | — | — |
| Manage financial activity codes | ✓ | — | — | — | — |

**Add a "Two decisions worth reading twice" style note:**

> **Who sets the thresholds.** Financial policies — the thresholds that decide when a number is worth worrying about — are **readable by anyone who can see the dashboards, and editable by District Administrators only.** That split is deliberate and it is the opposite of the master-data call. Master data is day-to-day finance work, so it sits with Finance Users. A threshold is a statement of the district's own risk appetite, closer to board policy than to bookkeeping, so it sits with the administrator — but a Viewer can still see the rules they are being measured against, which is the point of publishing them at all. If you would rather Finance Users could tune thresholds too, that is a permissions change, not a rebuild.

### §5.4 — External User Access

Status unchanged. Add one clarifying line: a Full Access grant now genuinely carries upload, validation and version-management rights, because those features exist; a View Only grant can browse and export periodic data but cannot upload, commit, or restore a version. No change was needed to make that true — the permissions were defined in Milestone 1 and the new features consume them.

### §5.5 — Data Import & Upload

**Status: `MILESTONE 2` → `DELIVERED`.** Delete the "Not built yet" callout. Rewrite substantially:

> **Six importers, one dataset per file.** This is the answer to the question v1.1 named as blocking this milestone. The upload screen offers six import types, grouped by rhythm:
>
> | Import type | Rhythm | What it carries |
> |---|---|---|
> | Revenue Budget | Annual | The adopted revenue budget, by fund and revenue source |
> | Expenditure Budget | Annual | The adopted expenditure budget, by fund, function and object |
> | Opening Fund Balance | Annual | Prior-year components and the beginning balance, by fund |
> | Revenue Detail | Monthly | Budget, actual month-to-date and year-to-date, by fund, source and project |
> | Expenditure Detail | Monthly | Budget, actual, encumbrances and available budget, by fund, function, object, cost center and project |
> | Cash Position | Monthly | Beginning cash, receipts, disbursements, ending cash and investments, by fund |
>
> - **Excel or CSV.** Both formats run through the same row pipeline, so a file validates identically whichever way it arrives.
> - **A blank template per import type**, generated from the same field definitions the parser reads, so a template can never offer a column the importer would reject.
> - **The user chooses the fiscal year and reporting period** on the upload form. Annual imports take no period. Monthly periods are counted from the district's own fiscal-year start month, so a district on an August calendar gets Period 1 = August without configuration.
> - **The importer understands real spreadsheets.** Excel serial dates are parsed to real dates. Whitespace and casing are normalised. Column headers are matched against the canonical label and a set of accepted aliases, because the client's own workbook heads the same column two different ways on two different sheets.
> - **Leading zeros are recovered.** A fund code of `0101` typed into a numeric Excel cell has already lost its zero before any software reads it. Rather than pretend otherwise, the importer resolves the code against the district's own master data and retries zero-padded to the master's own width, then tells the user it did.
> - **A missing required column is refused immediately**, naming the column and, where a similar unrecognised column is present, pointing at it as a likely rename.
> - **The uploaded file is parsed and not retained** (§5.9).
> - **Size.** A single file may be up to 4 MB — roughly 30,000 rows of CSV, or considerably more as .xlsx, which compresses. That is comfortably past a realistic district-month. If a district ever exceeds it, the fix is to split by fund or save as .xlsx; the platform is already structured so a chunked upload can be added without redesign.

### §5.6 — Data Validation Engine

**Status: `MILESTONE 2` → `DELIVERED`.** Delete the "Not built yet" callout. The v1.1 layer table is still substantially correct — keep it, with these corrections:

- **Remove** "all expected sheets present" from the Structure row. Uploads are one dataset per file; there are no sheets to check. Structure now checks: the file is readable, every required column is present, and unrecognised columns are surfaced.
- **Add a row** for the ordering guarantee — this is a real quality property and worth stating:

| Validation layer | What it checks |
|---|---|
| (ordering) | Layers run in dependency order, and a row that fails one is dropped from the layers after it. One typo produces one finding, not six consequential ones. |

- **Calculation checks:** state the tolerance. "Derived columns are recomputed and compared to a tolerance of one cent — enough to absorb a district's own rounding, not enough to wave through a real discrepancy. A mismatch is an Error, not a warning: the decision was that a figure that does not add up should be fixed, not acknowledged."
- **Business rules:** these now read the **district's own thresholds** (§5.16), not fixed defaults. Say so explicitly: "Configurable anomaly checks, evaluated against the thresholds the district itself has set. Each of the four import-validation flags — over-collection, spend above budget, budget overcommitted, encumbrances above available budget — can be switched off by a district that does not want to see it."

**Validation report.** Keep the v1.1 bullets, they are accurate, and add:

> - The report lives on its own page and survives the session: a district can read it, correct the file over the following days, and come back to the same batch. Findings are stored, not held in memory.
> - Warnings are acknowledged in one action, which is recorded in the audit log with the number acknowledged.
> - Re-validation can be run against the same staged file after a threshold change, without re-uploading.

**Replace the "Now confirmed" callout** with:

> **Delivered.** The engine validates against both tiers of reference data — the six platform-managed global lists and the district's own master data — exactly as the two-tier design intended. A verification script plants one defect per layer in a fixture file and asserts that each produces exactly one finding, naming its row, column and value.

### §5.7 — Reporting Periods & Historical Data Preservation

**Status: `MILESTONE 2` → `DELIVERED`.** Delete the "Not built yet" callout. Corrections to the body:

- **Enrollment / survey periods:** v1.1 says the model accommodates survey periods. That is still true — the period axis has a survey branch reserved — but **no enrollment importer exists and enrollment is deferred**. Restate as: *"The period model accommodates monthly periods and annual datasets. A survey-period branch is reserved for enrollment, which is deferred (§10) — the axis will not need rebuilding when it lands."*
- **Snapshot Date:** the Opening Fund Balance import carries an Effective Date, which anchors the year. The generic per-upload "Snapshot Date" of v1.1 did not survive into the field tables — either drop the bullet or restate it around Effective Date.
- **Add:** *"Periods are counted from the district's own fiscal-year start month. A district whose year begins in August gets Period 1 = August, everywhere in the product, without configuration."*

### §5.8 — Duplicate Detection & Re-Upload Handling

**Status: `MILESTONE 2` → `DELIVERED`.** Delete the "Not built yet" callout. The v1.1 body is accurate and the delivered prompt uses the client's exact wording — say so:

> Delivered as specified, in the client's own words: *"This reporting period already has data uploaded. Do you want to replace the existing data, cancel the upload, or keep it as a new version?"*
>
> One addition worth noting. **Replace clears any manual fund-balance override for that period**, and the prompt says so before you confirm. An override is a correction to a figure derived from the numbers underneath; replacing those numbers may make the correction wrong, and silently carrying it forward would be the worst of the three options (§5.20).

### §5.9 — Version History

**Status: `MILESTONE 2` → `DELIVERED`.** Delete the "Not built yet" callout. The v1.1 body is accurate. Additions:

- **The version log is a log.** It is presented in the same shape as the audit log — a flat, filterable list of every upload for every period, showing dataset, fiscal year, period, version number, what happened (initial, replaced, new version, restored), row count, error and warning counts, file name, who committed it and when. Compare and Restore are per-row actions.
- **Compare** puts two versions of the same period side by side and reports rows added, removed and changed, field by field. Two versions of different periods cannot be compared — that is a category error, and the product says so rather than showing a meaningless diff.
- **Restore never mutates history.** Restoring v1 writes a *new* version that copies v1's rows and becomes current. v1 stays exactly as it was. Nothing in the version history is ever edited or deleted.
- **One version per period is current**, enforced by the database itself rather than by application code — the constraint cannot be violated even by a bug.
- **A caveat worth stating honestly:** a *Replace* supersedes the previous version's data. The version record — who, when, what file, how many rows, what the validation said — is kept permanently, but its rows are not, so a replaced version cannot be restored. *Keep as a new version* retains both sets of rows and is fully restorable. This is the difference between the two choices, and the upload prompt should be read with it in mind.

**Keep the "Confirmed: versions keep the data, not the document" callout verbatim** — it is still exactly true and has now been proven in the delivered pipeline.

### §5.10 — Dashboards & Visualisations

**Status: `MILESTONE 2 / 3` → `MILESTONE 3`.** Be direct about it. Suggested replacement callout:

> **Still Milestone 3, and now unblocked.** The district dashboard shows real master-data counts and recent activity. The financial dashboards still show sample data behind an on-screen banner.
>
> What changed in Milestone 2 is everything *behind* them. The calculations these dashboards will display — fund balance and reserve percentage, days of cash on hand, budget utilisation, available budget, net operating surplus, month-over-month change, year-end projection, three-year fund-balance projection, and 24 threshold alerts — are all built, and each is covered by a verification script that reproduces the client's own worked examples. Milestone 3 is now the work of putting them on screen, not of inventing them.

Then keep the five dashboard descriptions from v1.1 as the Milestone 3 specification, with two corrections:

- **Grants, Capital Projects & Enrollment** dashboards: move from "a later phase" to explicit **V2**, and note that grant and project spend is already collected against the unified Project master, so a Projects dashboard is buildable from data the platform holds today. Only enrollment has no source at all.
- **Status indicators:** name them. The delivered ladder is **Strong · Acceptable · Monitor · Action Required**, derived from the same thresholds the alerts use, so a status badge and the alert beside it can never disagree.

### §5.11 — Reports & Exports

Status stays `PART-DELIVERED`. Update "Available today":

> **Available today.** CSV export across the product: master data (all six types), platform configuration (all six global lists plus financial activity codes), the audit log, the version history, and **every periodic dataset**. Periodic exports are generated in the database and streamed, so a 50,000-row export does not depend on the browser holding the table. Every export honours the search, filters and sort currently applied.

Milestone 3 and Later phase lines are unchanged.

### §5.12 — Audit Log

Status stays `DELIVERED`. Update the counts and the coverage:

> - **Around forty distinct action types are logged**, up from thirty. Milestone 2 added the whole data lifecycle: file uploaded, file validated, warnings acknowledged, upload cancelled, data committed (recording the version number, the row count and which version it superseded), and version restored. It also added financial-policy changes and financial-activity-code changes, and self-service name, email and password changes from the new account page.
> - The v1.1 line *"Uploads, validations and version changes join the log as those features arrive in Milestone 2"* should be **deleted** — they have arrived.

Everything else in §5.12 is unchanged and still accurate.

### §5.13 — Notifications

**Status: `PART-DELIVERED` → keep `PART-DELIVERED`, but close the gap.**

- **Delete the "Known gap" bullet.** An in-app notification component now exists and is used across the product, replacing inline-only feedback on the import path.
- **Delivered:** transactional email over SMTP (invitations, password resets, external-access notifications), plus in-app confirmation of upload, validation, acknowledgement, commit, cancel and restore outcomes.
- **Later phase** (unchanged): scheduled email notifications — period reminders, "upload complete", "validation failed".

### §5.14 — Administration & Configuration

Status stays `DELIVERED`. Changes:

1. **Tier 1** gains a seventh list — see [§5.20 below](#520--financial-activity-codes-transfers--new). Update "six lists" to "six lookup lists, plus a seventh: Financial Activity Codes".
2. **Tier 2** drops to six types (see [B1](#b1-grants-and-capital-projects-become-one-projects-master)).
3. **Add the Projects consolidation note** drafted in B1.
4. The "use the round-trip" recommendation is unchanged and still true.
5. **Add:** *"Master data now has financial history behind it. A fund, function, object, cost center, project or revenue source that has been referenced by imported data cannot be deleted — deactivating it is the supported move, and the product says so rather than failing. Deletion remains available for a record that has never been used."*

### §5.15 — Data Tables, Search & Export

Status stays `DELIVERED`. Add the second table pattern:

> **Two table engines, one behaviour.** Master data, configuration, users and the audit log load their rows and page in the browser, which is right at their size. The periodic financial data pages, sorts, searches and exports **in the database**, because expenditure detail runs to tens of thousands of rows per district-month. The behaviour a user sees is identical — the same natural, numeric-aware ordering, the same blanks-last rule, the same rows-per-page control, the same export-what-you-see — but underneath, one loads everything and the other never does.
>
> The list at the end of §5.15 should now read: districts, district users, external-access grants, external users, all **six** master-data types, all six platform configuration lists, financial activity codes, the audit log, the version history, and all **six** periodic datasets.

### §6 — Data Model Overview

The v1.1 framing — three groups, first two built, third deferred — is now obsolete. **All three groups are built.** Rewrite the opening paragraph accordingly.

**Platform & account data** table: unchanged, all six rows still accurate.

**Global lookup lists** table: add a seventh row.

| List | Used by |
|---|---|
| Financial Activity Codes | Which object codes mean Transfers In, Transfers Out or Other Financing Sources. Read by the fund-balance and cash engines. |

**District master data** table: delete the Grant and Capital Project rows, add:

| Dataset | Grain (one row per…) | Key relationships |
|---|---|---|
| Project *(was "Grant" + "Capital Project")* | Project, keyed by a district-unique Project Number | Referenced by Revenue Detail and Expenditure Detail. The V2 Grants and Capital Projects modules will reference a Project rather than owning their own lists. |

**Periodic snapshot data** — change status from `PLANNED, MILESTONE 2` to `DELIVERED M2` and replace the table:

| Dataset | Grain (one row per…) | Rhythm |
|---|---|---|
| Budget Line | Fund × revenue source (revenue) or fund × function × object (expenditure), plus cost center and project | Annual (adopted budget) |
| Opening Fund Balance | Fund | Annual |
| Revenue Actual | Fund × revenue source × project × cost center | Monthly |
| Expenditure Actual | Fund × function × object × cost center × project | Monthly |
| Cash Position | Fund | Monthly |
| Fund Balance Override | Fund × period × corrected figure | As entered |

**Add a fourth group** — the import lifecycle tables — since they are what makes the pipeline auditable:

| Table | Purpose |
|---|---|
| Import Batch | One upload attempt: dataset, period, file name, size, rows parsed, error and warning counts, status, who uploaded it. Never the file itself. |
| Import Staging Row | Parsed rows held between upload and commit, so the lifecycle can span several requests. Cleared on commit or cancel. |
| Validation Finding | One finding from one layer: severity, layer, rule, row, column, value, and the plain-English message. Stored, so the report outlives the request. |
| Dataset Version | A committed snapshot: version number, whether it is current, what action created it, row and finding counts, file name, who committed it and when. Immutable. |

**Add a fifth group** — configuration a district owns:

| Table | Purpose |
|---|---|
| District Policy | The district's thresholds, in four groups (§5.16). One row per district; every unset value falls back to a sensible default. |
| Forecast Assumption | What a district assumes about the rest of the year, per revenue or expenditure category (§5.18). |
| Fund Balance Projection | A district's projected fund-balance components for a future year, by fund (§5.18). |

**Add the closing note:** *"Every periodic record carries its district, fiscal year, reporting period and version. That is what preserves history, isolates districts, and powers versioning and trend analysis. Money is stored as an exact decimal throughout — never as a floating-point number, because a rounding error in a reserve calculation is how a district stops trusting a platform."*

### §7 — The Upload → Validation → Publish Lifecycle

**Status: `MILESTONE 2` → `DELIVERED`.** Delete the "None of steps 1 to 7 is built yet" callout entirely. The eight steps are accurate as written. Add two notes:

> **Steps 1 and 2 happen in one request.** A district's question after an upload is "is it clean?", not "did the bytes arrive?" — so validation runs immediately and the result screen is the validation report.
>
> **Step 6 is atomic.** The commit — superseding the old version, writing the new one, writing every row, clearing the staging table — happens in a single database transaction. A failure part-way through leaves the district exactly where it started, with nothing half-imported. This is covered by a verification script that deliberately fails a commit mid-flight and asserts nothing was left behind.

### §8 — Security, Privacy & Compliance

Mostly unchanged. Edits:

- **Strict access control:** add that every Milestone 2 table is scoped at the same layer.
- **File handling:** strengthen from a promise to a fact. *"Confirmed in Milestone 2. Uploaded files are parsed and discarded. The platform keeps the validated data, the file name, its size and its row counts recorded against the version. There is no file store, therefore no archive of district spreadsheets to secure or to leak."*
- **Backups & recovery:** unchanged — automated backups with point-in-time recovery is still Milestone 3; version history is now delivered as the application-level safety net.
- **Add a bullet — auditability of derived figures:**
  > **Derived figures carry their provenance.** Where the platform calculates a number rather than reading it from a file — fund balance is the main one — a District Administrator may override it, and an override requires a written reason, records who entered it, is versioned with the period it corrects, and is labelled as an override wherever the figure appears. A manual correction to a financial figure is the first thing an auditor asks about, so the answer is stored alongside it (§5.20).

### §9 — Non-Functional Requirements

Update two rows:

| Attribute | v1.2 target |
|---|---|
| Performance | "Master-data imports complete in seconds. A district-month of financial data — parse, validate against seven layers, and commit — completes in seconds at realistic district volumes, inside a single request. Periodic tables page, sort and export from the database, so screen response does not degrade as years of history accumulate. Dashboards render within a couple of seconds (Milestone 3 target)." |
| Data retention | "All periods and versions retained by default. A replaced version keeps its record permanently but not its rows; a version kept alongside another keeps both. Original uploaded files are not retained (§5.9)." |

Everything else is unchanged.

### §10 — Phased Roadmap

Restructure the phase table:

| Phase | Focus | Key items |
|---|---|---|
| **Phase 1 (MVP)** `DELIVERED` | Platform foundation *(Milestone 1)* | Unchanged from v1.1. |
| **Phase 1 (MVP)** `DELIVERED` | Data pipeline, policies and version history *(Milestone 2)* | Six importers, Excel and CSV, with blank templates; the seven-layer validation engine with a stored, downloadable report; reporting-period snapshots; duplicate detection and the three-way prompt; version history with compare and restore; periodic data browse and CSV export; district financial policies and thresholds; the 24-alert catalogue; year-end and multi-year forecasting; financial activity codes; the fund-balance engine with auditable overrides; the account page; in-app notifications; audit coverage of the whole lifecycle. |
| **Phase 1 (MVP)** `IN FLIGHT` | Dashboards, documentation and launch *(Milestone 3)* | Five dashboards on real data with the alerts and status indicators already computed; Excel and PDF export; automated backups and a security review; deployment; documentation; user acceptance testing and launch. |
| **Phase 2** | More data & insight | Enrollment import and dashboard; period-over-period and year-over-year trend views; variance and comparison reports; scheduled email notifications; MFA; cost-center-level access scoping; saved and custom report views. |
| **V2 modules** | Subscribable add-ons | Grants module (award tracking, draw-down against award, grant-level reconciliation against detail rows) and Capital Projects module (project budget, percent complete, completion tracking), both building on the unified Projects master. |
| **Phase 3** | Automation & reach | Direct integration with source financial systems; cross-district benchmarking; a configurable validation-rules interface; white-label theming; advanced compliance reporting; single sign-on; background job processing and original-file retention if volumes or audit requirements demand them. |

Note in passing that **thresholds and forecasting moved out of Phase 3 and into the MVP** — see [Part F](#part-f--scope-ledger-added-removed-deferred).

### §11 — Assumptions

- "The Excel format provided is representative…" → *"The file formats provided are representative, and are now transcribed field by field into the platform. Districts export from their financial systems into these templates, one dataset per file, in Excel or CSV."*
- Master-data list → six types, and add: *"Grants and capital projects are maintained as Projects; the dedicated modules are V2."*
- Add: *"The Florida Red Book is the standardised core. Which object codes represent transfers is a fact about that chart of accounts rather than a district preference, so it is maintained centrally and shared by every district (§5.20)."*
- Add: *"Threshold defaults ship from the client's own workbook, so a district that never opens the policies screen still behaves sensibly."*
- Keep: no Redis queue, no object storage, version history retains parsed data not files.

### §12 — Confirmed Decisions & Remaining Questions

**Move into Confirmed:**

| Question | Decision |
|---|---|
| Separate files or one combined workbook? | **Separate — one dataset per file.** Six importers. Delivered (§5.5). |
| Should the "my account" page be folded into Milestone 2? | **Yes.** Delivered at no extra cost (§5.1). |
| Should replaced data remain recoverable through version history? | **Delivered**, with one honest caveat: *keep as a new version* is fully restorable; *replace* keeps the record but not the rows (§5.9). |

**Still open** — carry forward from v1.1: Excel and PDF export at launch versus CSV being enough; SSO for external users; sizing; which datasets are must-have for the MVP dashboards; state-specific compliance; hosting and data residency. Add the new ones in [Part H](#part-h--open-questions-for-gary-in-v12).

### §13 — Next Steps

Rewrite:

1. Review this document alongside the updated Milestone Plan (v1.2), and approve Milestone 2.
2. **Supply the transfer object codes and ranges** for Transfers In, Transfers Out and Other Financing Sources. This is the one input that stands between the calculated fund balance and a fully trustworthy reserve percentage on the Milestone 3 dashboards, and it can be loaded in minutes once the list exists (§5.20).
3. **Review the financial policy defaults** for at least one district. They currently ship from the workbook; a district's own numbers make every alert on the Milestone 3 dashboards meaningful on day one (§5.16).
4. **Confirm the Milestone 3 dashboard priorities** — which of the five, and which figures on each, matter most.
5. Fund Milestone 3, and we build the dashboards on top of engines that are already computing.

---

## Part D — New sections to ADD to the Feature Specification

These are genuinely new capabilities with no v1.1 counterpart. They are the largest part of what Milestone 2 delivered beyond its brief, and they should be numbered as new subsections of §5.

### §5.16 — Financial Policies & Thresholds `DELIVERED M2` — NEW

> Every alert, every status badge and several validation warnings in this platform answer the same question: *is this number worth worrying about?* That question has no universal answer. A district with a five per cent reserve target and one with a two per cent statutory floor are not in the same position at three per cent. So the thresholds are the district's own, declared once and read by everything.
>
> **Four groups, 27 settings.**
>
> | Group | What it governs |
> |---|---|
> | **Revenues** | Revenue variance against budget (warning and critical), forecast variance (warning and critical), month-over-month change, and whether over-collected lines are flagged during import. |
> | **Expenditures** | Budget utilisation (warning and critical), month-over-month increase (warning and critical), forecast variance (warning and critical), and four import-validation switches: flag budget overcommitted, flag spend above budget, flag encumbrances above available budget, and whether to exclude salary objects from month-over-month comparison. |
> | **Cash** | Days cash on hand (warning and critical), and cash decrease against the previous month (warning and critical). |
> | **Fund Balance** | District target, board policy minimum, state minimum, current warning and critical thresholds, and forecast warning and critical thresholds. |
>
> - **Every setting ships with the workbook's own default**, so a district that never opens this screen still alerts sensibly from its first upload.
> - **The order is validated.** A critical threshold that would fire before its warning is rejected with an explanation — otherwise a district gets a red alert having never seen an amber one, which is precisely the failure thresholds exist to prevent. The check knows which way each number runs: utilisation and variance grow toward trouble, days of cash and reserve percentage shrink toward it.
> - **One source of truth.** The same stored thresholds drive the import-time business-rule warnings (§5.6), the alert catalogue (§5.17) and the status ladder on the dashboards (§5.10). There is no second copy to drift.
> - **Readable by anyone who can see a dashboard; editable by District Administrators.** A Viewer should be able to see the rules they are being measured against.
> - Every change and every reset-to-defaults is written to the audit log.

### §5.17 — Alerts & Status Indicators `DELIVERED M2 (engine)` — NEW

> **Twenty-four alerts, declared rather than coded**, evaluated against the district's own thresholds (§5.16) and its own data.
>
> | Group | Count | Examples |
> |---|---|---|
> | Revenue | 5 | Revenue below budget · Revenue above budget · Forecast revenue below budget · Forecast revenue above budget · Significant month-over-month change |
> | Expenditure | 8 | Budget utilisation warning and critical · Budget exceeded · Negative available budget · Encumbrances exceed available budget · Forecast exceeds budget · Material forecast variance · Significant month-over-month increase |
> | Cash | 3 | Days cash on hand warning and critical · Significant cash decrease |
> | Fund Balance | 8 | Reserve below target, warning and critical · Forecast reserve below target, warning and critical · Fund balance falling · Components exceed the projected balance |
>
> Three properties worth stating:
>
> - **One condition raises one alert.** The utilisation warning stops exactly where the critical begins, and the negative-available-budget alert suppresses the encumbrance alert that would only say the same thing more quietly. A district that sees three alerts has three problems.
> - **A missing figure is silence, never reassurance.** Where the platform cannot yet compute something — no cash file for the month, no forecast assumptions entered — the alert does not fire *and does not report all-clear*. "We cannot say yet" and "you are fine" are different answers and the platform never confuses them.
> - **Status labels come from the same thresholds.** **Strong · Acceptable · Monitor · Action Required** is derived from the fund-balance thresholds the alerts read, so a status badge can never contradict the alert printed beside it.
>
> **Status: engine delivered, screens Milestone 3.** The catalogue is complete and each of the 24 is covered by a verification fixture built to trip exactly it and stay silent on the other 23. What arrives in Milestone 3 is the alert panel and the badges on the dashboards.

### §5.18 — Forecasting `DELIVERED M2 (engine)` — NEW

> Version 1.1 put forecasting in Phase 3. It has been built in Milestone 2, because roughly a third of the alert catalogue is forecast-based and could not fire without it.
>
> - **Year-end projection.** Actual year-to-date, extrapolated to the full year, per category. Revenue projects by the district's own assumed growth percentage per revenue type; expenditure projects against a figure the district enters per object type. Both are compared to budget, and the variance drives the forecast alerts.
> - **Categories are the platform's own global lists** — revenue types for revenue, object types for expenditure. That is not a convenience: it means an assumption is attached to the same category the actuals roll up by, so a forecast and an actual compare without a translation table between them.
> - **Districts choose what to watch.** An assumption can be marked unmonitored, and the forecast ignores it.
> - **Multi-year fund-balance projection.** A district enters projected restricted, committed, assigned and nonspendable components for future years; the platform derives the projected unassigned reserve and its percentage. Per the client's own note, multi-year projection and the projected unassigned reserve apply to the General Fund only — with All Funds selected, the platform shows current and projected balances by fund but does not calculate a single combined reserve percentage.
> - **The components check.** If projected components add up to more than the projected balance, the unassigned reserve would be negative. That is raised as a critical alert rather than displayed as a number.
>
> **Status: engine delivered, screens Milestone 3.** The assumptions a district enters are held and the projections compute; the screen for entering them and the charts that display them arrive with the dashboards.

### §5.19 — Periodic Data Browse & Export `DELIVERED M2` — NEW

> Once data is committed, a district can read it — not only in aggregate on a dashboard, but row by row.
>
> - **One page per dataset**, one reporting period at a time, showing the **current version only**. Superseded versions live in the version history; putting two answers on one screen would be worse than useful.
> - **Server-side paging, sorting, searching and export.** Expenditure detail runs to tens of thousands of rows per district-month; none of it is loaded into the browser to page it.
> - **Free-text search across the row's codes and names**, so "transportation" finds the rows whether the district thinks in codes or in names.
> - **CSV export honours the current period, search and sort**, and is generated in the database rather than from the loaded page.
> - Codes are shown with their names resolved, so a district reads "0101 — General Fund", not an internal identifier.

### §5.20 — Financial Activity Codes & Fund Balance `DELIVERED M2` — NEW

Two things belong together here, because the first exists to make the second correct.

> **Financial Activity Codes — a seventh platform-managed list.**
>
> Money moves in a district's books without being earned or spent: transfers between funds, and other financing sources. In the chart of accounts these are not separate columns — they are ordinary revenue and expenditure lines, told apart **only by their object code**. A fund-balance calculation that does not know which codes mean "transfer" will count a transfer between two funds as revenue in one and spending in the other, and be wrong in both.
>
> So the platform maintains a list of which object codes — single codes or inclusive ranges — mean **Transfers In**, **Transfers Out**, or **Other Financing Sources**. Ranges are supported because a chart of accounts groups by prefix: "9700–9799 are all transfers out" is how the Red Book actually reads, and enumerating a hundred codes to say it would guarantee one gets missed.
>
> This is a **platform-managed** list, like the other six, and for the same reason: the Red Book is the standardised core, so which codes are transfers is a fact about the chart of accounts rather than a district's preference. Every district shares it; no district can bend it.
>
> **⚠ This list is the one outstanding input from you.** Until it is populated, the calculated fund balance is missing a term — not merely incomplete, but wrong, because inter-fund movement reads as earned or spent. The platform is built to label the figure as provisional until the codes exist. Supplying them is a five-minute job and it is what turns the Milestone 3 reserve percentage from indicative into authoritative.
>
> **Fund balance, calculated.**
>
> Ending fund balance is derived, not uploaded: opening balance, plus revenues, minus expenditures, plus transfers in and other financing sources, minus transfers out — the identity §5.6 already names. It is computed at read from indexed rows rather than stored, so it can never fall out of step with the data underneath it, and restoring an earlier version restores the balance that was true then, automatically.
>
> **Overrides, with provenance.** A District Administrator can correct any derived component — total, unassigned, nonspendable, restricted, committed, assigned — where the district knows something the numbers do not, such as an audit adjustment. An override:
>
> - **requires a written reason.** Not optional. An override on a derived financial figure is the first thing an auditor asks about, and "why" is the question.
> - **records who entered it and when.**
> - **is versioned with the period it corrects**, so restoring an earlier version restores the corrections that were true then.
> - **is cleared by a Replace**, because the numbers underneath have changed and the correction may no longer apply — and the duplicate prompt says so before you confirm (§5.8).
> - **is labelled as an override wherever the figure is shown**, so no one reads a corrected number as a computed one.
>
> **Status:** the calculation, the override storage and the provenance rules are delivered and verified against the client's own worked example. The screen for entering an override arrives with the fund-balance dashboard in Milestone 3.

---

## Part E — Milestone Plan v1.2: section-by-section edits

### Cover page

- Version → **1.2**
- Status → **Milestone 2 delivered** (or *"Milestones 1 and 2 delivered"*)
- Total price → **$4,250** ($3,500 base + $250 external user access + $500 policies, alerts & forecasting)
- Timeline → keep "about 3 to 4 weeks" only if it is still honest against actual elapsed time; otherwise state actual duration for M1 + M2 and the remaining estimate for M3.

### "What changed in Version 1.2" box

Use a trimmed version of [Part A](#part-a--executive-summary-of-milestone-2), plus the commercial lines:

- Milestone 2 is complete and delivered; its scope below is restated to match what was actually built.
- The blocking question — one combined workbook or one file per dataset — is answered and built: **six importers, one dataset per file.**
- **Thresholds, alerts and forecasting were moved into the MVP from Phase 3**, agreed as added scope at **$500**. Every other growth in this milestone — six importers instead of four, a second file format, staged ingest, the fund-balance engine and its override — is absorbed at no extra charge.
- **Grants and Capital Projects were consolidated into one Projects master**, and the dedicated modules became V2. This *reduced* Milestone 2's build while preserving the data.
- Two Milestone 3 items — in-app notifications and the account page — were pulled forward and delivered at no extra cost, and Milestone 3 is lighter as a result.

### Overview

Restate: two of three milestones complete. The platform now has districts, users, roles, external access, master data, a full audit log, **a working data pipeline with validation and version history, district-configured thresholds, alerting and forecasting engines, and browsable financial data**. What remains is Milestone 3: putting it on screen, exporting it, and going live.

### Milestone 1 section

Two edits only:

1. "Configurable master data per district" — restate to **six** types, with a note that Grants and Capital Projects were consolidated into Projects during Milestone 2 (§5.14 of the Spec).
2. Add `COMPLETE — accepted` to the heading if Milestone 1 has been formally approved.

### Milestone 2 section — `COMPLETE`

Replace the forward-looking bullets with a delivered list. Suggested:

> **Milestone 2: Data Pipeline, Policies and Version History** `COMPLETE`
> *Duration: about 2 weeks · Delivered · Payment: 40% ($1,400)*
>
> *Getting clean, trusted data in, keeping its history, and teaching the platform what "worrying" means for this district.*
>
> - **Six importers**, one dataset per file, Excel or CSV: Revenue Budget, Expenditure Budget and Opening Fund Balance (annual); Revenue Detail, Expenditure Detail and Cash Position (monthly). Each with a downloadable blank template generated from the same definitions the parser reads.
> - **A seven-layer validation engine** — structure, type and format, controlled vocabulary, referential integrity, calculation checks to the cent, configurable business rules, and duplicate rows — running against both the platform's global lists and the district's own master data. Every finding names the row, the column, the offending value and what is wrong with it.
> - **A validation report that outlives the session**, separating blocking Errors from acknowledgeable Warnings, viewable on screen and exportable, with re-validation available without re-uploading.
> - **Reporting-period snapshots.** Every period preserved, counted from the district's own fiscal-year start month.
> - **Duplicate detection** on re-upload, in your exact words, with Replace, Cancel and Keep as a new version.
> - **Version history with compare and restore.** A flat, filterable, exportable log; a field-by-field diff between any two versions of a period; and restore-as-a-new-version, so history is never mutated. Exactly one current version per period, enforced by the database itself.
> - **An atomic commit.** A failure part-way through leaves the district exactly where it started.
> - **Periodic data browse and CSV export**, paged, sorted and searched in the database so a 50,000-row dataset does not depend on the browser.
> - **District financial policies:** 27 thresholds in four groups, with the workbook's defaults, order validation, and one source of truth shared by the validator, the alerts and the status indicators.
> - **A 24-alert catalogue** across revenue, expenditure, cash and fund balance, evaluated against the district's own thresholds.
> - **Forecasting:** year-end projection by category, and multi-year fund-balance projection with a derived unassigned reserve percentage.
> - **The fund-balance engine**, including transfer classification by object code and auditable manual overrides with a required reason.
> - **Financial Activity Codes**, a seventh platform-managed global list.
> - **The account page** — change your own name and password in-app. Closes a Milestone 1 gap, delivered at no extra cost as proposed.
> - **In-app notifications**, closing the second Milestone 1 gap, at no extra cost.
> - **The whole data lifecycle in the audit log** — upload, validate, acknowledge, commit, cancel, restore, plus policy and configuration changes. Around forty action types, up from thirty.
> - **Nine verification scripts** covering fiscal periods, dataset definitions, import parity between Excel and CSV, validation findings, versioning invariants, commit atomicity, the fund-balance arithmetic against your own worked example, browse and export, policies, forecasting, and all 24 alerts.
>
> **Deliverable. Delivered.** A district uploads its financial data, sees it validated against the chart of accounts and its own master data, resolves errors, acknowledges warnings, chooses how to handle a re-upload, browses and exports what landed, and keeps versioned history it can compare and roll back — with thresholds and alerting configured to its own risk appetite.

**Add a "Scope changes in Milestone 2, for the record" box**, mirroring the one Milestone 1 carried — it worked well and Gary knows the format:

> **Scope changes in Milestone 2, for the record**
>
> - **Added scope, agreed at $500: financial policies, alerts and forecasting.** The Feature Specification had all three in Phase 3. The import workbook assumes them in the MVP dashboards, and roughly a third of the alert catalogue cannot fire without a forecast, so they moved into this milestone. Three substantial modules — 27 configurable thresholds, 24 alerts, and two projection engines — charged at $500 and added to the Milestone 2 payment.
> - **Grew without a change of price:** the dataset count went from the four this milestone was priced against to six, with two annual budget files at different grains, a second accepted file format, staged ingest for the multi-request lifecycle, and an auditable manual override on a derived figure.
> - **Reduced, deliberately:** Grants Activity, Capital Projects Activity and Enrollment were deferred, and the Grants and Capital Projects masters were consolidated into one Projects list. This removed three importers, three tables and a cross-checking layer — and cost almost nothing, because Project is a required column on both detail files, so grant and project spend already arrives tagged. Only enrollment has no other source.
> - **Delivered early at no extra cost:** the account page and the in-app notification system, both Milestone 1 gaps. Milestone 3 is correspondingly lighter.

### Milestone 3 section — `NEXT`

Restate what is left, and make clear how much of it is now display work rather than invention:

> **Milestone 3: Dashboards, Documentation and Launch** `NEXT`
> *Duration: about 1 to 1.5 weeks · Payment: 30% ($1,050)*
>
> - **Five dashboards** — Executive, Revenues, Expenditures, Fund Balance and Cash Position — on real uploaded data, with fiscal-year, period and fund filters and drill-down to the underlying rows. The calculations behind every figure are built and verified; this is the work of putting them on screen.
> - **The alert panel and status indicators** on those dashboards, driven by the catalogue and thresholds already delivered.
> - **The forecast assumptions screen** and the multi-year projection view, on the engine already delivered.
> - **The fund-balance override screen**, on the storage and provenance rules already delivered.
> - **Exports to Excel and PDF.** CSV is already live everywhere.
> - **Automated backups and a security review.**
> - **Deployment to Vercel.**
> - **Documentation:** setup and deployment guides, the database schema, an API reference, and an architecture overview — including how to add a district, add a state, and extend the validation rules and thresholds.
> - **User acceptance testing and launch support.**
>
> **Removed from this milestone:** the audit log (delivered in Milestone 1); the account page and in-app notifications (delivered in Milestone 2); and the alert, forecast and fund-balance *logic*, which is delivered — only the screens remain.
>
> **One input needed from you before this milestone can be fully authoritative:** the transfer object codes and ranges (§5.20 of the Feature Specification). Without them the reserve percentage ships behind a provisional label.

### Payment Schedule

Update the status column: Milestone 1 `DELIVERED`, Milestone 2 `DELIVERED`, Milestone 3 `NEXT`. Base total unchanged at $3,500 split 30/40/30. Add a second added-scope line beneath the external-access one:

| Milestone | Timeline | Share | Payment | Status |
|---|---|---|---|---|
| 1. Platform Foundation | ~1 week | 30% | $1,050 | DELIVERED |
| 2. Data Pipeline, Policies and Version History | ~2 weeks | 40% | $1,400 | DELIVERED |
| 3. Dashboards, Documentation and Launch | ~1–1.5 weeks | 30% | $1,050 | NEXT |
| **Base total** | | **100%** | **$3,500** | |
| Added scope: external user access *(agreed separately, delivered in Milestone 1)* | — | — | $250 | DELIVERED |
| Added scope: financial policies, alerts & forecasting *(agreed separately, delivered in Milestone 2)* | — | — | $500 | DELIVERED |
| **Total** | | | **$4,250** | |

**Rewrite the "In plain terms" paragraph** to say plainly what was charged and what was not:

> **In plain terms.** The base fee is unchanged: $3,500, split 30/40/30 across the three milestones exactly as agreed before Milestone 1 began. There have been two additions, each quoted and agreed before the work started: external user access at $250, and the financial policies, alerting and forecasting modules at $500 — the latter specified as Phase 3 in the Feature Specification and moved into the MVP because the dashboards assume them.
>
> A good deal more was absorbed at no additional charge: the dataset count grew from four to six, a second file format was added, the fund-balance calculation engine and its auditable override were built, a seventh platform configuration list was added, and both of the known gaps flagged in Milestone 1 — the account page and in-app notifications — were closed. Milestone 3 is lighter as a result.

### Assumptions

- Six importers, one dataset per file, Excel or CSV.
- Global lookup lists are platform-managed: six, plus financial activity codes.
- Each district's master data is six types, configurable on top of them; grants and capital projects are maintained as Projects and the dedicated modules are V2.
- Threshold defaults ship from the client's workbook and are then the district's to tune.
- Transfer object codes are supplied by the client; until they are, the calculated fund balance is labelled provisional.
- Version history retains the parsed data, not the original file. Unchanged.
- No Redis queue and no object storage at MVP volumes; the practical single-file ceiling is 4 MB.

### Next Steps

1. Review Milestone 2 and approve it. The updated Feature Specification (v1.2) describes everything that was built.
2. Supply the transfer object codes and ranges, so Milestone 3's fund-balance figures ship authoritative rather than provisional.
3. Review the financial policy defaults for at least one district.
4. Confirm the Milestone 3 dashboard priorities.
5. Fund Milestone 3.

---

## Part F — Scope ledger: added, removed, deferred

This is the source table for both documents' scope boxes, and for the commercial conversation.

### Added to Milestone 2, beyond the v1.1 brief

| Item | Where it came from | Weight |
|---|---|---|
| Financial policies & thresholds — 27 settings, four groups, validated ordering | Phase 3 in Spec §10 | Substantial |
| Alert catalogue — 24 alerts across four groups | Phase 3 / Phase 2 in Spec §10 | Substantial |
| Forecasting — year-end and multi-year fund-balance projection | Phase 3 in Spec §10 | Substantial |
| Financial Activity Codes — a seventh global list, with ranges | Not in v1.1 at all | Moderate |
| Fund-balance engine with transfer classification and auditable overrides | Not in v1.1 — v1.1 assumed fund balance was uploaded | Substantial |
| Two importers instead of one for "budget" — the two grains genuinely differ | Priced as four datasets, built as six | Moderate |
| Cash Position importer | Omitted from the working list; required by the fund-balance calculation | Moderate |
| CSV accepted alongside Excel on every importer | v1.1 said Excel only | Small |
| Periodic data browse with server-side paging, sorting, search and export | Implied by "drill-down", not specified | Moderate |
| Import staging, so the lifecycle can span several requests | Implied by Spec §7, not specified | Moderate |
| In-app notification system | v1.1 known gap, proposed for M2 at no cost | Small — free |
| Account page | v1.1 known gap, proposed for M2 at no cost | Small — free |

### Removed / deferred from Milestone 2

| Item | Where it went | Effect |
|---|---|---|
| Grants Activity importer + table + dashboard | **V2 module** | Grant spend still arrives tagged on every detail row. What is genuinely absent: award-level draw-down reconciliation. |
| Capital Projects Activity importer + table + dashboard | **V2 module** | Project spend still arrives tagged. Absent: project budget and percent complete — nothing the platform holds can supply either. |
| Enrollment importer + table + dashboard | **Phase 2** | Genuinely absent — no other source feeds it. The survey-period axis is reserved so it needs no rebuild. |
| Separate Grants and Capital Projects master lists | **Consolidated into Projects** | Net simplification; field definitions preserved for the V2 modules. |
| Monthly Fund Balance Snapshot importer | **Dropped** | The calculated fund balance ships alone. The calculation is written to be pluggable, so an imported source can be added later without touching anything that calls it. |
| Cross-dataset reconciliation warnings | **Returns with the V2 activity importers** | Only meaningful once the same number arrives from two sources. |

### The commercial position — SETTLED

**Agreed and taken: +$500 for financial policies, thresholds, alerting and forecasting.** These were specified as Phase 3 in the Feature Specification v1.1 (§10) and were moved into the MVP because the import workbook assumes them in the dashboards, and roughly a third of the alert catalogue cannot fire without a forecast. Quoted and agreed separately, exactly as external user access was in Milestone 1.

**Running total: $4,250.**

| Line | Amount | Status |
|---|---|---|
| Base fee — three milestones, 30/40/30 | $3,500 | M1 and M2 delivered; M3 next |
| Added scope: external user access *(Milestone 1)* | $250 | Delivered |
| Added scope: financial policies, alerts & forecasting *(Milestone 2)* | $500 | Delivered |
| **Total** | **$4,250** | |

**What was absorbed at no extra charge**, and should be stated plainly in the scope box so the record exists when V2 modules are quoted:

- The dataset count went from the **four** this milestone was priced against to **six**, including two annual budget files at genuinely different grains.
- A **second accepted file format** (CSV alongside Excel), through one shared pipeline so both validate identically.
- **Staged ingest**, so the upload lifecycle can span several requests without the district re-uploading.
- The **fund-balance engine** with transfer classification, and an **auditable manual override** with required reason and provenance.
- **Financial Activity Codes**, a seventh platform-managed global list.
- The **account page** and the **in-app notification system** — both v1.1 known gaps, delivered as proposed at no cost, and both removed from Milestone 3 as a result.

**And what gave time back**, which is why the base fee still holds despite the above: Grants Activity, Capital Projects Activity and Enrollment were deferred, and the Grants and Capital Projects masters were consolidated into one Projects list — removing three importers, three tables and the cross-dataset reconciliation layer.

State this once, in the Milestone Plan's payment schedule and scope box, and reference it from the Spec rather than restating it.

---

## Part G — Known gaps and what is genuinely not built

Be explicit about these in v1.2 — the same honesty that made v1.1 credible. Suggested placement: a short "Known gaps" callout at the end of §5, plus the relevant per-section notes.

| Gap | Status | Where to say it |
|---|---|---|
| **Dashboards still show sample data** | The engines behind them are built and verified; the screens are Milestone 3. | Spec §5.10, prominently |
| **No screen for entering forecast assumptions** | The model and the projection engine are delivered; the assumptions UI is Milestone 3. | Spec §5.18 |
| **No screen for entering a fund-balance override** | Storage, versioning, provenance rules and the Replace-clears behaviour are delivered; the entry screen is Milestone 3. | Spec §5.20 |
| **No alert panel** | The catalogue and evaluation are delivered and fixture-tested; display is Milestone 3. | Spec §5.17 |
| **Transfer object codes not yet populated** | Blocked on the client. Calculated fund balance is provisional until they land. | Spec §5.20, §13; Plan Next Steps |
| **Periodic data browse is not in the main navigation** | Reached from the version history and from each dataset page. A top-level "Data" entry is a small addition, worth folding into Milestone 3. | Spec §5.19, as a note |
| **A replaced version's rows are not recoverable** | By design — the record is kept permanently, the rows are not. *Keep as a new version* is the fully-restorable choice. Say it plainly rather than let a district discover it. | Spec §5.9, §5.8 |
| **Enrollment** | No source, no importer, no dashboard. Phase 2. | Spec §4 deferred list, §10 |
| **Grants and Capital Projects modules** | V2. Spend data is already collected. | Spec §5.14, §10 |
| **Excel and PDF export** | Milestone 3. CSV is live everywhere. | Spec §5.11 |
| **Automated backups / point-in-time recovery** | Milestone 3. | Spec §8 |
| **MFA, SSO, cost-center-level scoping, scheduled emails** | Unchanged from v1.1 — later phases. | Spec §10 |

---

## Part H — Open questions for Gary in v1.2

Carry forward from v1.1 (still open): Excel and PDF at launch or is CSV enough; SSO for external users; sizing (districts, users, years); which datasets are must-have for the MVP dashboards; state-specific compliance beyond Florida; hosting and data-residency requirements.

**New in v1.2:**

1. **The transfer object codes.** Which object codes, or ranges, mean Transfers In, Transfers Out and Other Financing Sources? This is the one outstanding input, and it is what makes the Milestone 3 reserve percentage authoritative rather than provisional.
2. **Threshold defaults per district, or one set for all?** Defaults currently ship from the workbook and each district tunes its own. If some are genuinely statutory — a state minimum reserve, for instance — they may belong at the platform level, locked, rather than as a district-editable number.
3. **Should Finance Users be able to edit financial policies?** Today it is District Administrators only, with Viewers able to read. One line of configuration either way.
4. **Which of the five dashboards matters most**, and which figures on each? Milestone 3 has a week; sequencing it against your priorities is better than guessing.
5. **Should the Grants and Capital Projects modules be scoped now?** The data is already being collected against the Projects master. If they are wanted, quoting them while the ingestion is fresh is cheaper than revisiting it later.
6. **Does anyone need the original uploaded file retrievable?** Asked in v1.1 and still unanswered; the pipeline is now live, so the answer is more consequential. Unchanged position: files are parsed and discarded, and retention is a separately-scoped addition that does not change the data model.

---

## Part I — Reference tables for the rewrite

Verified against the delivered system. Use these as the factual backing for anything above.

### I1 — The six importers, exactly

| Import type | Rhythm | Budget tag | Required columns | Optional / recommended |
|---|---|---|---|---|
| Revenue Budget | Annual | Adopted | Fund Code, Revenue Source Code, Budget Amount | Cost Center Code, Project Code |
| Expenditure Budget | Annual | Adopted | Fund Code, Function Code, Object Code, Budget Amount | Cost Center Code *(recommended)*, Project Code |
| Opening Fund Balance | Annual | — | Fund Code, five prior-year components, Beginning Unassigned, Effective Date, Status | Four beginning components, Notes |
| Revenue Detail | Monthly | Current | Fund Code, Revenue Source Code, Project Code, Budget, Actual MTD, Actual YTD | Cost Center |
| Expenditure Detail | Monthly | Current | Fund Code, Function Code, Object Code, Project Code, Budget, Actual MTD, Actual YTD, Encumbrances | Cost Center; Available Budget *(recomputed and compared if supplied)* |
| Cash Position | Monthly | — | Fund Code, Beginning Cash, Receipts MTD, Disbursements MTD | Ending Cash *(recomputed and compared)*, Investment Balance, Restricted Cash, Unrestricted Cash |

Two totals on Opening Fund Balance — prior-year total and beginning total — are **computed by the platform and deliberately left off the template.** The district enters only the components. This removes the entire class of "your total doesn't match its parts" errors for a figure the district never needed to supply.

### I2 — Validation layers as delivered

| # | Layer | What it does |
|---|---|---|
| 1 | Structure | File readable; every required column present; unrecognised columns surfaced; a missing required column refuses the upload outright, naming it. |
| 2 | Type & format | Numbers are numeric, dates are real dates (including Excel serials), required values present. A row failing here is dropped from later layers. |
| 3 | Controlled vocabulary | Values that must match a platform-managed global list — statuses in particular. |
| 4 | Referential integrity | Every code resolves to something in the district's own master data, with the leading-zero retry and a warning when it fires. |
| 5 | Calculation | Derived columns recomputed and compared to one cent. Mismatch is an Error. |
| 6 | Business rules | The district's own thresholds and switches: over-collection, spend above budget, budget overcommitted, encumbrances above available budget. Warnings. |
| 7 | Duplicate rows | Repeated rows within one file, identified by the dataset's own grain — the same definition version-compare uses, so the two can never disagree about what "the same row" means. |

### I3 — Policy settings by group (27 visible)

| Group | Settings |
|---|---|
| Revenues (6) | Variance warning · Variance critical · Forecast variance warning · Forecast variance critical · Month-over-month change · Flag over-collected lines on import |
| Expenditures (10 visible) | Utilisation warning · Utilisation critical · MoM increase warning · MoM increase critical · Forecast variance warning · Forecast variance critical · Flag budget overcommitted · Flag spend above budget · Flag encumbrances above available · Ignore salary objects for MoM |
| Cash (4) | Days cash warning · Days cash critical · Cash decrease warning · Cash decrease critical |
| Fund Balance (7) | District target · Board policy minimum · State minimum · Warning · Critical · Forecast warning · Forecast critical |

*(A "budget exceeded" threshold is held at 100% and read by the alert engine but not shown on the form — it is not a number a district has reason to move. Do not include it in the client-facing count.)*

### I4 — Audit actions added in Milestone 2

`DATA_UPLOADED` · `DATA_VALIDATED` · `DATA_WARNINGS_ACKNOWLEDGED` · `DATA_COMMITTED` · `DATA_UPLOAD_CANCELLED` · `VERSION_RESTORED` · `POLICY_UPDATED` · `POLICY_RESET` · `ACTIVITY_CODE_CREATED` · `ACTIVITY_CODE_DELETED` · `PASSWORD_CHANGED` · `USER_EMAIL_CHANGED`

Commit entries carry the version number, the row count and which version was superseded. Restore entries carry both the source and the new version number.

### I5 — Verification scripts, for the "how do we know it works" line

`verify:periods` · `verify:datasets` · `verify:import` · `verify:validation` · `verify:versioning` · `verify:commit` · `verify:finance` · `verify:browse` · `verify:policies` · `verify:forecast` · `verify:alerts` · `verify:sample` — alongside the Milestone 1 scripts `verify:m1`, `verify:external`, `verify:sort`, `verify:export`.

Worth one sentence in the Spec §9 Maintainability row or in the Plan's Milestone 2 deliverable: *"Sixteen verification scripts run against a live database and assert the platform's own invariants — that district isolation holds inside a transaction, that exactly one version per period can be current, that a failed commit leaves nothing behind, that the fund-balance arithmetic reproduces your own worked example, and that each of the 24 alerts fires on a fixture built to trip exactly it and stays silent on the other 23."*

---

## Final checklist for the rewrite

- [ ] Both documents' version, date and status updated
- [ ] Total price is **$4,250** on the Plan cover, in the payment schedule, and in the "what changed" box — $3,500 base + $250 (M1) + $500 (M2)
- [ ] Every "Not built yet" callout in Spec §5.5–5.9 and §7 removed
- [ ] Status labels updated throughout, distinguishing M1 from M2
- [ ] "Grants + Capital Projects → Projects" applied everywhere, including all tables ([B1](#b1-grants-and-capital-projects-become-one-projects-master))
- [ ] "seven master-data types" → "six" in all four places it appears
- [ ] The blocking workbook question moved from "still to confirm" to "confirmed" in both documents
- [ ] "Excel workbook" → "Excel or CSV" throughout
- [ ] New sections §5.16–§5.20 added
- [ ] §6 data model rewritten across five groups
- [ ] Known gaps stated plainly, especially that dashboards are still sample data
- [ ] Transfer object codes raised as the one outstanding client input, in both documents' next steps
