import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { makeTenantExtension } from "@/lib/tenant-scope";
import { hasPermission } from "@/lib/auth/permissions";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  }),
});
const t = (districtId: string) =>
  prisma.$extends(makeTenantExtension(districtId)) as unknown as typeof prisma;

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

const A_CODE = "__test_alpha__";
const B_CODE = "__test_beta__";

async function cleanup() {
  await prisma.district.deleteMany({ where: { code: { in: [A_CODE, B_CODE] } } });
}

async function main() {
  await cleanup();

  console.log("\n[1] Onboarding — districts start empty (no seeded standards)");
  const a = await prisma.district.create({
    data: { name: "Alpha ISD", code: A_CODE, status: "ACTIVE" },
    select: { id: true },
  });
  const b = await prisma.district.create({
    data: { name: "Beta ISD", code: B_CODE, status: "ACTIVE" },
    select: { id: true },
  });

  const aFunds = await t(a.id).fund.count();
  const bFunds = await t(b.id).fund.count();
  assert(aFunds === 0, `District A starts with no funds (got ${aFunds})`);
  assert(bFunds === 0, `District B starts with no funds (got ${bFunds})`);

  console.log("\n[2] Tenant scoping injects districtId on create");
  // Cast create() to bypass the base type's districtId requirement — the scoped
  // client injects it at runtime, which is exactly what we're asserting.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const school = await (t(a.id).school as any).create({
    data: { schoolNumber: "0011", name: "Alpha High School" },
  });
  assert(school.districtId === a.id, "Created school is stamped with District A's id");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (t(a.id).fund as any).create({
    data: { code: "C001", name: "Alpha Custom Fund" },
  });

  console.log("\n[3] Cross-district isolation (the core guarantee)");
  const aSchools = await t(a.id).school.findMany();
  const bSchools = await t(b.id).school.findMany();
  assert(aSchools.length === 1, `District A sees its 1 school (got ${aSchools.length})`);
  assert(bSchools.length === 0, `District B sees NONE of A's schools (got ${bSchools.length})`);

  const aFundsNow = await t(a.id).fund.count();
  const bFundsNow = await t(b.id).fund.count();
  assert(aFundsNow === 1, `District A now has its 1 custom fund (got ${aFundsNow})`);
  assert(bFundsNow === 0, `District B unaffected by A's custom fund (got ${bFundsNow})`);
  const bSeesCustom = await t(b.id).fund.findFirst({ where: { code: "C001" } });
  assert(bSeesCustom === null, "District B cannot read A's custom fund by code");

  console.log("\n[4] Unsafe unique-addressed ops are blocked on tenant models");
  let threw = false;
  try {
    // findUnique is intentionally rejected by the scoped client
    await t(b.id).school.findUnique({ where: { id: school.id } });
  } catch {
    threw = true;
  }
  assert(threw, "tenantDb rejects findUnique (prevents cross-district leaks)");

  console.log("\n[5] RBAC permission matrix");
  assert(hasPermission("PLATFORM_ADMIN", "manage_districts"), "Platform Admin can manage districts");
  assert(!hasPermission("DISTRICT_ADMIN", "manage_districts"), "District Admin cannot manage districts");
  assert(hasPermission("DISTRICT_ADMIN", "manage_users_own"), "District Admin can manage own users");
  assert(!hasPermission("FINANCE_USER", "manage_master_data"), "Finance User is read-only on master data (M1 default)");
  assert(hasPermission("FINANCE_USER", "view_master_data"), "Finance User can view master data");
  assert(!hasPermission("VIEWER", "manage_users_own"), "Viewer cannot manage users");
  assert(hasPermission("VIEWER", "view_dashboards"), "Viewer can view dashboards");

  console.log("\n[6] Password hashing (argon2id)");
  const hash = await hashPassword("Sup3r!Secret");
  assert(await verifyPassword(hash, "Sup3r!Secret"), "Correct password verifies");
  assert(!(await verifyPassword(hash, "wrong")), "Wrong password rejected");

  await cleanup();

  console.log(`\n──────── ${passed} passed, ${failed} failed ────────\n`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await cleanup().catch(() => {});
  await prisma.$disconnect();
  process.exit(1);
});
