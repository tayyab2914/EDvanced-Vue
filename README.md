# EDvanced Vue — Finance Leadership Tools

A secure, multi-district SaaS platform for K–12 school finance reporting & analytics.

**Milestone 1 — Platform Foundation** delivers the secure, multi-tenant base every district runs on: authentication, per-district data isolation, roles & permissions, an admin console, and configurable per-district master data.

> ℹ️ Built on **Next.js 16** (App Router) + **React 19** + **Prisma 7** + **PostgreSQL** + **Tailwind v4**. Note Next 16 specifics honored here: request interception lives in `proxy.ts` (not `middleware.ts`); `cookies()`/`headers()`/`params`/`searchParams` are async; Prisma 7 uses the `prisma-client` generator with the `@prisma/adapter-pg` driver adapter and `prisma.config.ts`.

## Tech stack

| Layer | Choice |
|---|---|
| App & API | Next.js 16 (App Router, Server Components, Server Actions) |
| Database | PostgreSQL via Prisma 7 (`@prisma/adapter-pg`) |
| Auth | Custom: `jose` sessions (DB-backed) + `@node-rs/argon2` hashing, following Next's Data Access Layer pattern |
| Validation | Zod v4 |
| UI | Tailwind CSS v4 (hand-built components) |

## Prerequisites

- Node.js ≥ 20 (tested on 24)
- A local PostgreSQL server (the default `.env` expects user `postgres` / password `postgres`)

## Setup

```bash
npm install                 # installs deps and runs `prisma generate`

# Configure environment (see .env.example). A working local default is committed in .env:
#   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/k12_finance?schema=public
#   SESSION_SECRET=...        (generate: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
#   APP_URL=http://localhost:3000
#   PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD   (seeds the first Platform Admin)

npm run db:migrate          # creates the k12_finance database + tables
npm run db:seed             # creates the initial Platform Admin from .env
npm run dev                 # http://localhost:3000
```

Sign in at `/login` with `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD` (default `admin@k12finance.local` / `Admin!2026Pass`).

### Optional: sample data

```bash
npm run seed:demo           # creates "Demo ISD" + one user per role, all password: Demo!2026Pass
#   DISTRICT_ADMIN  demo.admin@k12finance.local
#   FINANCE_USER    demo.finance@k12finance.local
#   VIEWER          demo.viewer@k12finance.local
```

To wipe everything and start clean: `npm run db:reset && npm run db:seed`.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev / production build / serve |
| `npm run lint` | ESLint |
| `npm run db:migrate` / `db:reset` / `db:studio` | Prisma Migrate / reset / Studio |
| `npm run db:seed` / `seed:demo` | Seed Platform Admin / sample district |
| `npm run verify:m1` | Integration checks: tenant isolation, RBAC matrix, argon2 |
| `npm run verify:external` | External-user checks: approval required, derived expiry, district-local revoke |
| `npm run verify:sort` | Table-sorting rules: natural order, blanks last, stable ties |
| `npm run verify:export` | CSV export ↔ import round-trip (columns, plain numbers, no BOM) |

## How email works (dev)

Password-reset and invite emails are printed to the **server terminal** (dev console transport) — copy the link from there. A production email provider (e.g. Resend) is a later, client-confirmed step.

## Architecture

### Multi-tenancy (the core guarantee)

Shared database, shared schema, a `districtId` on every tenant-owned row. Isolation is enforced at **one choke point**: `tenantDb(districtId)` (`lib/tenant-db.ts` + `lib/tenant-scope.ts`) is a Prisma `$extends` client that auto-injects `districtId` into every read/write on tenant models. District-app code always goes through `getTenantDb()` / `resolveTenantDb()` (`lib/auth/dal.ts`) — it never touches the base client for tenant data, so a query cannot accidentally cross districts. Platform admins act on a specific district via an explicit `districtId`.

### Authentication & authorization

- **Sessions**: signed cookie (`jose`, `lib/auth/jwt.ts`) carrying a DB-backed session id (`Session` table) → revocable. Passwords hashed with argon2id (`lib/auth/password.ts`). Account lockout after 5 failed attempts for 15 min (`lib/auth/lockout.ts`).
- **DAL** (`lib/auth/dal.ts`): `getCurrentUser()` (secure, React-cached), `requireAuth`, `requireRole`, `requirePermission`, `requireDistrictAccess`.
- **Proxy** (`proxy.ts`): optimistic cookie check only (no DB) — redirects. The authoritative checks live in the DAL and in **every Server Action**.
- **Roles**: Platform Admin, District Admin, Finance User, Viewer, External User. Permission matrix in `lib/auth/permissions.ts`.

### External users (cross-district access)

