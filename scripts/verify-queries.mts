import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { makeTenantExtension } from "@/lib/tenant-scope";
import type { TenantDb } from "@/lib/tenant-db";
import { registerDbKey, runInRequestScope } from "@/lib/request-cache";
import { resolveScope } from "@/lib/dashboard/scope";
import { loadCore } from "@/lib/dashboard/load";

/**
 * How many database round trips one dashboard navigation costs — asserted, not admired.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS SUITE EXISTS
 *
 * `loadCore` had a header comment claiming it kept the dashboards "under twenty" queries.
 * Measured, it issued 76, and 54 of those were a query it had already run in the same
 * call. The comment was not lying so much as untested: nothing in the repo could tell the
 * difference between twenty queries and eighty, so the count grew for months without
 * anybody's test going red.
 *
 * Against a pooler in Mumbai from an app in us-east-1 each of those round trips is
 * ~70–200ms, so the query count IS the page load time — very nearly linearly. This is the
 * test that stops the number drifting back up.
 *
 * TWO assertions, and the second is the one that makes the first safe:
 *
 *   1. COUNT. One `loadCore` issues fewer than `MAX_QUERIES` queries, with few enough
 *      repeats to show the per-render memo is actually hitting.
 *   2. AGREEMENT. The memoised core returns figure-for-figure what the same core returns
 *      with the memo bypassed. A cache that is fast and wrong is worse than the round
 *      trips it saved, and this is the only assertion that can tell the two apart.
 *
 * Run: npm run verify:queries
 * ---------------------------------------------------------------------------
 */

/**
 * Measured 27 on the Demo ISD fixture. The ceiling leaves room for a page that legitimately
 * needs another figure without leaving room for a caller to start re-resolving versions
 * again — the regression this exists to catch cost fifty.
 */
const MAX_QUERIES = 35;
/**
 * Repeats of one normalised SQL shape. Not zero: three of the remaining repeats are the
 * SAME shape with genuinely different parameters (period 12 and 11, all-funds and General
 * Fund), which the normalisation cannot tell apart because it strips the placeholders.
 */
const MAX_REPEATS = 4;

const base = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL }),
  log: [{ emit: "event", level: "query" }],
});

const seen: { sql: string; ms: number }[] = [];
let capture = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(base as any).$on("query", (e: { query: string; duration: number }) => {
  if (capture) seen.push({ sql: e.query, ms: e.duration });
});

let passed = 0;
let failed = 0;
function assert(ok: boolean, what: string) {
  if (ok) {
    passed++;
    console.log(`  ok   ${what}`);
  } else {
    failed++;
    console.log(`  FAIL ${what}`);
  }
}

/** Placeholders stripped, so re-running the same query with new arguments still groups. */
function normalise(sql: string): string {
  return sql.replace(/\$\d+/g, "?").replace(/\s+/g, " ").trim();
}

/**
 * Everything a figure is made of, flattened to a comparable string.
 *
 * Decimals are objects with a `toFixed`, and JSON.stringify would render them `{}` — every
 * figure would compare equal and the agreement assertion would pass on anything.
 */
function shape(v: unknown): unknown {
  if (v instanceof Map) return ["Map", [...v.entries()].map(([k, x]) => [k, shape(x)])];
  if (Array.isArray(v)) return v.map(shape);
  if (v instanceof Date) return v.toISOString();
  if (v && typeof v === "object") {
    if (typeof (v as { toFixed?: unknown }).toFixed === "function") return String(v);
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => [k, shape(x)]),
    );
  }
  return v;
}

async function main() {
  const district = await base.district.findFirst({
    where: { name: { contains: "Demo", mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (!district) {
    console.log("No Demo district — run `npm run seed:demo` first. Skipping.");
    return;
  }

  const db = base.$extends(makeTenantExtension(district.id)) as unknown as TenantDb;
  // What lib/tenant-db.ts and lib/db.ts do for the real clients. This script builds its
  // own, so it names them itself — otherwise every read opts out of the memo and the
  // count measured here would not be the count the app pays.
  registerDbKey(base, "base");
  registerDbKey(db, district.id);

  const latest = await base.datasetVersion.findFirst({
    where: { districtId: district.id, isCurrent: true },
    orderBy: [{ fiscalYear: "desc" }, { period: "desc" }],
    select: { fiscalYear: true, period: true },
  });
  const scope = await resolveScope(db, district.id, {
    fy: latest?.fiscalYear,
    period: latest?.period === null ? undefined : String(latest?.period),
  });
  if (scope.empty) {
    console.log(`${district.name} has no committed data — nothing to count. Skipping.`);
    return;
  }

  console.log(`\nloadCore — ${district.name}, FY ${scope.fiscalYear}, period ${scope.period}\n`);

  // Warm the pool so the connect handshake is not counted as a query.
  await base.$queryRaw`SELECT 1`;

  // ONE request scope = one render, the boundary React gives the app at runtime.
  capture = true;
  const memoised = await runInRequestScope(() => loadCore(db, district.id, scope));
  capture = false;

  const groups = new Map<string, number>();
  for (const q of seen) {
    const k = normalise(q.sql);
    groups.set(k, (groups.get(k) ?? 0) + 1);
  }
  const worst = [...groups.entries()].sort((a, b) => b[1] - a[1])[0];

  console.log(`  ${seen.length} queries · ${groups.size} distinct shapes · ${Math.round(
    seen.reduce((a, q) => a + q.ms, 0),
  )}ms of database time\n`);

  assert(seen.length <= MAX_QUERIES, `loadCore issues ${seen.length} queries (ceiling ${MAX_QUERIES})`);
  assert(
    (worst?.[1] ?? 0) <= MAX_REPEATS,
    `no SQL shape repeats more than ${MAX_REPEATS}× (worst is ${worst?.[1] ?? 0}×)`,
  );

  // The memo must not change a figure. Same core, memo bypassed — every read goes to the
  // database — and every value compared.
  const direct = await loadCore(db, district.id, scope);
  assert(
    JSON.stringify(shape(memoised)) === JSON.stringify(shape(direct)),
    "the memoised core equals the uncached core, figure for figure",
  );

  if (failed && worst) {
    console.log(`\n  most repeated shape (${worst[1]}×):\n    ${worst[0].slice(0, 200)}`);
  }
}

main()
  .then(async () => {
    await base.$disconnect();
    console.log(`\n${passed} passed, ${failed} failed\n`);
    if (failed) process.exit(1);
  })
  .catch(async (e) => {
    console.error(e);
    await base.$disconnect();
    process.exit(1);
  });
