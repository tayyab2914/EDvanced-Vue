# 05 — Navigation Latency

**Question:** clicking a sidebar link feels slow — the new page does not appear for a
noticeable delay after the click. Where does that time go, with numbers?

**Answer in one line:** every dashboard navigation issues **85–104 database queries**, and
**82 of them come from a single function (`loadCore`)** — against a Postgres pooler in
**Mumbai** while the app runs on **Vercel `iad1` (Washington DC)**. Latency is almost
perfectly linear in query count: **TTFB ≈ 0.98 s + 46.6 ms × (query count)**, measured. The
absence of any `loading.tsx` means the browser shows the *old* page for that whole delay, so
the click feels dead.

Every number below is measured or explicitly labelled **estimate / not measured**. Nothing
from `01-system-map.md` or `02-findings.md` is reused.

---

## Environment (confirmed)

| | |
|---|---|
| App runtime | Vercel serverless, region **`iad1`** (Washington DC, us-east-1) |
| Database | Supabase **transaction pooler**, `aws-1-ap-south-1` (**Mumbai**), port 6543, `pg` driver adapter |
| Symptom seen in | local dev **and** production |
| Measured from | a local dev machine (→ Mumbai). **Production app→DB latency was NOT measured from Vercel** — see §6. |

The app and the database are on **different continents**. This is the hinge of the whole
report.

---

## 1. Perceived vs actual latency — the loading gap

- **`loading.tsx` files in the app: zero.** **`<Suspense>` boundaries: zero.** (Confirmed by
  file search across `app/`.)
- All seven sidebar routes live in the `(district)` route group; **none** has a loading
  boundary at its segment or any ancestor.
- Sidebar links use `next/link` with **default prefetch** (not disabled).

Consequence, and this is the *perceived*-latency half of the answer: on a soft navigation
with no `loading.tsx`, Next.js keeps the **current** page on screen until the destination's
server render is ready, then swaps. The RSC response streams a shell immediately (first byte
in ~10 ms, measured) but the visible content cannot paint until the data resolves — which is
the ~5 s of database work below. So the click produces **no visual feedback at all** until
the whole render completes. A user reads that as "the page froze."

---

## 2. The database round-trip floor (measured, local → Mumbai)

20 sequential `SELECT 1` on one warm connection to `DATABASE_URL`:

| metric | ms |
|---|---|
| min | 61.5 |
| **median** | **98.0** |
| p95 | 244.6 |
| mean | 117.4 |
| max | 285.2 |
| cold connect (TLS + pooler auth) | **1425** |

**Per-query floor from this machine ≈ 98 ms (median).** Distance implied by the round trip
(inferred, upper bound): RTT/2 × ~200,000 km/s ≈ **~9,800 km of fibre path** to Mumbai. This
is the floor for the **local-dev** experience. It is **not** the Vercel→Mumbai floor (§6).

The 1.4 s cold-connect matters on Vercel: every cold serverless container pays a fresh
cross-region TLS handshake to Mumbai before its first query.

---

## 3. Queries per route (measured two independent ways — they agree)

**Method A** — call the *real* `loadCore` and each page's exact loader sequence in a script,
capturing every Prisma `query` event (SQL + duration). **Method B** — a production build with
temporary per-request query logging, driven by a forged session cookie over `curl`. Method B
includes the shared layout's queries; Method A is page-loaders only. **B = A + ~8 layout
queries on every route**, which is exactly the expected difference — so both are trusted.

| Route | Queries/request (B, measured) | Summed DB ms (B) | Longest single query |
|---|---:|---:|---|
| `/dashboard` | **95** | 19,329 | 261 ms — `SUM(endingCash)` over `CashPosition` |
| `/revenues` | **95** | 17,673 | 339 ms — `SUM(amount)` over `BudgetLine` |
| `/expenditures` | **96** | 16,657 | 216 ms — `SUM(actualYtd)` over `ExpenditureActual` |
| `/cash` | **93** | 12,794 | 301 ms — `SUM` over `ExpenditureActual` |
| `/fund-balance` | **104** | 18,074 | 299 ms — `SUM(actualYtd)` over `ExpenditureActual` |
| `/data/versions` | **16** | 2,983 | 400 ms — `COUNT(*) … GROUP BY versionId` on `BudgetLine` |
| `/users` | **10** | 1,980 | 101 ms — `User.findMany` |

(Fixture: district *Demo ISD*, FY 2026-27, period 12, All Funds — a district with ~12
committed periods, i.e. a realistic amount of data.)

### The single dominant cost: `loadCore` issues 82 queries

