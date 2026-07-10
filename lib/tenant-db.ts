import "server-only";
import { prisma } from "@/lib/db";
import { makeTenantExtension } from "@/lib/tenant-scope";

/**
 * Multi-tenancy choke point. `tenantDb(districtId)` returns a Prisma client that
 * automatically scopes EVERY query on tenant-owned models to a single district
 * (see lib/tenant-scope.ts for the enforcement rules).
 *
 * District-app code must NEVER import the base `prisma` for tenant data — it must
 * go through `getTenantDb()` / `resolveTenantDb()` (see lib/auth/dal.ts).
 *
 * The query extension only filters/injects — it does not change model shapes — so
 * the returned client is typed as the base client for ergonomic delegate access.
 */
export function tenantDb(districtId: string): typeof prisma {
  return prisma.$extends(
    makeTenantExtension(districtId),
  ) as unknown as typeof prisma;
}

export type TenantDb = typeof prisma;
