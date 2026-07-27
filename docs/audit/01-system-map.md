# 01 — System Map & Real Signal

**Project:** EDvanced Vue — multi-district K–12 school-finance SaaS
**Audited:** 2026-07-25 · read-only, no code changed
**Stack (from [package.json](../../package.json)):** Next.js 16.2.10 (App Router, Turbopack), React 19.2.4, Prisma 7.8 + `@prisma/adapter-pg`, PostgreSQL (Supabase pooler), `@node-rs/argon2`, `jose` 6 (HS256), `zod` 4, `nodemailer` 9, `exceljs` 4, Tailwind 4.

> **Legend for "where it runs":** `server` = Node.js Server Component / Route Handler / Server Action. There is **no** edge runtime and **no** client-side data fetching anywhere in this app.

---

## 1. Routes & pages (rendering mode)

All routes live under [app/](../../app). The production build reports **41 routes, all dynamic (`ƒ`) except two static (`○`)**: `/_not-found` and `/forgot-password`. There are **no** `export const dynamic|revalidate|runtime`, no `generateStaticParams`, no `runtime = 'edge'` anywhere — every page is an on-demand async **Server Component**.

Four route groups (parens = layout scoping only, no URL segment):

| Group | Layout | Purpose | Rendering |
|---|---|---|---|
| `(auth)` | [app/(auth)/layout.tsx](../../app/(auth)/layout.tsx) (sync) | login, forgot-password, reset-password | server; `login-form`, `forgot-form`, `reset-form` are `"use client"` leaf forms (no fetch) |
| `(district)` | [app/(district)/layout.tsx](../../app/(district)/layout.tsx) (async) | district app: dashboard, revenues, expenditures, cash, fund-balance, data pipeline, users, settings | server components, data via DAL |
| `(external)` | [app/(external)/layout.tsx](../../app/(external)/layout.tsx) (async) | external/auditor users → `/districts` | server |
| `(platform)` | [app/(platform)/layout.tsx](../../app/(platform)/layout.tsx) (async) | platform-admin console under `/platform/*` | server |

Full route list (all `server`, dynamic unless noted): `/`, `/account`, `/alerts`, `/audit`, `/cash`, `/dashboard`, `/data/[dataset]`, `/data/batches/[batchId]`, `/data/upload`, `/data/versions`, `/data/versions/compare`, `/districts`, `/expenditures`, `/fund-balance` (+ `/alerts`, `/forecast`, `/override`, `/policies`), `/login`, `/master-data`, `/policies`, `/revenues`, `/settings`, `/users`, `/platform` (+ `/activity-codes`, `/audit`, `/config`, `/districts`, `/districts/[districtId]`, `/districts/[districtId]/users`, `/external-users`). Static: `/forgot-password`, `/_not-found`.

**Client Components (leaf UI only, no data fetching):** the three auth forms, [create-district-form.tsx](../../app/(platform)/platform/districts/create-district-form.tsx), [assumptions-form.tsx](../../app/(district)/fund-balance/forecast/assumptions-form.tsx), [override-form.tsx](../../app/(district)/fund-balance/override/override-form.tsx), [summary-print.tsx](../../app/(district)/dashboard/summary-print.tsx).

## 2. API endpoints, server actions, webhooks

**Route handlers** (`route.ts`, all Node runtime, tenant resolved from session — never from query string):

- **POST** [app/api/import/upload/route.ts](../../app/api/import/upload/route.ts) — the only body-receiving handler. 4MB cap (`MAX_BYTES`), authz `resolveTenantDb` + `userCan("upload_data")`, buffers the whole file into memory, parses, stages, validates, audits. A Route Handler (not a Server Action) deliberately, to escape Next's 1MB action-body cap (documented lines 12–26).
- **GET** exports (CSV/xlsx): five dashboard exports (`dashboard`, `revenues`, `expenditures`, `cash`, `fund-balance`) all delegate to [lib/export/route-handler.ts](../../lib/export/route-handler.ts); plus [data/[dataset]/export](../../app/(district)/data/[dataset]/export/route.ts), [district audit export](../../app/(district)/audit/export/route.ts), [platform audit export](../../app/(platform)/platform/audit/export/route.ts).