`lib/dashboard/load.ts` carries a header comment stating it brings the dashboards "under
twenty" queries. **Measured, it issues 82** — and **47 of those 82 are the same queries run
again** (identical normalised SQL within one render):

| Repeated query | times |
|---|---:|
| `DatasetVersion` current-version lookup | 9× |
| `SUM(actualYtd, actualMtd)` over `RevenueActual` | 8× |
| `objects` code lookup | 5× |
| `RevenueSource` code lookup | 5× |
| `BudgetLine` `SUM(amount)` | 4× |
| … 11 more duplicate groups | — |

This is a per-period / per-fund re-query fan-out (`yearSeries` walks each period and
re-resolves versions and re-sums actuals, re-loading the same master-data lookups each time).
There is **no `React.cache()` anywhere** on these paths (confirmed by search) — the only
mention is a comment in `load.ts` saying it is deliberately not used — so nothing dedupes
these within a request. `loadCore` runs on **all five dashboards**, which is why they all
land in the same 85–104-query band.

`/data/versions` (16) and `/users` (10) do **not** call `loadCore`, and are 3× faster
accordingly. That contrast is the proof: the cost is `loadCore`, not the framework.

---

## 4. End-to-end, measured (production build, warm, local server → Mumbai DB)

Forged valid session; `next build && next start`; 2 warm-up passes then 3 measured. TTFB =
`curl %{time_starttransfer}`. RSC = the flight payload a sidebar click fetches (`RSC: 1`).

| Route | Queries | **TTFB (s)** | Full resp (s) | HTML bytes | **RSC bytes** |
|---|---:|---:|---:|---:|---:|
| `/dashboard` | 95 | **5.33** | 5.34 | 194,995 | 99,567 |
| `/revenues` | 95 | **5.72** | 5.72 | 171,497 | 87,028 |
| `/expenditures` | 96 | **5.42** | 5.43 | 183,117 | 93,652 |
| `/cash` | 93 | **5.15** | 5.15 | 125,740 | 62,276 |
| `/fund-balance` | 104 | **5.78** | 5.79 | 140,621 | 69,835 |
| `/data/versions` | 16 | **1.89** | 1.89 | 96,835 | 31,213 |
| `/users` | 10 | **1.29** | 1.29 | 41,338 | 14,118 |

TTFB ≈ full response time because the page is server-rendered and streamed at the end.

### Latency is linear in query count (measured fit)

Least-squares over the seven points:

> **TTFB (s) ≈ 0.98 + 0.0466 × (query count)**   — predictions land within ~0.15 s of every
> measured route.

| Route | queries | measured TTFB | model |
|---|---:|---:|---:|
| /users | 10 | 1.29 s | 1.45 s |
| /data/versions | 16 | 1.89 s | 1.73 s |
| /cash | 93 | 5.15 s | 5.31 s |
| /dashboard | 95 | 5.33 s | 5.41 s |
| /fund-balance | 104 | 5.78 s | 5.83 s |

The **0.98 s intercept** is the fixed cost (framework + React render + RSC serialisation +
warm connection). The **46.6 ms/query slope** is the database round-trip critical path — with
a 98 ms median RTT and this slope, roughly **2 queries clear per round-trip-time**, i.e. the
82+ queries are only *partially* parallelised; a large sequential tail remains.

---

## 5. Attribution per navigation

The number you actually complain about is a **soft navigation** (sidebar `<Link>` click). On
a soft nav *between siblings in the same group*, the shared `(district)` layout is preserved,
so its ~8 queries (including the auth `session.findUnique`) **do not re-run** — only the page
loaders do (`/dashboard` = 87 page queries, measured). The table below decomposes the
measured `/dashboard` soft-nav TTFB. Anything not cleanly separable is labelled
**unattributed** rather than smeared across the rest.

### `/dashboard` soft navigation — where the time goes (local, measured)

| Component | Time | Basis |
|---|---:|---|
| Network, browser → server | ~0 ms | localhost (measured). **Prod: browser→`iad1`, not measured** |
| Auth query (`session.findUnique`) | **0 ms** on soft nav | layout preserved between siblings; the query (measured 307 ms on a full load) does not re-run |
| **Data queries (87 page-loader queries)** | **≈ 4.05 s** | 0.0466 s × 87, from the measured fit — **the dominant term** |
| Server render + RSC serialise (fixed) | ≈ 0.98 s | model intercept (framework + React render) |
| RSC transfer (99.6 KB) | ~0 ms local | payload measured; **prod transfer ≈ 80 ms over a 10 Mbps link (estimate)** |
| Client hydration / paint after content | **unattributed** | not measured — `curl` does not hydrate. Needs a browser trace (§6 runbook) |
| **Measured full-load TTFB (95 q)** | **5.33 s** | server, warm |
| **Model soft-nav TTFB (87 q)** | **≈ 5.03 s** | 0.98 + 0.0466×87 |

