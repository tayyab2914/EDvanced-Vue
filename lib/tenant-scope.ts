// Pure, dependency-free tenant-scoping logic (no server-only / no db import) so it
// can be unit-tested and shared. lib/tenant-db.ts wires this onto the real client.

const TENANT_MODELS = new Set([
  "School",
  "Grant",
  "CapitalProject",
  "FundType",
  "Fund",
  "RevenueSource",
  "AccountFunction",
  "AccountObject",
  "Status",
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