**Server Actions** — 12 files in [app/actions/](../../app/actions), all top-of-file `"use server"`, ~50 actions (auth, account, districts, users, external-access, activity-codes, config, master-data, import, fund-balance, forecast, policies). Note: [app/actions/import.ts](../../app/actions/import.ts) exports an action literally named `revalidate` — not the Next segment config.

**Webhooks: none.** No Stripe/Resend/SendGrid/inbound POST receiver. The only inbound POST is the authenticated internal upload. `resend*` matches are invite-resend actions, not an email provider.

## 3. Background jobs, queues, cron

**None.** No cron, no queue, no worker, no scheduled task. The `scripts/*.mts` are developer-run one-shots (seed / verify), invoked manually via `tsx`.

## 4. Database schema, relations, indexes

Single schema [prisma/schema.prisma](../../prisma/schema.prisma) (~1147 lines). Tenant root = **`District`**; scoping field = **`districtId`** everywhere (no `orgId`/`tenantId`). Money is `Decimal(18,2)` throughout — never `Float`.

**Tenant-owned models** (carry `districtId`, enforced by the extension — see §7): `School`, `Grant`, `CapitalProject`, `Project`, `Fund`, `RevenueSource`, `AccountFunction`, `AccountObject`, `ImportBatch`, `ImportStagingRow`, `ValidationFinding`, `DatasetVersion`, `BudgetLine`, `RevenueActual`, `ExpenditureActual`, `CashPosition`, `OpeningFundBalance`, `FundBalanceOverride`, `DistrictPolicy`, `ForecastAssumption`, `FundBalanceProjection`, `FundBalanceComponentAssumption`.

**Global lookups — intentionally NOT tenant-scoped** (shared across districts, keyed by `code`/`name @unique`): `FundType`, `RevenueType`, `ObjectType`, `FunctionType`, `Status`, `CostCenterType`, `FinancialActivityCode`. This boundary is the audit-critical line (see finding F-04).

**Indexes on the large periodic tables** (quoted from schema):
- `BudgetLine`: `@@index([districtId, fiscalYear, kind, budgetType])`, `@@index([versionId])`, `@@index([fundId])`
- `RevenueActual`: `[districtId,fiscalYear,period]`, `[versionId]`, `[districtId,fiscalYear,period,fundId]`, `[districtId,fiscalYear,period,revenueSourceId]`
- `ExpenditureActual` (largest table): `[districtId,fiscalYear,period]`, `[versionId]`, `+ [...,fundId]`, `[...,functionId]`, `[...,objectId]`
- Auth: `User @@index([districtId])`, `Session @@index([userId])`, `AuditLog @@index([districtId,createdAt])` + `[actorUserId]`, `VerificationToken tokenHash @unique`.
- `DatasetVersion` has **two hand-written partial unique indexes** in migration `20260716093936_m2_periodic` (`COALESCE(period,-1)` + `WHERE isCurrent = true`) that Prisma's `@@unique` cannot express.

**Relations:** periodic→master-data are `onDelete: Restrict`; `districtId` FKs `Cascade`; several actor columns (`AuditLog.actorUserId`, `ImportBatch.uploadedByUserId`, etc.) are **deliberately not FKs** so deleting a user preserves history.

**Migrations** (19 total, [prisma/migrations/](../../prisma/migrations)) — lock-relevant ones:
- `20260716093936_m2_periodic` — creates all periodic tables + ~25 indexes.
- `20260719120000_unify_project_master` — `DROP COLUMN capitalProjectId, grantId; ADD COLUMN projectId` + new FKs on the three largest tables → `ACCESS EXCLUSIVE` lock + FK-validation scan on populated tables (see F-11).

## 5. External services & third-party SDKs

- **SMTP** — [lib/email.ts](../../lib/email.ts) (nodemailer). Port 465→implicit TLS, else STARTTLS. **Falls back to console-logging the full email (incl. reset link) when `SMTP_HOST` is unset, and also on SMTP send failure**; `sendEmail` never throws into callers.
- **ExcelJS** — [lib/import/parse/excel.ts](../../lib/import/parse/excel.ts) (read `.xlsx`), [lib/export/workbook.ts](../../lib/export/workbook.ts) (write). Buffers in memory; no streaming.
- **No outbound third-party HTTP** — no `fetch`/`axios`/API SDKs to any external service. `crypto` (Node built-in) for token hashing.

