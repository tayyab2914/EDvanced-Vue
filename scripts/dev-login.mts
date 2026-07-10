// DEV ONLY: mints a valid session cookie for an existing user and prints the JWT.
// Usage: npx tsx scripts/dev-login.mts [email]   → prints the session token.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { SignJWT } from "jose";

const email = process.argv[2] ?? process.env.PLATFORM_ADMIN_EMAIL;
if (!email) {
  console.error("Provide an email or set PLATFORM_ADMIN_EMAIL.");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const user = await prisma.user.findUnique({
  where: { email },
  select: { id: true, role: true, districtId: true, status: true },
});
if (!user) {
  console.error(`No user found for ${email}`);
  process.exit(1);
}

const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const session = await prisma.session.create({
  data: { userId: user.id, expiresAt },
  select: { id: true },
});

const key = new TextEncoder().encode(process.env.SESSION_SECRET);
const token = await new SignJWT({
  sessionId: session.id,
  userId: user.id,
  role: user.role,
  districtId: user.districtId,
  expiresAt: expiresAt.toISOString(),
})
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("7d")
  .sign(key);

console.log(token);
await prisma.$disconnect();
