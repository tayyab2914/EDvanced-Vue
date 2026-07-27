# 02 — Findings

**Audited:** 2026-07-25 · read-only · EDvanced Vue (Next.js 16 / Prisma 7 / Postgres)

This codebase is unusually well-built: tenant isolation runs through one documented choke point, authz is enforced on every mutating action, money is `Decimal` throughout, financial reads use `aggregate`/`groupBy` (no N+1, no detail-row loading in hot paths), typecheck is clean, and all 18 `verify:*` scripts pass against the live DB. The findings below are real but mostly sit at the edges: dependency freshness, missing rate limits, no CI to enforce the guards that already exist, and a few quality items.

**Severity:** P0 broken/exploitable in prod · P1 real user pain or real cost · P2 quality/maintainability.
**Effort:** S < 1h · M < ½ day · L > 1 day.

---

## Quick wins (high impact · effort S · low risk)

1. **F-01** — Bump `next` 16.2.10 → 16.2.11 to close reachable Server-Action advisories. *(S, low risk)*
2. **F-03** — Add security headers (`HSTS`, `X-Content-Type-Options`, `frame-ancestors`, `Referrer-Policy`) in [next.config.ts](../../next.config.ts). *(S, low risk)*
3. **F-04** — Add a CI workflow running `verify:tenancy` + `tsc --noEmit` + `lint` so the fail-open tenant guard is actually enforced on every change. *(S, low risk — high impact)*
4. **F-08** — Fix the 2 lint errors / ignore `claude-design/**` and drop the 2 unused `eslint-disable` directives so `npm run lint` can gate CI. *(S, low risk)*
5. **F-06** — Delete the two dead over-fetch functions in [lib/forecast/engine.ts](../../lib/forecast/engine.ts) (or convert to `groupBy`). *(S, low risk)*

---

## Summary table

| ID | Title | Sev | Effort | File |
|---|---|---|---|---|
| F-01 | `next@16.2.10` has reachable Server-Action advisories | P1 | S | package.json |
| F-02 | No rate limiting on any endpoint (password-reset bomb, credential stuffing) | P1 | M | app/actions/auth.ts:121 |
| F-04 | Tenant allowlist fails open, and no CI runs the guard | P1 | S | lib/tenant-scope.ts:9 |
| F-03 | No security headers set | P2 | S | next.config.ts:3 |
| F-05 | Racy get-or-create in `saveFundBalanceOverride` | P2 | S | app/actions/fund-balance.ts:87 |
| F-06 | Dead functions load the largest table's detail rows into Node | P2 | S | lib/forecast/engine.ts:124 |
| F-07 | `exceljs` pulls high-severity `uuid`/`archiver` (reachable) | P2 | M | package.json |
| F-08 | `npm run lint` exits non-zero from a mockup file; unused directives | P2 | S | eslint.config.mjs |
| F-09 | No CI, no test framework, no coverage; "tests" mutate a shared live DB | P2 | M | package.json |
| F-10 | Reset link written to server logs on SMTP failure | P2 | S | lib/email.ts:79 |
| F-11 | `unify_project_master` migration takes ACCESS EXCLUSIVE on 3 largest tables | P2 | — | prisma/migrations/20260719120000_unify_project_master |

*(Sorted below by severity, then effort ascending.)*

---

## Details

