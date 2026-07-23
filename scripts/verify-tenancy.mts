import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { makeTenantExtension, TENANT_MODEL_NAMES } from "@/lib/tenant-scope";

/**
 * The tenancy invariant, enforced against the schema itself.
 *
 * lib/tenant-scope.ts holds an ALLOWLIST that FAILS OPEN: a district-owned model missing
 * from it is silently not scoped, and every district's rows become visible to every other.
 * Its comment used to claim verify:m1 and verify:import checked this. They did not — they
 * only imported the module — and three models slipped through for a whole milestone.
 * ForecastAssumption was live-leaking as a result: lib/forecast/engine.ts asks for
 * `{ fiscalYear, kind }` with no district filter and keys the answers by GLOBAL
 * RevenueType / ObjectType ids, so one district's growth assumption could land in
 * another's forecast.
 *
 * So this script does what that comment promised. It reads prisma/schema.prisma, finds
 * every model carrying a `districtId` field, and asserts each one is in the allowlist.
 * A model added without being scoped now fails here rather than in production.
 *
 * It also proves the two runtime guarantees the allowlist rests on: that a scoped client
 * cannot see another district's rows, and that raw SQL is refused rather than silently
 * unscoped.
 *
 * Run: npm run verify:tenancy
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL }),
});

// Nothing else uses this fiscal year. Every other verify script has its own.
const SENTINEL = "2093-94";

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

/** Every model in schema.prisma, with the field names it declares. */
function modelsFromSchema(): Map<string, string[]> {
  const src = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
  const out = new Map<string, string[]>();

  // Deliberately a small hand parser rather than a dependency. The schema's model blocks
  // are `model Name {` ... `}` at column 0, which is all this needs to know.
  const re = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const [, name, body] = m;
    const fields = body
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("//") && !l.startsWith("@@") && !l.startsWith("///"))
      .map((l) => l.split(/\s+/)[0]);
    out.set(name, fields);
  }
  return out;
}

async function main() {
  console.log("\nTenancy invariants\n");

  // ===================== 1. the allowlist matches the schema =====================
  const models = modelsFromSchema();
  assert(models.size > 20, `schema parsed — ${models.size} models found`);

  const districtOwned = [...models.entries()]
    .filter(([, fields]) => fields.includes("districtId"))
    .map(([name]) => name);

  console.log(`\n  district-owned models in schema.prisma: ${districtOwned.length}`);

  /**
   * The deliberate exceptions.
   *
   * Each carries districtId and each is reached ONLY through the base client, never
   * through tenantDb() — which is what makes the exemption safe rather than a hole. Each
   * is also a case where district scoping would break a product feature outright:
   *
   *   AuditLog       a platform admin's cross-district audit view (Spec §5.12).
   *   User           platform admins manage users across every district, and an external
   *                  user has no home district at all (Spec §5.2).
   *   ExternalAccess a grant is the relationship BETWEEN a user and a district; an
   *                  external user's "My districts" page spans several (Spec §5.4).
   *
   * Adding to this list is a decision to hand-filter every query against that model. Do
   * not add one to silence this check.
   */
  const EXEMPT = new Set(["AuditLog", "User", "ExternalAccess"]);

  const missing = districtOwned.filter((m) => !EXEMPT.has(m) && !TENANT_MODEL_NAMES.has(m));
  assert(
    missing.length === 0,
    missing.length === 0
      ? "every district-owned model is in the tenant allowlist"
      : `models carrying districtId but NOT scoped: ${missing.join(", ")}`,
  );

  const stale = [...TENANT_MODEL_NAMES].filter((m) => !models.has(m));
  assert(
    stale.length === 0,
    stale.length === 0
      ? "the allowlist names no model that has been removed from the schema"
      : `allowlist names models that no longer exist: ${stale.join(", ")}`,
  );

  // ===================== 2. scoping actually holds =====================
  const districts = await prisma.district.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
    take: 2,
  });

  if (districts.length < 2) {
    console.log("\n  (skipped runtime checks — needs two districts)");
  } else {
    const [a, b] = districts;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbA = prisma.$extends(makeTenantExtension(a.id)) as any;

    await prisma.forecastAssumption.deleteMany({ where: { fiscalYear: SENTINEL } });
    try {
      const revenueType = await prisma.revenueType.findFirst();
      if (revenueType) {
        // A row belonging to district B, reachable only by a query that forgets to filter.
        await prisma.forecastAssumption.create({
          data: {
            districtId: b.id,
            fiscalYear: SENTINEL,
            kind: "REVENUE",
            revenueTypeId: revenueType.id,
            growthPercent: "99.999",
            monitored: true,
          },
        });

        const seen = await dbA.forecastAssumption.findMany({
          where: { fiscalYear: SENTINEL, kind: "REVENUE" },
        });
        assert(
          seen.length === 0,
          `a query with no district filter cannot see another district's forecast assumptions (saw ${seen.length})`,
        );
      }

      // The same guarantee on a periodic model, via the aggregate path the dashboards use.
      const leaked = await dbA.datasetVersion.findMany({ where: {} });
      assert(
        leaked.every((v: { districtId: string }) => v.districtId === a.id),
        "findMany with an empty where is still scoped to one district",
      );

      const grouped = await dbA.expenditureActual.groupBy({
        by: ["districtId"],
        _sum: { actualYtd: true },
      });
      assert(
        grouped.every((g: { districtId: string }) => g.districtId === a.id),
        "groupBy — the aggregation the dashboards are built on — is scoped",
      );

      // ===================== 3. raw SQL is refused, not silently unscoped =====================
      let refused = false;
      try {
        await dbA.$queryRaw`SELECT 1`;
      } catch (e) {
        refused = /cannot be district-scoped/.test((e as Error).message);
      }
      assert(refused, "$queryRaw is refused on a tenant client rather than bypassing scoping");

      let refusedUnsafe = false;
      try {
        await dbA.$queryRawUnsafe("SELECT 1");
      } catch (e) {
        refusedUnsafe = /cannot be district-scoped/.test((e as Error).message);
      }
      assert(refusedUnsafe, "$queryRawUnsafe is refused too");

      // The base client must still allow raw SQL — that is where it legitimately lives.
      const baseRaw = await prisma.$queryRaw<{ n: number }[]>`SELECT 1::int AS n`;
      assert(baseRaw[0]?.n === 1, "raw SQL still works on the base client, where filtering is explicit");

      // ===================== 4. unsafe operations still throw =====================
      let threw = false;
      try {
        await dbA.fund.updateMany;
        await dbA.fund.upsert({ where: { id: "x" }, create: {}, update: {} });
      } catch (e) {
        threw = /not allowed on tenant model/.test((e as Error).message);
      }
      assert(threw, "upsert is still refused on a tenant model");
    } finally {
      await prisma.forecastAssumption.deleteMany({ where: { fiscalYear: SENTINEL } });
    }
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.forecastAssumption.deleteMany({ where: { fiscalYear: SENTINEL } }).catch(() => {});
  await prisma.$disconnect();
  process.exit(1);
});
