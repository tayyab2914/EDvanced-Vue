// Pure, dependency-free tenant-scoping logic (no server-only / no db import) so it
// can be unit-tested and shared. lib/tenant-db.ts wires this onto the real client.

// Platform-managed global lookups (FundType, RevenueType, ObjectType, FunctionType,
// Status) are intentionally NOT here — they are shared across districts and must not
// be district-scoped. Only district-owned data is tenant-scoped.
//
// ⚠️ This set is an ALLOWLIST, and it fails OPEN: a tenant-owned model missing from it
// is silently not scoped at all — no error, no warning, every district's rows visible
// to every other. Adding a district-owned model to schema.prisma means adding it here,
// in the same commit. `npm run verify:m1` and `verify:import` both check this.
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
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeTenantExtension(districtId: string): any {
  return {
    name: "tenant-scope",
    query: {
      $allModels: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async $allOperations({ model, operation, args, query }: any) {
          if (!model || !TENANT_MODELS.has(model)) return query(args);
          const a = (args ?? {}) as Record<string, unknown>;

          switch (operation) {
            case "findMany":
            case "findFirst":
            case "findFirstOrThrow":
            case "count":
            case "aggregate":
            case "groupBy":
            case "updateMany":
            case "updateManyAndReturn":
            case "deleteMany":
              a.where = { ...(a.where as object), districtId };
              return query(a);

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
    },
  };
}