### F-01 · `next@16.2.10` has reachable Server-Action advisories — P1 · S
**Where:** [package.json:44](../../package.json#L44) (`"next": "16.2.10"`)
**Now:** `npm audit` flags `next` with advisories including *"Denial of Service in App Router using Server Actions"* and *"Unauthenticated disclosure of internal Server Function endpoints"*. This app routes ~50 mutations through Server Actions ([app/actions/](../../app/actions)), so those two are reachable, not theoretical. Fixed version is `16.2.11`.
**Why wrong:** a known-vulnerable framework version, with the vulnerable surface (Server Actions) heavily used.
**Fix:** `npm install next@16.2.11 eslint-config-next@16.2.11` (patch bump within 16.2.x). Re-run `npm run build` + `verify:*`.
**Risk:** low — patch release, same minor. Verify the build and a login/upload smoke test afterward.

### F-02 · No rate limiting on any endpoint — P1 · M
**Where:** [app/actions/auth.ts:121 `requestPasswordReset`](../../app/actions/auth.ts#L121); also `login` [:42](../../app/actions/auth.ts#L42) and [app/api/import/upload/route.ts:35](../../app/api/import/upload/route.ts#L35). A repo-wide grep for `rateLimit|throttle|Ratelimit` returns **no matches** — the only throttle in the system is the per-account login lockout.
**Now:** `requestPasswordReset` is unauthenticated and, for any registered email, creates a `VerificationToken` and sends an email on **every** call:
```ts
const user = await prisma.user.findUnique({ where: { email } });
if (user && user.status !== UserStatus.DISABLED) {
  const raw = await createVerificationToken(user.id, TokenType.PASSWORD_RESET, RESET_TTL_MS);
  await sendPasswordResetEmail(user.email, user.name, buildTokenLink(raw));
```
There is no limit on how often this runs, so a script can email-bomb a target and inflate the token table. `login` locks a single account after 5 fails but nothing throttles per-IP, so credential-stuffing **across many accounts** is unthrottled. The upload route parses a 4MB file per request with no per-user cap.
**Why wrong:** auth and expensive routes are exactly where rate limits belong; the login lockout only covers one of several abuse paths.
**Fix:** add one small limiter (a fixed-window counter keyed by IP+route, either in `proxy.ts` — which is Node runtime — or a shared helper) and apply it to `requestPasswordReset`, `login`, and the upload route. Start with generous limits (e.g. 5 reset requests / IP / 15 min).
**Risk:** low–medium — must not lock out legitimate bursts; make limits generous and log rather than hard-fail initially.

### F-04 · Tenant allowlist fails open, and no CI runs the guard — P1 · S
**Where:** [lib/tenant-scope.ts:9-24](../../lib/tenant-scope.ts#L9), enforced by `npm run verify:tenancy`; **no** `.github/workflows/` exists.
**Now:** the tenant scoping is an allowlist that, by the file's own words, *"fails OPEN: a tenant-owned model missing from it is silently not scoped at all."* The comment documents this has already caused a live cross-tenant leak (`DistrictPolicy`, `ForecastAssumption`, `FundBalanceProjection` added to the schema but not the set). `verify:tenancy` now enforces the invariant by reading `schema.prisma` — **but nothing runs it automatically.** There is no CI and no pre-commit hook, so a new `districtId` model shipped without updating `TENANT_MODELS` would leak, exactly as before, until someone remembers to run the script.
**Why wrong:** a correctly-designed guard that isn't wired to run is not a guard. The one control protecting cross-tenant isolation is manual.
**Fix:** add a CI workflow (GitHub Actions) that runs `npm run verify:tenancy`, `npx tsc --noEmit`, and `npm run lint` on every push/PR. `verify:tenancy` needs no DB for the schema-invariant check; the other verify scripts that need a DB can stay manual.
**Risk:** low — additive; the only friction is fixing F-08 first so `lint` passes.

### F-03 · No security headers set — P2 · S
**Where:** [next.config.ts](../../next.config.ts) — only `serverExternalPackages`; no `headers()`.
**Now:** the app sends no `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, or frame-ancestors/`X-Frame-Options`. For a financial app on HTTPS these are baseline.
**Why wrong:** missing HSTS allows SSL-strip downgrade; missing `X-Content-Type-Options: nosniff` and frame-ancestors widen XSS/clickjacking surface.
**Fix:** add an `async headers()` in `next.config.ts` returning `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Content-Security-Policy: frame-ancestors 'none'` for all routes.
**Risk:** low — a strict full CSP could break inline styles, so ship the header set above first and add a full `Content-Security-Policy` separately after testing.

### F-05 · Racy get-or-create in `saveFundBalanceOverride` — P2 · S
**Where:** [app/actions/fund-balance.ts:87-107](../../app/actions/fund-balance.ts#L87)
**Now:** the override is upserted by hand because the tenant extension forbids `upsert`:
```ts
const updated = await db.fundBalanceOverride.updateMany({ where, data: {...} });
if (updated.count === 0) {
  await db.fundBalanceOverride.create({ data: {...} as any });
}
```
Two concurrent submits (a double-click, a retry) can both read `count === 0` and both attempt `create`; the second hits `@@unique([districtId, fiscalYear, period, fundId, field])` and throws Prisma `P2002`, which is unhandled and surfaces as a generic error to the admin. Data integrity is safe (the index holds); the UX is a crash.
**Why wrong:** a non-atomic read-then-write across a uniqueness constraint is a classic double-submit race.
**Fix:** wrap the `create` in `try/catch`, and on `P2002` fall back to a second `updateMany` (which now finds the row). Small, local, keeps the extension's `upsert` ban intact.
**Risk:** low — pure error-path hardening; no behavior change on the happy path.

### F-06 · Dead functions load the largest table's detail rows into Node — P2 · S
**Where:** [lib/forecast/engine.ts:124](../../lib/forecast/engine.ts#L124) (`projectRevenueByCategory`) and [:183](../../lib/forecast/engine.ts#L183) (`projectExpenditureByCategory`).
**Now:** both `findMany` **every detail row** of the version, then fold in a JS `Map`:
```ts
const rows = await db.expenditureActual.findMany({
  where: { versionId: expVersion },
  select: { actualYtd: true, budget: true, object: { select: { objectTypeId: true } } },
});
```
`ExpenditureActual` is *"the largest table in the platform by a wide margin"* (schema comment) — tens of thousands of rows per district-month — and [lib/finance/breakdown.ts:11-13](../../lib/finance/breakdown.ts#L11) explicitly forbids exactly this pattern, noting `expenditureByObjectType` is the grouped replacement. **However**, a grep shows these two functions have **no callers** (the forecast page uses `projectFundBalance` → `activityTotals`, which correctly uses `aggregate`). So this is dead code, not a live performance bug — a latent trap that would scan the largest table if ever wired to a page.
**Why wrong:** dead code that models a forbidden pattern invites someone to call it.
**Fix:** delete both functions, or convert them to `groupBy(["objectId"/"revenueSourceId"])` + a lookup fold, mirroring `expenditureByObjectType`.
**Risk:** low — no callers; deletion changes no behavior. *(Unconfirmed: exact row counts / latency — these functions never run today.)*

### F-07 · `exceljs` pulls high-severity `uuid`/`archiver` (reachable) — P2 · M
**Where:** [package.json:42](../../package.json#L42) (`exceljs ^4.4.0`). `npm audit`: `exceljs` (high) via `archiver` + `uuid` (`uuid < 11.1.1` missing buffer bounds check).
**Now:** import parsing and workbook export use exceljs, so this dependency is genuinely reachable — unlike the dev-only eslint/glob chain. The advised fix is a breaking `exceljs@3.4.0` downgrade (`npm audit fix --force`), which is the wrong direction.
**Why wrong:** a reachable dependency carries a high-severity transitive vuln with no clean forward fix at present.
**Fix:** check for an `exceljs@^4` release that bumps `uuid`/`archiver`; if none, pin `uuid`/`archiver` via an `overrides` block in `package.json` to patched versions and re-run `npm audit`. The `uuid` buffer bug only triggers when a `buf` argument is passed to v3/v5/v6 — verify whether exceljs's code path does; if not, this is low practical risk and can be tracked rather than force-fixed.
**Risk:** medium — `overrides` can pull an incompatible transitive; test import/export (`verify:import`, `verify:export`) after.

### F-08 · `npm run lint` exits non-zero from a mockup file; unused directives — P2 · S
**Where:** [eslint.config.mjs](../../eslint.config.mjs); errors in [claude-design/.../support.js](../../claude-design/k-12-financial-saas-platform/project/support.js); unused directives at [fund-balance.ts:93](../../app/actions/fund-balance.ts#L93), [engine.ts:188](../../lib/validation/import/engine.ts#L188).
**Now:** `npm run lint` returns exit 1 solely because of 2 errors in a design-mockup JS file that is not part of the app build. That means lint can't be used as a CI gate (F-04) until it's green. Separately, 2 `eslint-disable` directives no longer suppress anything, and several unused-var warnings exist in real code.
**Why wrong:** a lint command that always fails can't gate anything, and the failure comes from non-shipped code.
**Fix:** add `claude-design/**` to `globalIgnores([...])` in `eslint.config.mjs` (or delete the mockup if unused); remove the 2 stale `eslint-disable` lines; clear the unused-var warnings.
**Risk:** low — config/comment-only changes.

### F-09 · No CI, no test framework, no coverage — P2 · M
**Where:** repo root — no `.github/`, no `Dockerfile`, no `vitest`/`jest`/`playwright`, no `test` script.
**Now:** quality gating rests entirely on TypeScript `strict` + the `verify:*` scripts. Those scripts are genuinely valuable (all 18 pass), but they are a homegrown `tsx` harness: run manually, not isolated, and they **seed/mutate whatever `DATABASE_URL` points at** — currently a shared Supabase pooler. There is no coverage measurement, so "test suite with coverage" (a Phase-2 ask) cannot be produced.
**Why wrong:** no automated gate means regressions ship silently, and the verify scripts' side effects on a shared DB make them unsafe to run casually or in CI without a throwaway database.
**Fix (incremental):** (1) F-04's CI covers typecheck/lint/verify:tenancy with no DB; (2) stand up a disposable Postgres (a CI service container) so the DB-touching `verify:*` scripts can run in CI against it, not the shared pooler; (3) longer term, adopt a real runner if coverage numbers are wanted.
**Risk:** low to add CI; medium to make the DB-touching scripts CI-safe (needs an ephemeral DB + `prisma migrate deploy`).

### F-10 · Reset link written to server logs on SMTP failure — P2 · S · (flag / intentional?)
**Where:** [lib/email.ts:63-81](../../lib/email.ts#L63)
**Now:** `sendEmail` never throws; when SMTP is unset **or a send fails**, it logs the full message body — including the password-reset link — to the server console:
```ts
} catch (err) {
  console.error("[email] SMTP delivery failed:", err);
  logToConsole(msg, "SMTP FAILED — link below for manual recovery");
}
```
The comment says this is deliberate ("so any link can still be recovered"). In production with SMTP configured, a transient failure drops a live reset token into logs that may be shipped to a log aggregator with a broader audience than the mailbox owner.
**Why possibly wrong:** reset tokens are bearer credentials; logging them widens who can use them. **This looks intentional — flagging rather than asserting a bug.** Is console-logging the link on *production* SMTP failure the intended behavior, or only the unconfigured-dev fallback?
**Fix (if not intended):** in production, on SMTP failure log the error and a token *reference* (id/hash), not the link; keep the full-body console fallback for the unconfigured-dev path only (`if (!SMTP_CONFIGURED)`).
**Risk:** low — a conditional around one log call.

### F-11 · `unify_project_master` migration locks the 3 largest tables — P2 · (already applied)
**Where:** [prisma/migrations/20260719120000_unify_project_master/migration.sql](../../prisma/migrations/20260719120000_unify_project_master)
**Now:** it `DROP COLUMN capitalProjectId, grantId; ADD COLUMN projectId` and adds FKs on `BudgetLine`, `RevenueActual`, `ExpenditureActual` — the three largest tables. `ALTER TABLE … DROP/ADD COLUMN` + FK creation take `ACCESS EXCLUSIVE` locks, and validating a new FK scans the table. On a populated production table this is a write-blocking outage for the duration of the scan.
**Why wrong:** a lock-taking migration on the biggest tables, run in-band, can stall the app during deploy. (The migration comment implies data is regenerated by re-importing samples, so in the seeded environment the tables may be empty at migration time — but that assumption won't hold for a real district.)
**Fix:** for *future* large-table migrations, add columns nullable first, add FKs `NOT VALID` then `VALIDATE CONSTRAINT` in a separate step (which takes a weaker lock), and avoid `DROP COLUMN` on hot tables during peak. This migration is already applied — the value here is the pattern for the next one.
**Risk:** N/A to change retroactively; a process note for future migrations.

---

## Needs measurement (not tied to a file:line, or unconfirmed)

| Item | Why unconfirmed | Command / test to confirm |
|---|---|---|
| **Per-route bundle sizes / First Load JS** | The Turbopack `next build` does not print a size column. | `ANALYZE=true`… not configured; instead run `next build --webpack` if available, or add `@next/bundle-analyzer` temporarily and inspect `.next/analyze`. Then re-check whether any route ships an oversized client bundle. |
| **`fiscalYearFor` timezone correctness** | [lib/periods/fiscal.ts:99](../../lib/periods/fiscal.ts#L99) uses local `getMonth()/getFullYear()`. Whether any request-time caller passes `new Date()` (vs a user-entered FY string) is unknown. | `grep -rn "fiscalYearFor(" app lib` and trace each caller's date source. If a runtime `new Date()` reaches it and the server TZ ≠ district TZ, a date near month-end could misclassify the fiscal year. |
| **Serverless pg pool exhaustion** | [lib/db.ts:8](../../lib/db.ts#L8) sets no `max`; behavior depends on deployment (serverless vs long-lived) and Supabase pooler mode — neither is in the repo. | Confirm deploy target. If serverless behind the Supabase **transaction** pooler, current setup is typically fine; if session-mode or long-lived, set an explicit `PrismaPg` pool `max`. Load-test concurrent dashboard loads and watch Supabase connection count. |
| **Upload memory under max payload** | [route.ts:91](../../app/api/import/upload/route.ts#L91) does `Buffer.from(await file.arrayBuffer())` — whole 4MB file + parsed rows in lambda memory. | Upload a 4MB xlsx at the largest realistic row count and measure peak RSS of the handler; confirm it stays within the function's memory limit. |
| **`next` advisory applicability** | Some `next` advisories are conditional (edge runtime / custom server / rewrites — none used here). | After bumping to 16.2.11 (F-01), re-run `npm audit` and confirm the `next` entry clears. |

---

## Verified vs inferred

- **Verified by running:** typecheck (clean), lint (2 errors/19 warnings), `next build` (16s, no bundle sizes), `npm audit` (25 vulns), all 18 `verify:*` (pass), marker counts (0 TODO/FIXME/ts-ignore; 9 hand `any`; 67 `eslint-disable`). Verified by reading the real code: F-02 (no limiter anywhere), F-04 (fail-open allowlist + absent CI), F-05 (updateMany-then-create), F-06 (findMany-all-rows + **no callers**), F-10 (log-on-failure), and that authz + tenant scoping are correctly enforced (audit paths hard-scope `districtId` from the session; no IDOR found).
- **Inferred / needs a runtime check:** all rows in "Needs measurement" — deployment topology, pool behavior, timezone call-graph, bundle sizes, and the exact reachability of individual `next`/`exceljs` CVE code paths.
- **Flagged as possibly intentional (asked, not asserted):** F-10 (reset-link logging), and by design (not findings): the `TENANT_MODELS` fail-open choice, non-FK actor columns, and the SMTP console fallback — all documented in-code with rationale.
