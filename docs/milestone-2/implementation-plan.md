# Milestone 2 — Data Pipeline & Version History

**Project:** K–12 School Finance SaaS (EDvanced Vue)
**Status:** Approved — ready to execute
**Companion:** [module-breakdown.md](./module-breakdown.md) — reconciliation, full assumptions register, deferred Phase 2 field tables

---

## Context

Milestone 1 shipped the platform foundation: multi-tenancy, auth, five roles, external access, district master data, the global lookup console, and the audit log. Milestone 2 is the reason the platform exists — getting real financial data in, validating it, and keeping its history.

Three client documents describe this milestone and **they disagree**, because the Import Workbook was written after the Feature Spec v1.1 and the Milestone Plan v1.1. This plan reconciles them. Where they conflict, the workbook's field tables win (most recent client intent), except where a later decision overrides.

What that reconciliation changed:

- **Uploads are per-dataset, one import type per file.** This was the single question both the Spec (§12) and Milestone Plan (p4) named as blocking the importer. The workbook's Misc tab settles it. No multi-sheet workbook parser.
- **The dataset count grew.** M2 was priced against four datasets ("revenue, expenditure, fund balance, cash"). The workbook's field tables define seven. After the fund-balance and Phase 2 decisions below, we build **six**.
- **Thresholds, alerts and forecasting moved in-scope** (+$500 / +7 days). The Spec had put a configurable rules interface and forecasting in Phase 3.

Intended outcome: a district uploads a file, sees it validated against the Red Book and its own master data, resolves errors, acknowledges warnings, chooses how to handle a re-upload, and gets versioned history it can compare and roll back — with alerts firing against thresholds it configured itself.

---

## Scope

### In — six importers

| # | Importer | Rhythm | Budget tag |
|---|---|---|---|
| 1 | Revenue Budget | Annual | `ADOPTED` |
| 2 | Expenditure Budget | Annual | `ADOPTED` |
| 3 | Opening Fund Balance | Annual | — |
| 4 | Revenue Detail | Monthly | Budget column ⇒ `CURRENT` |
| 5 | Expenditure Detail | Monthly | Budget column ⇒ `CURRENT` |
| 6 | Cash Position | Monthly | — |

The upload dropdown names all six explicitly, grouped Annual / Monthly. The workbook's coarser five labels ("Budget Summary", "Financial Activity Summary / Fund Balance") are not used — a label mapping to two different templates makes the blank-template feature incoherent.

### Deliberately out

| Dropped | Why |
|---|---|
| **Monthly Fund Balance Snapshot** | System Calculated ships alone. Keep the FB calculation pluggable so an Import Monthly source drops in later without touching callers. |
| **Grants Activity** | Deferred to Phase 2 with its dashboard (Spec §5.10). Drafted field table preserved in the breakdown. |
| **Capital Projects Activity** | Same. |
| **Enrollment** | Same. Removes survey periods from M2.1. |

**The deferral costs less than it looks.** Project/Grant is a *required* column on both Revenue Detail and Expenditure Detail — so grant and project spend still arrives, tagged, on every detail row. `grantId` / `capitalProjectId` FKs stay on `RevenueActual` and `ExpenditureActual`. A Phase 2 grants dashboard can largely be built from data this milestone already collects. What's genuinely absent: **Enrollment** (no other source), and **project budget / % complete** (nothing we hold can supply them).

This reverses an earlier "in scope" call. Tell Gary explicitly rather than letting it pass silently — he may have expected all three.

### Corrections applied to the working assumptions

- **Cash Position is back in.** Not a preference — System Calculated fund balance names it as one of four required inputs (workbook §3.2).
- **"Budget Summary" is two importers.** Revenue Budget is keyed Fund × Revenue Source; Expenditure Budget is Fund × Function × Object. One template cannot carry both column sets.

---

## Verified before planning

**The tenant extension survives `$transaction`.** Ran against the live DB, 6/6 passed: inside an interactive transaction on a `tenantDb(districtId)` client, `create` injects `districtId`, `createMany` injects it on every row, `findMany` stays scoped, and the guard still throws on `upsert`. Rollback leaves nothing.