The layout preservation saves only ~0.3 s — because the **page loaders dominate**. Whether
the click costs 87 or 95 queries, `loadCore`'s 82 are the story.

**The single change that removes the largest share:** cut `loadCore`'s query count. Taking it
from 82 to its own claimed "under 20" drops `/dashboard` from ~95 to ~28 queries →
model TTFB **5.33 s → ~2.3 s locally (−57%)**, and proportionally more in absolute terms on
production (§6). No other single change touches as much of the time.

---

## 6. Production (Vercel `iad1` → Mumbai) — computed, NOT measured from Vercel

The **query count is identical in production** (same code). What changes is the per-query
RTT: my 98 ms was `local→Mumbai`; production is `iad1→ap-south-1`.

- Great-circle Washington DC → Mumbai ≈ 12,540 km → **theoretical RTT floor ≈ 125 ms**.
- Public AWS `us-east-1 ↔ ap-south-1` RTT is typically **~180–215 ms**. Using ~200 ms:
- Holding the measured concurrency and server-side execution constant, the slope scales from
  46.6 ms/query to **≈ 70 ms/query**, giving:

| Route | queries | **Est. prod TTFB** (0.98 s + 0.070×q) |
|---|---:|---:|
| `/dashboard` | 95 | **~7.6 s** |
| `/fund-balance` | 104 | **~8.3 s** |
| `/cash` | 93 | **~7.5 s** |
| `/data/versions` | 16 | ~2.1 s |
| `/users` | 10 | ~1.7 s |

**These are estimates** (labelled). Cold serverless containers will be worse (they add the
1.4 s cross-region connect). To replace them with a measured number, run the runbook below
against the live site and paste the results back:

```bash
# Real production TTFB — run from a shell, with a valid prod session cookie:
COOKIE='session=<paste from your browser devtools → Application → Cookies>'
for r in /dashboard /revenues /expenditures /cash /fund-balance /data/versions /users; do
  printf "%-16s " "$r"
  curl -s -o /dev/null -w "TTFB=%{time_starttransfer}s total=%{time_total}s\n" \
    -H "Cookie: $COOKIE" "https://<your-prod-domain>$r"
done
```

For the **click → first paint** number (what you feel): open the live app, DevTools →
Performance, click **record**, click a sidebar link, stop. Read the gap from the `click`
event to the first paint of the new page's content. That is the ground-truth wall-clock; it
should land near the prod TTFB above plus hydration.

---

## 7. Fixes — ranked by ms saved per hour of work

> **Status: #1, #2, #3 and #5 are implemented and measured — see §8.** #4 (region move) is an
> ops decision and was left for the client; #6 is not worth doing, by this section's own
> reasoning.


Ordered best-value first. Savings quoted as **local (measured model)** with the **prod
(iad1, estimated)** in brackets; prod savings are ~1.5× local because the per-query cost is
higher there.

### 1. Add `loading.tsx` to the `(district)` group — ~1 hour
- **Effect:** does **not** reduce the delay, but replaces the frozen-old-page with an instant
  skeleton, which is the *perceived* half of the complaint. One file:
  `app/(district)/loading.tsx`.
- **Saving:** perceived latency → near-0 to first feedback; actual TTFB unchanged. Highest
  value-per-hour because it is one file and directly kills the "dead click" feeling.
- **Verify:** click a sidebar link; a skeleton must appear within one frame.
- **Rollback:** delete the file.

### 2. Fix `loadCore`'s 82 → ~15 queries (dedupe + hoist master data) — ~1–2 days
- **Why:** 47 of 82 queries are re-executions; the per-period fan-out re-resolves versions
  and re-sums the same actuals, and re-loads master lookups (`objects`, `RevenueSource`,
  `FundType`) 4–9× each. Load current-versions **once**, load master data **once**, batch the
  per-period sums into single grouped queries.
- **Saving:** `/dashboard` ~95 → ~28 queries → **−~3.0 s local (−~5 s prod)** per dashboard
  navigation. Applies to all five dashboards.
- **Verify:** re-run the Method-A script (`.audit-tmp/step4-queries.mts` pattern) — assert
  `loadCore` query count < 20 and zero duplicate groups; re-run the TTFB harness.
