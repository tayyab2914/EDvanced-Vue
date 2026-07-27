import "server-only";
import { prisma } from "@/lib/db";
import { makeTenantExtension } from "@/lib/tenant-scope";
import { registerDbKey } from "@/lib/request-cache";

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
  const db = prisma.$extends(
    makeTenantExtension(districtId),
  ) as unknown as typeof prisma;
  // Names the district this client is scoped to, so the read paths can memoise per render
  // without keying on the client's identity — which changes on every call. See
  // lib/request-cache.ts.
  registerDbKey(db, districtId);
  return db;
}

export type TenantDb = typeof prisma;