This is what makes **Replace = `deleteMany` + `createMany` in one transaction** viable without hand-threading `districtId` through the commit path. Fold the spike into `verify:import` (M2.9) so it stays true.

---

## Build order

Spine (serial): M2.1 → M2.2 → M2.3 → M2.4 → M2.5 → M2.6
Parallel (opens once M2.2 lands): M2.7, M2.8, M2.10, M2.12 → M2.11

| Day | Work |
|---|---|
| 1 | M2.1 fiscal calendar · start M2.2 schema |
| 2 | M2.2 schema, migrations, partial unique index, `TENANT_MODELS` |
| 3 | M2.3 dataset registry — six defs, fields + grain + Zod |
| 4 | M2.4 ingestion: Route Handler, ExcelJS stream, CSV stream, staging, code resolution · **build fixtures here** |
| 5–6 | M2.5 validation — seven layers + findings |
| 7–8 | M2.6 upload wizard, report, duplicate prompt, atomic commit, version history |
| 9 | M2.7 financial activity engine |
| 10 | M2.8 browse & export |
| 11 | M2.10 thresholds |
| 12 | M2.12 forecasting |
| 13 | M2.11 alerts (needs 7 + 10 + 12) |
| 14 | M2.9 toast, my-account, audit actions, verify scripts |

~14 days against ~12.5 budgeted. M2.6 is the largest and most bug-prone module and has two days. There is no slack.

---

## Schema

Append to `prisma/schema.prisma`, replacing the design-for-future comment at the top of that file.

### Enums

```prisma
enum PeriodType   { ANNUAL MONTHLY SURVEY }   // SURVEY reserved for Phase 2 Enrollment — not built
enum BudgetType   { ADOPTED CURRENT }
enum BudgetKind   { REVENUE EXPENDITURE }
enum ImportStatus { PARSING VALIDATED AWAITING_CHOICE COMMITTED CANCELLED FAILED }
enum ImportAction { INITIAL REPLACED NEW_VERSION }
enum Severity     { ERROR WARNING }

enum DatasetKind {
  REVENUE_BUDGET  EXPENDITURE_BUDGET  OPENING_FUND_BALANCE
  REVENUE_DETAIL  EXPENDITURE_DETAIL  CASH_POSITION
  // GRANTS_ACTIVITY, CAPITAL_PROJECTS_ACTIVITY, ENROLLMENT — Phase 2
}

/// Which derived figure a district admin corrected. Enum not string, so a typo
/// can't silently create a second override that never displays.
enum FundBalanceField { TOTAL UNASSIGNED NONSPENDABLE RESTRICTED COMMITTED ASSIGNED }
```

`SURVEY` stays in the enum but its branch isn't built — matching the existing schema's own "design-for-future, don't build" precedent.

### Import batch, staging, findings

```prisma
/// One upload attempt. Holds the file's metadata — never the file itself (§5.9).
model ImportBatch {
  id           String       @id @default(cuid())
  districtId   String
  dataset      DatasetKind
  fiscalYear   String       // "2026-27"
  periodType   PeriodType
  period       Int?         // 1..12 monthly · null for annual
  budgetType   BudgetType?
  status       ImportStatus @default(PARSING)
  fileName     String
  fileSize     Int
  rowsParsed   Int          @default(0)
  errorCount   Int          @default(0)
  warningCount Int          @default(0)
  warningsAckedAt  DateTime?
  // Not an FK — matches AuditLog.actorUserId: deleting a user must never
  // cascade away the history of what they uploaded.
  uploadedByUserId String
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  district    District            @relation(fields: [districtId], references: [id], onDelete: Cascade)
  stagingRows ImportStagingRow[]
  findings    ValidationFinding[]
  version     DatasetVersion?

  @@index([districtId, dataset, fiscalYear, period])
  @@index([districtId, status])
}

/// Parsed rows awaiting validation and commit. `raw` is the row as the file had it
/// (label-keyed); `resolved` is after code -> id resolution. Both kept so the report
/// can quote the user's own value back at them.
/// districtId denormalised on purpose: every tenant-owned row carries one, or the
/// scoping extension has nothing to bite on.
model ImportStagingRow {
  id         String @id @default(cuid())
  districtId String
  batchId    String
  rowNumber  Int    // 1-based, header excluded — the number shown in the report
  raw        Json
  resolved   Json?

  batch ImportBatch @relation(fields: [batchId], references: [id], onDelete: Cascade)

  @@unique([batchId, rowNumber])
  @@index([districtId])
}

model ValidationFinding {
  id         String   @id @default(cuid())
  districtId String
  batchId    String
  severity   Severity
  layer      String   // "structure" | "vocabulary" | "calculation" | ...
  rule       String   // stable id, e.g. "VOCAB_UNKNOWN_FUND" — filterable and testable
  rowNumber  Int?     // null for file-level findings
  column     String?
  value      String?
  message    String   // plain English, already resolved

  batch ImportBatch @relation(fields: [batchId], references: [id], onDelete: Cascade)

  @@index([batchId, severity])
  @@index([districtId])
}
```

