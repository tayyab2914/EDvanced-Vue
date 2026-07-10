// OPTIONAL sample data: a "Demo ISD" district with one user per role (all ACTIVE),
// standard reference data, and a couple of schools. Idempotent.
// Run: npm run seed:demo   |   Remove: npm run db:reset && npm run db:seed
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { hashPassword } from "../lib/auth/password";
import { seedDistrictReferenceData } from "../lib/reference-data/florida-red-book";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  }),
});
const PW = "Demo!2026Pass";

async function main() {
  let d = await prisma.district.findUnique({
    where: { code: "demo" },
    select: { id: true },
  });
  if (!d) {
    d = await prisma.$transaction(async (tx) => {
      const created = await tx.district.create({
        data: { name: "Demo ISD", code: "demo", status: "ACTIVE" },
        select: { id: true },
      });
      await seedDistrictReferenceData(tx, created.id);
      return created;
    });
    console.log("✔ Created Demo ISD + standard reference data");
  } else {
    console.log("• Demo ISD already exists");
  }
  const districtId = d.id;

  const passwordHash = await hashPassword(PW);
  const users = [
    { email: "demo.admin@k12finance.local", name: "Dana Admin", role: "DISTRICT_ADMIN" as const },
    { email: "demo.finance@k12finance.local", name: "Finn Finance", role: "FINANCE_USER" as const },
    { email: "demo.viewer@k12finance.local", name: "Vera Viewer", role: "VIEWER" as const },
  ];
  for (const u of users) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (!existing) {
      await prisma.user.create({
        data: { ...u, status: "ACTIVE", passwordHash, districtId },
      });
    }
  }

  if ((await prisma.school.count({ where: { districtId } })) === 0) {
    await prisma.school.createMany({
      data: [
        { districtId, schoolNumber: "0011", name: "Demo High School" },
        { districtId, schoolNumber: "0021", name: "Demo Elementary" },
      ],
    });
  }

  console.log(`\nDemo logins (password: ${PW}):`);
  for (const u of users) console.log(`  ${u.role.padEnd(14)} ${u.email}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