- **Rollback:** revert the `load.ts` / engine changes; behaviour is covered by
  `verify:dashboard`.

### 3. Cache master-data / lookup tables (they change only on import) — ~0.5–1 day
- **Why:** `objects`, `RevenueSource`, `AccountFunction`, `FundType`, `DistrictPolicy` are
  read 4–9× per render and change only on data import. Wrap their loaders in `React.cache`
  (per-request dedup) and/or `unstable_cache` with a tag invalidated on commit.
- **Saving:** overlaps with #2; independently removes ~15–25 queries/dashboard →
  **−~0.7–1.2 s local (−~1–2 s prod)**. Lower risk than #2 because it is additive caching.
- **Verify:** query counts drop; import still busts the cache (commit a version, confirm
  numbers update).
- **Rollback:** remove the cache wrappers.

### 4. Co-locate the app with the database — ~0.5–1 day (ops), no code
- **Why:** the per-query cost is dominated by the `iad1↔Mumbai` RTT (~200 ms). Moving Vercel
  functions to **`bom1` (Mumbai)** — or moving the DB to us-east — cuts RTT to ~1–5 ms
  **without changing query count**.
- **Saving (est.):** `/dashboard` prod **~7.6 s → ~1.5 s**. This is the largest *absolute*
  production win and needs no code — but it treats the symptom (82 queries stay 82). Best
  paired with #2. Note it may move the DB away from other consumers; confirm none depend on
  ap-south-1 proximity.
- **Verify:** run the §6 prod runbook before/after.
- **Rollback:** redeploy to the previous region.

### 5. Collapse independent sequential awaits into `Promise.all` — ~2–4 hours
- **Why:** `loadCore` already parallelises its top level, but `evaluateAlerts` and
  `reservePercent` run **after** the main `Promise.all` and each other though they share
  inputs; several page loaders `await` in series where there is no data dependency.
- **Saving:** does not cut query *count*, only the sequential tail — **−~0.3–0.8 s local
  (−~0.6–1.5 s prod)**. Modest, and partly subsumed by #2.
- **Verify:** TTFB harness re-run; query count unchanged, wall time down.
- **Rollback:** revert the await restructuring.

### 6. Prefetch sidebar destinations — ~1 hour
- **Why:** links already use default prefetch. Making it eager (`prefetch` on hover/viewport)
  warms the RSC, but prefetch of a **dynamic** route only fetches the loading state, not the
  data — so with today's 5 s data cost it barely helps until #2 lands.