### Versions

```prisma
model DatasetVersion {
  id           String       @id @default(cuid())
  districtId   String
  dataset      DatasetKind
  fiscalYear   String
  periodType   PeriodType
  period       Int?
  budgetType   BudgetType?
  version      Int          // 1, 2, 3... per district+dataset+fy+period
  isCurrent    Boolean      @default(true)
  action       ImportAction
  batchId      String       @unique
  rowCount     Int
  errorCount   Int
  warningCount Int
  fileName     String
  committedByUserId String
  committedAt  DateTime     @default(now())

  district District    @relation(fields: [districtId], references: [id], onDelete: Cascade)
  batch    ImportBatch @relation(fields: [batchId], references: [id])

  @@unique([districtId, dataset, fiscalYear, period, version])
  @@index([districtId, dataset, fiscalYear, period, isCurrent])
}
```

**"Exactly one current" cannot live in the schema** — Prisma's `@@unique` has no `where`. Add by hand to the migration:

```sql
-- prisma/migrations/<ts>_m2_periodic/migration.sql
CREATE UNIQUE INDEX "DatasetVersion_one_current_per_period"
  ON "DatasetVersion" ("districtId", "dataset", "fiscalYear", COALESCE("period", -1))
  WHERE "isCurrent" = true;
```

`COALESCE` is required: `period` is null for annual datasets and Postgres treats every NULL as distinct, so without it an annual dataset could carry unlimited current versions and the schema would still look correct.

### Periodic data

