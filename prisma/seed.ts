import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { hashPassword } from "../lib/auth/password";
import { seedGlobalTypes } from "../lib/reference-data/global-types";

/**
 * Bootstraps the initial Platform Admin (districtId = null, cross-district) and the
 * platform-managed global lookup lists. Idempotent: re-running does NOT reset an
 * existing admin's password, and existing lookup rows are left untouched.
 * Districts are created later via the app's admin console and start empty.
 */
async function main() {
  const email = process.env.PLATFORM_ADMIN_EMAIL;
  const password = process.env.PLATFORM_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Set PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD in .env before seeding.",
    );
  }

  const db = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
    }),
  });

  try {
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      console.log(`✔ Platform Admin already exists: ${existing.email} (unchanged)`);
    } else {
      const passwordHash = await hashPassword(password);
      const admin = await db.user.create({
        data: {
          email,
          name: "Platform Administrator",
          role: "PLATFORM_ADMIN",
          status: "ACTIVE",
          passwordHash,
          districtId: null,
        },
      });
      console.log(`✔ Platform Admin created: ${admin.email}`);
    }

    await seedGlobalTypes(db);
    console.log("✔ Global lookup lists seeded (fund/revenue/object/function types, statuses)");
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