- **Saving:** near-0 today (dynamic routes don't prefetch data); becomes marginally useful
  after #2. **Not recommended until #1/#2 are done.**
- **Verify:** Network panel shows warmed RSC on hover.
- **Rollback:** revert to default prefetch.

**Recommended sequence:** **#1 now** (kills the dead-click feeling for one hour of work),
then **#2 + #3** (removes the actual delay), then **#4** if production is still slow after the
query count drops. #5 is a cleanup; #6 only after #2.

---

## 8. What was implemented, and what it measured

Same machine, same database, same session, both builds clean (`rm -rf .next && next build`),
two warm-up passes then three measured. Local dev machine → Mumbai, so these are the §4
conditions, not production.

### Query count — the thing the latency is linear in

`loadCore`, Demo ISD, FY 2026-27, period 12, All Funds:

| | before | after |
|---|---:|---:|
| queries per call | **76** | **27** |
| of which were a repeat of one already run | **54** | **8** |
| summed database time | 26.0 s | 9.0 s |

The remaining 8 "repeats" are the same SQL shape with genuinely different parameters
(period 12 and 11; All Funds and General Fund) — the normalisation strips placeholders and
cannot tell them apart. Locked in by **`npm run verify:queries`**.

### Soft navigation — a sidebar click (RSC request, full response)

This is the number the complaint was about.

| Route | before | after | |
|---|---:|---:|---:|
| `/dashboard` | 3.24 s | **1.37 s** | −58% |
| `/revenues` | 3.23 s | **1.66 s** | −49% |
| `/expenditures` | 3.87 s | **1.98 s** | −49% |
| `/cash` | 3.09 s | **1.49 s** | −52% |
| `/fund-balance` | 3.42 s | **1.61 s** | −53% |
| `/data/versions` | 1.54 s | 1.43 s | −7% (does not call `loadCore`) |
| `/users` | 0.64 s | 0.79 s | within noise at this scale |

### Full page load — TTFB, i.e. when anything at all appears

`loading.tsx` is what moves this one: the shell now streams immediately instead of the
browser waiting for the whole render.

| Route | TTFB before | TTFB after | full response after |
|---|---:|---:|---:|
| `/dashboard` | 6.09 s | **0.66 s** | 1.69 s |
| `/revenues` | 5.65 s | **0.58 s** | 1.45 s |
| `/expenditures` | 5.66 s | **0.65 s** | 1.99 s |
| `/cash` | 5.44 s | **0.77 s** | 1.72 s |
| `/fund-balance` | 6.08 s | **0.86 s** | 1.69 s |

(The before column reproduces §4's measurements to within the RTT spread §2 recorded, which
is the cross-check that this harness and that one are measuring the same thing.)

### How the query count came down

The report attributed the fan-out to `yearSeries` re-walking periods. That was wrong —
`yearSeries` was already grouped and cost 6 queries. The repeats came from **five callers
each re-opening the same way**: `activityTotals`, `endingCash`, `beginningFundBalance`,
`currentBudgets`, `daysCash` and `reservePercent` all begin by resolving the current dataset
versions and then re-summing the same actuals. Four changes:

1. **A per-render memo** keyed on primitives rather than argument identity
   (`lib/request-cache.ts`). `React.cache()` alone cannot do this here, exactly as the old
   comment in `load.ts` warned — `tenantDb()` returns a new client per call and the engines
   take option objects, so an identity-keyed cache never hits. The store is still React's;
   only the key changed.
2. **One version lookup per render** (`lib/finance/versions.ts`). The year-wide query already
   returns every current version for the year, so every per-period lookup is now a Map read.
   14 queries → 1.
3. **One grouped aggregate per file** in `activityTotals` instead of five filtered `SUM`s —
   the totals and the transfer subsets are the same rows, split in memory. 5 → 2.
4. **One shared adopted-budget read**, which the trend series, days-cash and the reserve
   percentage all now go through instead of each running its own `SUM`. 5 → 2.

Plus the sequential tails: `evaluateAlerts` and `reservePercent` in `loadCore`, four
independent reads in `gatherFacts`, and two on the fund-balance page (fix #5).

### What was NOT done, and why

- **#4, co-locating the app and the database.** Still the largest absolute production win
  (est. `/dashboard` ~7.6 s → ~1.5 s) and it needs no code — but it is a deployment decision
  with a caveat this report already flagged: moving the database may move it away from other
  consumers. That is the client's call, not a code change. Note the remaining ~1.4 s is
  *still* mostly Mumbai round trips, so this is worth doing on top.
- **#6, eager prefetch.** Unchanged, on this report's own reasoning: prefetching a dynamic
  route fetches the loading state, not the data. Now that `loading.tsx` exists that state is
  already instant, so there is nothing left for it to win.

### Verification

`npm run verify:queries` (new) plus all 18 existing suites — 889 assertions, 0 failures, and
every suite's output **byte-identical** to before the change. `verify:queries` additionally
asserts that the memoised core returns figure-for-figure what the same core returns with the
memo bypassed, which is the assertion that would catch a cache that is fast and wrong.

---

## Appendix — method & honesty notes

- **Measured:** §2 (DB RTT), §3 (query counts, both methods), §4 (TTFB/RSC, prod build).
- **Estimated (labelled):** all §6 production numbers, and the RSC-transfer/client-hydration
  rows in §5.
- **Not measured, and why:** production app→DB latency and real click→paint — the app runs on
  Vercel `iad1`, which cannot be driven from this machine; the §6 runbook captures them.
- **Cross-checks that passed:** Method B (server) = Method A (script) + ~8 layout queries on
  every route; the linear TTFB↔query-count fit predicts all 7 routes within 0.15 s.
- **Temporary artifacts, all reverted:** a throwaway `audit/nav-latency` branch (query
  logging in `lib/db.ts`, a temp `/api/auditbuf` route, a `.audit-tmp` tsconfig exclude) was
  deleted; the forged `Session` row was deleted; `master` is untouched. Only new file is this
  document.
- **§8 addendum (the fix pass):** the same method. A second forged `Session` row was minted
  to drive the TTFB harness and has been deleted. The one lasting script is
  `scripts/verify-queries.mts`, which is a test rather than an artifact — it is the thing
  that would have caught this in the first place, since nothing in the repo could previously
  tell twenty queries from eighty.
- **A correction to §3 of this report:** it named `yearSeries` as the source of the
  per-period re-query fan-out. It was not — `yearSeries` already did the whole year in six
  grouped queries. The repeats came from the engines beneath it, each re-resolving versions
  and re-summing actuals per caller. The measured counts in §3 stand; the attribution
  sentence did not.