```prisma
/// Adopted budget, from the two annual files. budgetType is an enum rather than a
/// boolean so a future "Revised Budget" annual file drops in without a migration.
///
/// Current/Revised budget is NOT here — it arrives as the Budget column on the monthly
/// detail rows and stays there, because that is the grain Available Budget is computed
/// at and the grain the browse table displays. A join per row across 50k rows to
/// re-unite them would buy nothing. A8 decides which of the two a KPI divides by.
model BudgetLine {
  id         String     @id @default(cuid())
  districtId String
  versionId  String
  fiscalYear String
  budgetType BudgetType @default(ADOPTED)
  kind       BudgetKind
  fundId     String
  revenueSourceId  String?  // REVENUE lines
  functionId       String?  // EXPENDITURE lines
  objectId         String?  // EXPENDITURE lines
  costCenterId     String?
  capitalProjectId String?
  grantId          String?
  amount     Decimal    @db.Decimal(18, 2)

  @@index([districtId, fiscalYear, kind, budgetType])
  @@index([versionId])
}

model RevenueActual {
  id         String  @id @default(cuid())
  districtId String
  versionId  String
  fiscalYear String
  period     Int
  fundId          String
  revenueSourceId String
  grantId          String?   // Project/Grant is Required in the file; one of these resolves
  capitalProjectId String?
  costCenterId     String?
  budget    Decimal @db.Decimal(18, 2)   // the file's Budget column == CURRENT budget
  actualMtd Decimal @db.Decimal(18, 2)
  actualYtd Decimal @db.Decimal(18, 2)

  @@index([districtId, fiscalYear, period])
  @@index([versionId])
  @@index([districtId, fiscalYear, period, fundId])
}

model ExpenditureActual {
  id         String  @id @default(cuid())
  districtId String
  versionId  String
  fiscalYear String
  period     Int
  fundId     String
  functionId String
  objectId   String
  costCenterId     String?
  grantId          String?
  capitalProjectId String?
  budget       Decimal @db.Decimal(18, 2)
  actualMtd    Decimal @db.Decimal(18, 2)
  actualYtd    Decimal @db.Decimal(18, 2)
  encumbrances Decimal @db.Decimal(18, 2)
  availableBudget Decimal @db.Decimal(18, 2)  // calculated at import + stored

  @@index([districtId, fiscalYear, period])
  @@index([versionId])
  @@index([districtId, fiscalYear, period, fundId])
  @@index([districtId, fiscalYear, period, objectId])  // transfer isolation
}

model CashPosition {
  id         String  @id @default(cuid())
  districtId String
  versionId  String
  fiscalYear String
  period     Int
  fundId     String
  beginningCash     Decimal  @db.Decimal(18, 2)
  receiptsMtd       Decimal  @db.Decimal(18, 2)
  disbursementsMtd  Decimal  @db.Decimal(18, 2)
  endingCash        Decimal  @db.Decimal(18, 2)  // calculated + stored
  investmentBalance Decimal? @db.Decimal(18, 2)
  restrictedCash    Decimal? @db.Decimal(18, 2)
  unrestrictedCash  Decimal? @db.Decimal(18, 2)

  @@index([districtId, fiscalYear, period])
  @@index([versionId])
}

/// Annual. Anchors every fund-balance calculation for the year.
model OpeningFundBalance {
  id         String @id @default(cuid())
  districtId String
  versionId  String
  fiscalYear String
  fundId     String
  pyNonspendable Decimal @db.Decimal(18, 2)
  pyRestricted   Decimal @db.Decimal(18, 2)
  pyCommitted    Decimal @db.Decimal(18, 2)
  pyAssigned     Decimal @db.Decimal(18, 2)
  pyUnassigned   Decimal @db.Decimal(18, 2)
  pyTotal        Decimal @db.Decimal(18, 2)   // calculated + stored
  begNonspendable Decimal? @db.Decimal(18, 2)
  begRestricted   Decimal? @db.Decimal(18, 2)
  begCommitted    Decimal? @db.Decimal(18, 2)
  begAssigned     Decimal? @db.Decimal(18, 2)
  begUnassigned   Decimal  @db.Decimal(18, 2)  // required — the reserve KPI
  begTotal        Decimal  @db.Decimal(18, 2)  // calculated + stored
  effectiveDate DateTime
  statusId      String?
  notes         String?

  @@index([districtId, fiscalYear])
  @@index([versionId])
}

/// A district admin's correction to a figure the platform derived. Sparse — the
/// computed fund balance itself is NOT materialised, it is derived at read (a sum
/// over indexed rows, ~240 rows/year/district at the fund grain).
///
/// Versioned with the period it corrects, so restoring v1 restores v1's corrections.
/// A Replace clears it: the numbers underneath changed, so the correction may no
/// longer apply — and the prompt says so.
model FundBalanceOverride {
  id         String @id @default(cuid())
  districtId String
  versionId  String
  fiscalYear String
  period     Int
  fundId     String
  field      FundBalanceField
  value      Decimal @db.Decimal(18, 2)
  reason     String            // required — the first thing an auditor asks
  overriddenByUserId String
  createdAt  DateTime @default(now())

  @@unique([districtId, fiscalYear, period, fundId, field])
  @@index([versionId])
}
```

> ⚠️ **Every model above is tenant-owned. All nine names go into `TENANT_MODELS` in `lib/tenant-scope.ts`.** The extension is an allowlist — a model that isn't in the set passes through completely unscoped, with no error and no warning. Highest-consequence line in the milestone, and a one-line edit that's easy to skip.

Money is `Decimal` everywhere. Never float.

---

## Modules

`+` new · `~` modified

### M2.1 — Fiscal Calendar & Reporting Periods · Day 1

