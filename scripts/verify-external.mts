import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { makeTenantExtension } from "@/lib/tenant-scope";
import { isGrantLive, liveGrantWhere } from "@/lib/external-access";

/**
 * End-to-end checks for the External User role, run against the real database.
 *
 * These exercise the exact query the DAL uses to decide which district an external user may
 * enter (`liveGrantWhere`), so they prove the security invariants rather than restating them:
 * a grant only opens a district while it is ACTIVE, in date, and the district is ACTIVE.
 */
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

const A_CODE = "__ext_alpha__";
const B_CODE = "__ext_beta__";
const EMAIL = "__ext_auditor__@example.test";

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await prisma.district.deleteMany({ where: { code: { in: [A_CODE, B_CODE] } } });
}

/** The districts this user may currently enter — the DAL's exact question. */
async function liveDistrictIds(userId: string): Promise<string[]> {
  const grants = await prisma.externalAccess.findMany({
    where: { userId, ...liveGrantWhere() },
    select: { districtId: true },
  });
  return grants.map((g) => g.districtId).sort();
}

async function main() {
  await cleanup();

  const a = await prisma.district.create({
    data: { code: A_CODE, name: "Alpha ISD", status: "ACTIVE" },
    select: { id: true },
  });
  const b = await prisma.district.create({
    data: { code: B_CODE, name: "Beta ISD", status: "ACTIVE" },
    select: { id: true },
  });
  // Some data in each district, so "can they read it" is a real question. `districtId` is
  // omitted deliberately — the scoped client injects it (see verify-m1.mts step [2]).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (t(a.id).school as any).create({
    data: { schoolNumber: "A1", name: "Alpha High" },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (t(b.id).school as any).create({
    data: { schoolNumber: "B1", name: "Beta High" },
  });

  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      name: "Ext Auditor",
      role: "EXTERNAL_USER",
      status: "ACTIVE",
      districtId: null, // the whole point: they belong to no district
    },
    select: { id: true },
  });

  console.log("\n[1] A platform admin assigns districts → nothing is granted yet");
  await prisma.externalAccess.createMany({
    data: [
      { userId: user.id, districtId: a.id, status: "PENDING" },
      { userId: user.id, districtId: b.id, status: "PENDING" },
    ],
  });
  assert(
    (await liveDistrictIds(user.id)).length === 0,
    "A PENDING assignment opens NO district (approval is required)",
  );

  console.log("\n[2] District A approves (VIEW_ONLY, 30 days)");
  const in30 = new Date(Date.now() + 30 * 86_400_000);
  await prisma.externalAccess.update({
    where: { userId_districtId: { userId: user.id, districtId: a.id } },
    data: { status: "ACTIVE", level: "VIEW_ONLY", expiresAt: in30 },
  });
  assert(
    JSON.stringify(await liveDistrictIds(user.id)) === JSON.stringify([a.id].sort()),
    "Only the approving district (A) becomes reachable — B is still pending",
  );

  console.log("\n[3] Tenant isolation still holds for the district they DID get");
  const aSchools = await t(a.id).school.count();
  const bSchools = await t(b.id).school.count();
  assert(aSchools === 1, "District A's data is readable through its scoped client");
  assert(
    bSchools === 1 && !(await liveDistrictIds(user.id)).includes(b.id),
    "District B holds data, but the user has no live grant on it",
  );

  console.log("\n[4] Expiry lapses with no cron");
  await prisma.externalAccess.update({
    where: { userId_districtId: { userId: user.id, districtId: a.id } },
    data: { expiresAt: new Date(Date.now() - 1000) }, // one second ago
  });
  const lapsed = await prisma.externalAccess.findUnique({
    where: { userId_districtId: { userId: user.id, districtId: a.id } },
    select: { status: true, expiresAt: true },
  });
  assert(lapsed!.status === "ACTIVE", "The row is still stored as ACTIVE (nothing swept it)");
  assert(!isGrantLive(lapsed!), "...but it is NOT live, because expiry is derived");
  assert(
    (await liveDistrictIds(user.id)).length === 0,
    "An expired grant opens no district",
  );

  console.log("\n[5] A district admin extends it → access comes back");
  await prisma.externalAccess.update({
    where: { userId_districtId: { userId: user.id, districtId: a.id } },
    data: { expiresAt: in30 },
  });
  assert(
    (await liveDistrictIds(user.id)).includes(a.id),
    "Extending an expired grant restores access",
  );

  console.log("\n[6] Deactivating the district drops the external user out");
  await prisma.district.update({ where: { id: a.id }, data: { status: "INACTIVE" } });
  assert(
    (await liveDistrictIds(user.id)).length === 0,
    "An INACTIVE district is unreachable even with a live grant",
  );
  await prisma.district.update({ where: { id: a.id }, data: { status: "ACTIVE" } });

  console.log("\n[7] Revocation is district-local");
  // Give them BOTH districts, then revoke only A.
  await prisma.externalAccess.update({
    where: { userId_districtId: { userId: user.id, districtId: b.id } },
    data: { status: "ACTIVE", level: "FULL_ACCESS", expiresAt: in30 },
  });
  assert(
    (await liveDistrictIds(user.id)).length === 2,
    "The user can hold live grants on two districts at once",
  );
  await prisma.externalAccess.update({
    where: { userId_districtId: { userId: user.id, districtId: a.id } },
    data: { status: "REVOKED" },
  });
  const after = await liveDistrictIds(user.id);
  assert(
    after.length === 1 && after[0] === b.id,
    "Revoking district A leaves district B's access untouched",
  );

  console.log("\n[8] Re-assigning a revoked district does not blow up on the unique index");
  let upserted = true;
  try {
    await prisma.externalAccess.upsert({
      where: { userId_districtId: { userId: user.id, districtId: a.id } },
      create: { userId: user.id, districtId: a.id, status: "PENDING" },
      update: { status: "PENDING", level: null, expiresAt: null },
    });
  } catch {
    upserted = false;
  }
  assert(upserted, "A revoked grant can be re-requested (upsert, not create)");
  assert(
    !(await liveDistrictIds(user.id)).includes(a.id),
    "...and the re-request is PENDING again, granting nothing until approved",
  );

  console.log("\n[9] Deleting the user cascades their grants away");
  await prisma.user.delete({ where: { id: user.id } });
  const orphans = await prisma.externalAccess.count({ where: { userId: user.id } });
  assert(orphans === 0, "Grants cascade with the user (no orphaned access rows)");

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
