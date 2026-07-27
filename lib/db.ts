import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { env } from "@/lib/env";
import { registerDbKey } from "@/lib/request-cache";

const createPrismaClient = () =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

/**
 * Base Prisma client (singleton; global-cached to survive dev HMR).
 *
 * ⚠️ Use ONLY for auth, platform-admin, and cross-tenant code. District-owned
 * data must always go through `tenantDb(districtId)` / `getTenantDb()` so every
 * query is automatically scoped to a single district. See lib/tenant-db.ts.
 */
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// The platform-wide lookups (activity codes) read through this client, and they memoise
// per render like everything else. See lib/request-cache.ts.
registerDbKey(prisma, "base");

if (env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