```
+ lib/periods/fiscal.ts          pure — FY parse/format, period<->month, labels
+ scripts/verify-periods.mts     hand-rolled assert, matching verify-sort.mts
```

- `fiscalYearFor(date, startMonth)` → `"2026-27"`; `parseFiscalYear` rejects anything not `YYYY-YY` with consecutive years.
- `periodToMonth(p, startMonth)` / `monthToPeriod` — derived from `District.fiscalYearStartMonth`, never assumed July. A district on an August calendar gets Period 1 = August free.
- `periodLabel(type, n)` → `"August (Period 2)"`, driving the upload selector and every finding message.
- Monthly + annual branches only. Survey is Phase 2.

**Done when** `verify:periods` passes including a non-July district.

### M2.2 — Periodic Data Model, Versions & Staging · Days 1–2

```
~ prisma/schema.prisma           the schema above; drop the design-for-future comment
~ lib/tenant-scope.ts            +9 names in TENANT_MODELS
+ prisma/migrations/<ts>_m2_periodic/migration.sql   + the partial unique index by hand
+ lib/datasets/kinds.ts          DatasetKind <-> slug <-> label
```

- After `db:migrate`, re-run the transaction spike against the new models before building on top.

**Done when** the migration applies clean, the one-current index rejects a second current row, and every new model is scoped.

### M2.3 — Dataset Registry · Day 3

```
+ lib/datasets/registry.ts       six DatasetDefs
+ lib/datasets/fields.ts         shared Zod builders
```

Deliberately parallel to `lib/master-data/registry.ts` — reuse its shape, its Zod builders (`registry.ts:79-98`), and its `toClientDef` RSC-boundary discipline.

```ts
export type Requiredness =
  | "required" | "recommended" | "optional" | "calculated" | "conditional";

export interface DatasetField {
  name: string;          // target column
  label: string;         // header matched label-first, then name (M1's matcher, reused)
  requiredness: Requiredness;
  type: "code" | "text" | "amount" | "count" | "percent" | "date";
  resolvesTo?: ResolveTarget;                     // which list a `code` resolves against
  compute?: (r: ResolvedRow) => Prisma.Decimal;   // `calculated` -> also how we compare
}

export interface DatasetDef {
  kind: DatasetSlug;
  model: string;                 // Prisma delegate
  title: string;
  periodType: PeriodType;
  fields: DatasetField[];
  /** What makes two rows "the same row" — drives duplicate detection AND version diff. */
  grain: string[];
  schema: z.ZodType<unknown>;
}
```

- `grain` earns its place twice — the duplicate-rows layer and M2.6's version compare both need exactly this, and defining it once stops them disagreeing.
- `compute` doubles as the validator: one function derives the value *and* produces the expected figure to compare the file against, so the two can't drift.

**Done when** all six defs exist and a template generator round-trips headers for each.

### M2.4 — File Ingestion & Parsing · Day 4

```
+ app/api/import/upload/route.ts   Route Handler — sidesteps the 1MB Server Action cap
+ lib/import/parse/excel.ts        ExcelJS streaming WorkbookReader
+ lib/import/parse/csv-stream.ts   streaming sibling of lib/csv.ts
+ lib/import/parse/rows.ts         one row iterator both formats feed
+ lib/import/resolve.ts            code -> id, incl. leading-zero retry
+ lib/import/stage.ts              batched createMany into staging
~ package.json                     + exceljs
```

