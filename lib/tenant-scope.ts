// Pure, dependency-free tenant-scoping logic (no server-only / no db import) so it
// can be unit-tested and shared. lib/tenant-db.ts wires this onto the real client.

// Platform-managed global lookups (FundType, RevenueType, ObjectType, FunctionType,
// Status, CostCenterType, FinancialActivityCode) are intentionally NOT here — they are
// shared across districts and must not be district-scoped. Only district-owned data is
// tenant-scoped.
//
// ⚠️ This set is an ALLOWLIST, and it fails OPEN: a tenant-owned model missing from it
// is silently not scoped at all — no error, no warning, every district's rows visible
// to every other. Adding a district-owned model to schema.prisma means adding it here,
// in the same commit.
//
// That is not a hypothetical. DistrictPolicy, ForecastAssumption and FundBalanceProjection
// were added in Milestone 2 and never added here, and ForecastAssumption was live-leaking:
// lib/forecast/engine.ts asks for `{ fiscalYear, kind }` with no district filter, and the
// rows come back keyed by RevenueType / ObjectType — which are GLOBAL ids. One district's
// growth assumption could therefore land in another district's forecast. Reproduced
// against the live database before this was fixed.
//
// `npm run verify:tenancy` now enforces the invariant by reading schema.prisma: every
// model with a `districtId` field must appear below. The previous comment claimed
// verify:m1 and verify:import checked this. They did not — they only imported this
// module, which is how three models slipped through.
const TENANT_MODELS = new Set([
  // M1 — master data
  "School",
  "Grant",
  "CapitalProject",
  "Project",
  "Fund",
  "RevenueSource",
  "AccountFunction",
  "AccountObject",
  // M2 — import lifecycle
  "ImportBatch",
  "ImportStagingRow",
  "ValidationFinding",
  "DatasetVersion",
  // M2 — periodic snapshot data
  "BudgetLine",
  "RevenueActual",
  "ExpenditureActual",
  "CashPosition",
  "OpeningFundBalance",
  "FundBalanceOverride",
  // M2 — configuration a district owns
  "DistrictPolicy",
  "ForecastAssumption",
  "FundBalanceProjection",
]);

/** Exposed for the verification script, which compares it against schema.prisma. */
export const TENANT_MODEL_NAMES: ReadonlySet<string> = TENANT_MODELS;

/**
 * Raw SQL is unscopable, so it is refused on a tenant client.
 *
 * A Prisma extension can only rewrite the ARGUMENTS of a query, and the argument to
 * `$queryRaw` is a finished SQL string. There is no `where` to inject a districtId into,
 * so a raw query on a tenant-scoped client returns every district's rows — verified
 * against the live database, where a scoped client counted another district's row.
 *
 * The temptation is real and specific: the twelve-period pivot behind every trend chart
 * on the Milestone 3 dashboards looks much easier in SQL than in Prisma. It is, and it
 * would silently make the platform single-tenant.
 *
 * Raw SQL is still available on the BASE client (`prisma` from lib/db.ts), where the
 * caller is visibly responsible for its own filtering. Refusing it here means that choice
 * has to be made deliberately rather than by reaching for the nearest client.
 */
const RAW_OPERATIONS = new Set([
  "$queryRaw",
  "$queryRawUnsafe",
  "$executeRaw",
  "$executeRawUnsafe",
  "$runCommandRaw",
]);

/** Operations that carry a `where` we can narrow to the district. */
const WHERE_OPERATIONS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "updateManyAndReturn",
  "deleteMany",
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeTenantExtension(districtId: string): any {
  return {
    name: "tenant-scope",
    query: {
      // Top level, NOT nested under $allModels. A hook under $allModels never sees a raw
      // query — raw operations carry no model — which is exactly how the bypass survived.
      // At this level `model` is undefined for raw operations and set for model ones, so
      // one hook covers both.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async $allOperations({ model, operation, args, query }: any) {
        if (!model) {
          if (RAW_OPERATIONS.has(operation)) {
            throw new Error(
              `tenantDb: "${operation}" cannot be district-scoped — a Prisma extension can ` +
                `only rewrite query arguments, and raw SQL has no "where" to narrow. It would ` +
                `return every district's rows. Use the model API, or the base client from ` +
                `lib/db.ts with an explicit districtId filter you can be held to.`,
            );
          }
          return query(args);
        }

        if (!TENANT_MODELS.has(model)) return query(args);

        const a = (args ?? {}) as Record<string, unknown>;

        if (WHERE_OPERATIONS.has(operation)) {
          a.where = { ...(a.where as object), districtId };
          return query(a);
        }

        switch (operation) {
          case "create":
            a.data = { ...(a.data as object), districtId };
            return query(a);

          case "createMany":
          case "createManyAndReturn":
            a.data = Array.isArray(a.data)
              ? a.data.map((d: object) => ({ ...d, districtId }))
              : { ...(a.data as object), districtId };
            return query(a);

          default:
            throw new Error(
              `tenantDb: operation "${operation}" is not allowed on tenant model "${model}". ` +
                `Use findFirst/findMany, create/createMany, updateMany, or deleteMany so district scoping stays enforced.`,
            );
        }
      },
    },
  };
}