Auditors/consultants who need into **several districts at once**. They break the one-user-one-district shape of `User.districtId` (which is NULL for them), so their access lives in `ExternalAccess` — **one grant per district**, each with its own status, permission level and expiry.

- A **Platform Admin** (`/platform/external-users`) adds the user and assigns districts. That only *requests* access; it grants nothing.
- Each **district** approves or denies on its own Users page (`/users?tab=external`), choosing **View Only** (≡ Viewer) or **Full Access** (≡ Finance User) and an expiry of **at most 30 days**. It can later extend, change the level, or revoke — and can also invite an external user directly, which starts ACTIVE (the district is the approver, so there's nobody left to ask). No level ever grants users/settings/audit.
- The user signs in and lands on **`/districts`**, sees every assignment and its state, and enters one (a switcher in the sidebar moves between them). The selected district is held on `Session.activeDistrictId` and **re-validated against a live grant on every request**.
- **Expiry is derived, never stored** (`status == ACTIVE && expiresAt > now`, see `lib/external-access.ts`) — there is no cron, and a lapsed grant cannot be left behind still granting access. Revoking is district-local: it never signs the user out of their other districts.

`npm run verify:external` exercises all of the above against the database.

### Project structure

```
prisma/            schema.prisma · migrations/ · seed.ts (platform admin)
prisma.config.ts   Prisma 7 CLI config (schema, migrations, seed, datasource)
proxy.ts           optimistic auth gate (Next 16, Node runtime)
lib/
  db.ts            base Prisma client (auth/platform only)
  tenant-db.ts     tenantDb(districtId) — district-scoped client
  tenant-scope.ts  pure scoping extension (shared/testable)
  auth/            jwt · session · dal · password · permissions · lockout · routes
  reference-data/  global-types.ts (platform-managed global lookup lists + seedGlobalTypes)
  master-data/     registry.ts (drives the 9 master-data resources)
  validation/      zod schemas
  audit.ts · email.ts · env.ts · forms.ts · format.ts · enums.ts · cn.ts
app/
  (auth)/          login · forgot-password · reset-password
  (platform)/      platform · districts (+ [districtId] · users) · audit
  (district)/      dashboard · master-data/[kind] · users · settings · audit
  actions/         auth · districts · users · master-data (Server Actions)
components/         app-shell · ui/* · users/* · master-data/* · district/* · audit-table
scripts/           verify-m1.mts · seed-demo.mts · dev-login.mts
```

### Extending

- **Add a district**: Platform console → Districts → New district. Districts start empty — each enters/imports its own account data (no seeded standards).
- **Add a user**: District console (or Platform → district → Users) → Add user → they receive an invite link to set a password.
- **Manage global lookups**: Platform console → Configuration → Fund/Revenue/Object/Function Types, Statuses. These are shared across all districts (Tier 1).
- **Add master data**: District console → Master data → pick a resource → Add. Districts add their own rows; they reference the platform-managed types above.
- **Export to CSV**: both Master data and Configuration have an **Export** button. It writes the rows you are currently looking at — search, filters and sort applied — and is a **read** capability, so a Viewer (or a View-Only external user) can export even though they can't Import.
  The file is written in the shape the **Import** on the same screen reads back, so export → edit in Excel → import is a supported loop: columns are keyed by their label, types/statuses are written as the name the importer resolves by (not their id), numbers are plain (`1000`, not `$1,000`), and there is deliberately **no UTF-8 BOM** — Excel would like one, but it would corrupt the first column header on re-import. The trailing `Status` column is informational; the importer ignores it. Guarded by `npm run verify:export`.
- **Add a validation rule / dataset / dashboard**: layered on this foundation in Milestones 2–3.

## Milestone 1 scope

**Included**: secure login, password reset, account lockout, multi-district isolation, 4 roles + permission matrix, platform admin console (district CRUD, onboarding, cross-district user management, platform audit), district console (dashboard, users, settings, audit), platform-managed global lookups (fund/revenue/object/function types, statuses), per-district master data (schools, grants, capital projects, funds, revenue sources, functions, objects), audit log, seeding.

**Deferred (M2/M3)**: Excel upload + validation engine, periodic financial datasets, snapshots/version history, dashboards & charts, exports, email provider, MFA/SSO. The schema is designed so periodic data FKs cleanly into the master data built here.

## Notes & follow-ups to confirm with the client

- The platform-managed global lookup lists in `lib/reference-data/global-types.ts` (Fund/Revenue/Object/Function Types, Statuses) are a **representative starter set** — Platform Admins finalize them in-app under Configuration. Function Types in particular is intentionally short pending the client's full list.
- Default: **Finance User** is read-only on master data (adjustable in `lib/auth/permissions.ts`).
- Production email provider + verified sending domain.
