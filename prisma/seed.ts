import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { hashPassword } from "../lib/auth/password";

/**
 * Bootstraps the initial Platform Admin (districtId = null, cross-district).
 * Idempotent: re-running does NOT reset an existing admin's password.
 * Districts + their reference data are created later via the app's admin console.
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
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      console.log(`✔ Platform Admin already exists: ${existing.email} (unchanged)`);
      return;
    }

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
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