- **Route Handler, not Server Action.** Next 16 caps Server Actions at 1MB by default (confirmed in `node_modules/next/dist/docs/01-app/02-guides/server-actions.md:83`). Route Handlers aren't subject to it. Vercel's 4.5MB body cap still applies — roughly 30k CSV rows / 80k+ xlsx rows.
- **One row iterator.** The registry and validator must never learn which format they're reading, or every rule gets written twice and one copy rots.
- **Leading zeros:** resolution, not parsing. Try the literal code; on a miss retry zero-padded to the master code's width; on a hit take it and warn. A numeric `.xlsx` cell lost the zero before we opened it — no read mode recovers it.
- Excel serial dates → real dates (the Spec's example is `46234`).
- Stage in `createMany` batches of ~1,000.
- **Build the fixtures here**, not at the end — they're what make days 5–8 fast.

**Done when** the same fixture as `.csv` and `.xlsx` produces identical staging rows, and `0101` survives both.

### M2.5 — Validation Engine · Days 5–6

```
+ lib/validation/import/engine.ts
+ lib/validation/import/layers/{structure,types,vocabulary,referential,calculation,business-rules,duplicates}.ts
+ lib/validation/import/findings.ts
```

- **Reuse M1's composite-key resolution.** `importMasterData`'s `globalKey` (`app/actions/master-data.ts:254-282`) already makes it impossible to pair a type with the wrong parent. Vocabulary + referential want exactly that, keyed by district.
- **Calculation:** Error at ±$0.01 tolerance. Decimal throughout; the cent absorbs the district's own rounding without waving through a real discrepancy.
- **Business rules** reads thresholds from M2.10 — which lands day 11. Ship against the workbook's defaults *behind the same interface*, then swap the source. Do not fork the rule.
- Findings go to the DB, not memory — the report outlives the request.
- No cross-dataset reconciliation layer (it existed to check Grants/CapProj activity against the detail rows; both deferred). It returns with them in Phase 2.

**Done when** a deliberately broken fixture produces one finding per planted defect, each naming row, column and value.

### M2.6 — Upload Lifecycle & Version History · Days 7–8

```
+ app/(district)/data/upload/page.tsx              wizard: dataset, FY, period, budget type, file
+ app/(district)/data/batches/[batchId]/page.tsx   validation report
+ app/(district)/data/versions/page.tsx            history, compare, restore
+ app/actions/import.ts                            acknowledge, resolve duplicate, commit, cancel
+ lib/import/commit.ts                             the transaction
+ lib/import/duplicate.ts                          detection + three-way choice
+ components/import/{upload-form,validation-report,duplicate-prompt,version-list,version-compare}.tsx
```

The commit — verified safe:

```ts
await db.$transaction(async (tx) => {
  // REPLACE: supersede the current version. No upsert exists on tenant models —
  // the extension throws — so it's deleteMany + createMany, and the extension
  // keeps both scoped to this district (verified).
  if (action === "REPLACED") {
    await tx.datasetVersion.updateMany({
      where: { dataset, fiscalYear, period, isCurrent: true },
      data:  { isCurrent: false },
    });
    await tx[def.model].deleteMany({ where: { versionId: supersededId } });
  }
  if (action === "NEW_VERSION") {
    await tx.datasetVersion.updateMany({
      where: { dataset, fiscalYear, period, isCurrent: true },
      data:  { isCurrent: false },
    });
  }
  const v = await tx.datasetVersion.create({ data: { ...meta, version: next, isCurrent: true } });
  await tx[def.model].createMany({ data: rows.map((r) => ({ ...r, versionId: v.id })) });
  await tx.importStagingRow.deleteMany({ where: { batchId } });
  await tx.importBatch.updateMany({ where: { id: batchId }, data: { status: "COMMITTED" } });
});
```

- Clear `isCurrent` **before** setting the new one — the partial unique index will reject the overlap, which is the invariant working, not a bug.
- The duplicate prompt uses the client's exact wording from Spec §5.8. Don't paraphrase — they wrote it.
- Restore = a new version with `action: NEW_VERSION` copying the old rows. Never mutate history.
- Audit in the same path: `DATA_UPLOADED`, `DATA_VALIDATED`, `DATA_COMMITTED`, `VERSION_RESTORED`.

**Done when** upload → validate → replace → restore round-trips, and a forced mid-commit throw leaves zero rows behind.

### M2.7 — Financial Activity Engine · Day 9

```
+ lib/finance/engine.ts          Available Budget, Ending Cash, component totals
+ lib/finance/fund-balance.ts    System Calculated + override resolution
+ lib/finance/transfers.ts       object-code classification
+ app/(platform)/platform/config — a 7th global list: Financial Activity Classifications
+ app/actions/fund-balance.ts    override, with reason
```

- **Transfers:** a platform-level list of object codes and ranges per class — Transfers In, Transfers Out, Other Financing. Transfers In and Other Financing are revenue objects; Transfers Out is an expense object; the engine isolates all three by object code from the Revenue and Expense files rather than from new columns. Red Book is the standardised core, so this is Tier 1, and the existing config console is already exactly this shape. A seventh list, not a new surface.
- **Provisional:** until those codes exist, FB is missing a term and is *wrong*, not merely incomplete. Compute it, label it provisional, reuse the sample-data banner already on `app/(district)/dashboard/page.tsx:97-103`. A confidently-wrong reserve % is worse than a late one.
- Derive, don't materialise — a sum over indexed rows at the fund grain is milliseconds.
- Keep the FB function pluggable so an Import Monthly source drops in later without touching callers.

**Done when** the workbook's own example reproduces: `$72.0M + $48.5M − $44.2M = $76.3M`.

### M2.8 — Periodic Data Browse & Export · Day 10

```
+ app/(district)/data/[dataset]/page.tsx          server-paginated table
+ app/(district)/data/[dataset]/export/route.ts   server-side CSV
+ lib/datasets/query.ts                           shared where/orderBy/skip/take builder
+ components/data/server-table.tsx                searchParams-driven — new pattern
```

- **Copy `app/(district)/audit/export/route.ts`, not the master-data export.** It already does exactly this: filters from `searchParams`, scope from the session and never the query string.
- State lives in the URL, not React. `usePagination` / `useSort` do **not** apply here — reaching for them is the trap. M1's tables load every row and paginate client-side; Expenditure Detail cannot.
- Keep `lib/sort.ts`'s rules visible: numeric-aware order, blanks last. Same feel, different engine — `NULLS LAST` in SQL.

**Done when** a 50k-row dataset pages, sorts and exports without loading the set into memory.

### M2.9 — Platform Integration & Gap-Closers · Day 14

```
+ components/ui/toast.tsx + provider in app/layout.tsx
+ app/(district)/account/page.tsx     name + password (Spec §5.1 known gap)
+ app/actions/account.ts
+ scripts/verify-import.mts · verify-versioning.mts
~ lib/audit.ts                        the M2 action names
```

- Fold the transaction spike into `verify-import.mts` so tenant-scoping-in-a-transaction stays proven, not remembered.
- Changing your own password must revoke other sessions — M1 already does this on reset; match it.
- Two of these four are contractually free and are the most visible polish in the milestone. They're last in the order and first to get squeezed — worth protecting.

**Done when** both verify scripts pass and the toast replaces inline-only feedback on the import path.

### M2.10 — Financial Policies & Thresholds · Day 11

```
+ prisma/schema.prisma            DistrictPolicy (one row/district, Json by group) + PolicyCategoryTarget
+ lib/policies/registry.ts        the ~22 settings, defaults from the workbook
+ app/(district)/policies/page.tsx  four tabbed groups
+ app/actions/policies.ts
```

- Registry-driven like everything else: declare the settings, generate the form. Four hand-built forms would be four places to fix a typo.
- Every default ships from the workbook, so an untouched district still alerts sensibly on day one.
- Decision was District Admin. Worth a look: M1's own reasoning — "keeping master data current is day-to-day finance work, not administration" — argues Finance Users belong here too. One line in `lib/auth/permissions.ts` either way.

**Done when** all four groups persist and M2.5's business-rules layer reads them instead of its defaults.

### M2.12 — Forecasting · Day 12

```
+ lib/forecast/engine.ts          year-end projection, 3-year FB projection
+ prisma/schema.prisma            ForecastAssumption (per FY, per category)
+ app/(district)/policies/forecast  assumptions UI
```

- Year-end = actual YTD extrapolated by the district's growth %, per category.
- Three-year FB projection by component; basis = Adopted or manual entry.
- Built before M2.11 because ~10 of the 27 alerts are forecast-based and cannot fire without it.

**Done when** projected unassigned reserve % computes for the General Fund across three years.

### M2.11 — Alert Engine · Day 13

```
+ lib/alerts/catalog.ts           all 27, declaratively
+ lib/alerts/engine.ts            evaluate(district, fy, period) -> Alert[]
+ components/alerts/{alert-list,status-badge}.tsx
```

- Declarative catalog: id, group, severity, predicate over (actuals, thresholds, forecast). 27 hand-written `if`s is how you end up with two definitions of "over budget".
- Status labels — Strong / Acceptable / Monitor / Action Required — derive from the same thresholds, never a second ladder.
- Derive at read. Nothing stored, nothing to invalidate.
- Depends on M2.7 + M2.10 + M2.12, so it is genuinely the last thing that can work. If day 13 slips, this is what's exposed.

**Done when** each of the 27 fires on a fixture built to trip exactly it, and stays silent on the others.

---

## Verification

Extends the existing hand-rolled `scripts/verify-*.mts` convention — plain asserts, `process.exit` on failure. No test framework introduced mid-project.

| Script | Proves |
|---|---|
| `verify:periods` | FY parsing · period↔month on a non-July district · annual vs monthly |
| `verify:import` | csv ≡ xlsx for one fixture · leading zeros survive · serial dates parse · **tenant scoping holds inside `$transaction`** |
| `verify:validation` | One finding per planted defect, naming row/column/value · Error vs Warning lands correctly |
| `verify:versioning` | Exactly one current survives replace/new-version/restore · a mid-commit throw leaves nothing · versions never mutate |
| `verify:finance` | The workbook's arithmetic, incl. `$72.0M + $48.5M − $44.2M = $76.3M` |
| `verify:alerts` | Each of the 27 fires on its own fixture and stays quiet on the rest |

**End-to-end, by hand, before calling it done:**

1. `npm run db:migrate && npm run seed:demo`
2. Sign in as `demo.finance@k12finance.local` (`Demo!2026Pass`)
3. Master data → import funds, revenue sources, functions, objects (the M1 CSV path, unchanged)
4. Data → Upload → Revenue Budget (annual, FY2026-27) → confirm validation report, commit
5. Upload Revenue Detail for August (Period 2) → confirm errors block, warnings acknowledge
6. Re-upload the same period → confirm the three-way prompt in the client's exact words → Replace
7. Versions → confirm v1 retained, v2 current, compare shows the diff, restore makes v1 current again
8. Confirm the audit log recorded upload / validate / commit / restore
9. Sign in as `demo.viewer@…` → confirm read + export, no upload

**The fixture set is the real deliverable.** One small workbook per dataset in both formats, plus a deliberately broken twin per validation layer. Build on day 4.

---

## Open items for Gary

Nothing blocks. Send in week one — a column correction is a schema edit on day 2 and a migration plus re-import on day 10.

1. **The six-importer list** and that Budget Summary became two files.
2. **Transfer object codes / ranges** for Transfers In, Transfers Out, Other Financing. The only thing between System Calculated fund balance and a real number; until they land it ships behind a provisional banner.
3. **Grants Activity / Capital Projects Activity / Enrollment deferred to Phase 2** — reverses an earlier call. Their dashboards were already Phase 2. Note that grant and project spend still arrives tagged on the detail rows. Drafted field tables are preserved in [module-breakdown.md](./module-breakdown.md) so Phase 2 starts from them.
4. **Scope.** The +$500 covered thresholds/alerts/forecasting. The base milestone also grew — budget-type dimension, second file format, staged ingest, FB override — and still carries its original 1.5 weeks / $1,400. The Milestone 1 precedent (external access scoped and quoted at $250, accepted without friction) is the model.

---

## Assumptions

Full register with rationale in [module-breakdown.md](./module-breakdown.md). Summary:

**Product — for Gary's sign-off:** six importers named explicitly in the dropdown (A1) · Cash Position is in (A2) · Budget Summary is two importers (A3) · KPIs divide by Current with an Adopted toggle, forecast basis stays Adopted (A8) · transfer object codes are platform-level config (A9).

**Engineering — ours:** Route Handler upload (E1) · ExcelJS streaming (E2) · staging table now, chunked upload designed-for (E3) · leading zeros resolved against master data (E4) · calculation mismatch = Error at ±$0.01 (E5) · FB override versioned, reasoned, cleared by Replace (E6) · FB provisional until transfer codes land (E8).