## 6. Auth & session flow

- **Password:** argon2id (`@node-rs/argon2`, OWASP params `memoryCost 19456, timeCost 2, parallelism 1`) — [lib/auth/password.ts](../../lib/auth/password.ts).
- **JWT:** `jose` HS256 from `SESSION_SECRET`, 7-day expiry, `algorithms: ["HS256"]` on verify — [lib/auth/jwt.ts](../../lib/auth/jwt.ts).
- **Session:** DB-backed & revocable, cookie `session` — `httpOnly: true`, `sameSite: "lax"`, `secure` only in production, 7-day expiry — [lib/auth/session.ts:44](../../lib/auth/session.ts#L44).
- **Login:** [app/actions/auth.ts:42](../../app/actions/auth.ts#L42) — zod validate → lookup → status/lock checks → argon2 verify → per-account lockout (5 fails / 15 min, [lib/auth/lockout.ts](../../lib/auth/lockout.ts)) → create session → audit. Enumeration-safe generic messages.
- **Current user (secure check):** [lib/auth/dal.ts `getCurrentUser`](../../lib/auth/dal.ts#L35) — memoized with `React.cache()`, one round trip loading session + user + live external grants; rejects expired/disabled/inactive-district.
- **Authz:** `requireAuth`, `requireRole`, `requirePermission`, `requireDistrictAccess`, `getTenantDb`, `resolveTenantDb` — all in [lib/auth/dal.ts](../../lib/auth/dal.ts). Permission matrix [lib/auth/permissions.ts](../../lib/auth/permissions.ts).
- **Proxy (middleware):** [proxy.ts](../../proxy.ts) (Next 16 renamed `middleware.ts`) — optimistic cookie-only check (signature/expiry, no DB). Matcher excludes `api`, `_next`, static assets → **`/api/*` is not proxied** (the upload route self-checks).
- **Tokens:** [lib/tokens.ts](../../lib/tokens.ts) — `randomBytes(32).base64url`, only SHA-256 hash stored; invite TTL 7d, reset TTL 1h; one-time (`usedAt`).

## 7. Every caching layer that exists today

- **`React.cache()`** — `getCurrentUser` / `requireAuth` per-request dedupe ([lib/auth/dal.ts](../../lib/auth/dal.ts)).
- **`revalidatePath`** — across 11 Server Action files after mutations.
- **Explicit query batching** — [lib/dashboard/load.ts](../../lib/dashboard/load.ts) threads a shared `core` and runs 5 queries via `Promise.all` (documented "~80–100 queries naïvely → under 20, almost all concurrent"). `React.cache` deliberately **not** used here because `tenantDb()` builds a fresh client each call (cache key never hits).
- **Module singletons (dev only):** `globalForPrisma.prisma`, `globalForMail.mailer`.
- **None of:** `unstable_cache`, `revalidateTag`, `unstable_noStore`, `fetch()` caching, in-memory data caches, Redis/CDN cache. Financial figures are computed at read time from indexed `aggregate`/`groupBy` sums — no cached-staleness surface.

## 8. Tenant isolation (choke point)

[lib/tenant-db.ts](../../lib/tenant-db.ts) + [lib/tenant-scope.ts](../../lib/tenant-scope.ts): a Prisma `$allOperations` extension that (a) injects `where.districtId` on read/`updateMany`/`deleteMany`, (b) injects `districtId` into `create`/`createMany` data, (c) **throws** on `update`/`upsert`/`delete`/`findUnique` for tenant models, (d) **throws** on raw SQL (`$queryRaw*`, `$executeRaw*`). `TENANT_MODELS` is an **allowlist that fails OPEN** — see F-04. Base `prisma` is used only by sanctioned cross-tenant code ([lib/audit.ts](../../lib/audit.ts), [lib/external-access-db.ts](../../lib/external-access-db.ts), session DAL), always with an explicit `districtId` filter.

---

## Phase 2 — Real signal (actual command output)

Commands run 2026-07-25 against the repo with the committed `.env` (`DATABASE_URL` → `aws-1-ap-south-1.pooler.supabase.com`, a live Supabase pooler).

| Check | Command | Result |
|---|---|---|
| **Typecheck** | `npx tsc --noEmit` | **PASS** (exit 0, clean) |
| **Lint** | `npm run lint` (`eslint`) | **FAIL exit 1** — 21 problems: **2 errors** + 19 warnings |
| **Test suite** | *(none exists)* | **No framework.** No vitest/jest/playwright, no `test` script, zero `*.test.*`/`*.spec.*` files. |
| **"Tests" (verify:* harness)** | `npm run verify:<name>` ×18 | **18/18 PASS** against the live DB (~4 min total) |
| **Build** | `npm run build` (`next build`) | **PASS**, ~16s wall (compile 5.1s + TS 6.4s + static-gen 0.43s) |
| **Bundle sizes** | — | **Not emitted** — the Turbopack build prints no First Load JS column (see needs-measurement) |
| **Vuln scan** | `npm audit` | **25 vulnerabilities: 20 high, 5 moderate, 0 critical** |
| **Coverage** | — | **Not available** — no coverage tooling installed |

### Lint detail
2 errors, both in **[claude-design/k-12-financial-saas-platform/project/support.js](../../claude-design/k-12-financial-saas-platform/project/support.js)** (a design mockup, not app code): `react/no-deprecated` (`ReactDOM.render`) and `@next/next/no-assign-module-variable`. These alone make `npm run lint` exit non-zero. 19 warnings in real code include unused vars ([expenditures/page.tsx:85](../../app/(district)/expenditures/page.tsx#L85), [commit.ts:70](../../lib/import/commit.ts#L70)) and **2 unused `eslint-disable` directives** ([fund-balance.ts:93](../../app/actions/fund-balance.ts#L93), [engine.ts:188](../../lib/validation/import/engine.ts#L188)).

### verify:* results (all exit 0)
`tenancy 4s · sort 1s · periods 0s · datasets 1s · m1 4s · import 4s · commit 25s · validation 10s · versioning 7s · finance 32s · browse 44s · forecast 1s · policies 3s · alerts 0s · dashboard 39s · external 4s · export 2s · sample 3s`

### npm audit detail
`metadata.vulnerabilities = {moderate:5, high:20, total:25}`. By reachability:
- **Runtime-reachable:** `next@16.2.10` (advisories incl. DoS in Server Actions, unauthenticated disclosure of internal Server Function endpoints, cache confusion, SSRF in rewrites, image-optimization DoS) — this app is Server-Action-heavy; `exceljs` → `uuid` (buffer bounds) + `archiver`/`zip-stream` (used by import/export).
- **Build/dev-only (not shipped to prod runtime):** `eslint`, `eslint-config-next`, `eslint-plugin-*`, `glob`, `minimatch`, `brace-expansion`, `rimraf`, `readdir-glob`, `@eslint/*`, `prisma`/`@prisma/dev`/`@hono/node-server`/`valibot`/`fast-uri`.
- **Conditionally reachable:** `postcss`, `sharp` (Next image optimization; app ships almost no `next/image` usage / no `images` config).

### Marker counts (hand-written code, `lib/generated/prisma` excluded)
| Marker | Count |
|---|---|
| `TODO` | **0** |
| `FIXME` | **0** |
| `@ts-ignore` | **0** |
| `@ts-expect-error` | **0** |
| `eslint-disable` | **67** across 31 files (all `no-explicit-any`, paired with intentional tenant-scope casts) |
| `: any` (hand-written) | **9** across 8 files (`lib/tenant-scope.ts` + 7 scripts) |

---

## Could not determine (not guessed)

- **Deployment target & serverless concurrency.** No Dockerfile, no CI, no `vercel.json`. Whether the app runs on Vercel/serverless (making pg pool sizing relevant) or a long-lived Node server is unknown from the repo.
- **Supabase pooler mode.** `DATABASE_URL` is a pooler host, but transaction- vs session-mode (and thus whether Prisma's prepared statements/`$transaction` behave) can't be read from code.
- **Per-route bundle sizes / First Load JS.** The Turbopack build does not print them; see needs-measurement in [02-findings.md](02-findings.md).
- **`fiscalYearFor` timezone exposure.** [lib/periods/fiscal.ts:99](../../lib/periods/fiscal.ts#L99) uses local `getMonth()/getFullYear()`; whether any caller passes a runtime `new Date()` (vs a user-entered FY string) needs a call-graph check — see needs-measurement.
