import { redirect } from "next/navigation";
import { requirePermission, getTenantDb } from "@/lib/auth/dal";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/auth/permissions";
import { RESOURCES, MASTER_KINDS, toClientDef } from "@/lib/master-data/registry";
import { PageHeader } from "@/components/page-header";
import {
  MasterDataWorkspace,
  type KindData,
} from "@/components/master-data/master-data-workspace";
import type {
  MasterRow,
  Option,
} from "@/components/master-data/master-item-form";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDelegate = any;

const GLOBAL_TYPE_MODELS = [
  "fundType",
  "revenueType",
  "objectType",
  "functionType",
] as const;

export default async function MasterDataPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const me = await requirePermission("view_master_data");
  if (!me.districtId) redirect("/platform");
  const { tab } = await searchParams;
  const { db } = await getTenantDb();

  // Load the shared platform type lists once, then every dimension's rows — all in
  // parallel, in this single render. Switching tabs afterwards is pure client state.
  const [globalLists, ...rowSets] = await Promise.all([
    Promise.all(
      GLOBAL_TYPE_MODELS.map((m) =>
        (prisma as unknown as Record<string, AnyDelegate>)[m].findMany({
          where: { active: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: { id: true, name: true },
        }),
      ),
    ),
    ...MASTER_KINDS.map((kind) => {
      const def = RESOURCES[kind];
      const select: Record<string, true> = { id: true, active: true };
      for (const f of def.fields) select[f.name] = true;
      return (db as unknown as Record<string, AnyDelegate>)[def.model].findMany({
        orderBy: { [def.fields[0].name]: "asc" },
        select,
      }) as Promise<Record<string, unknown>[]>;
    }),
  ]);

  const globalByModel = Object.fromEntries(
    GLOBAL_TYPE_MODELS.map((m, i) => [m, globalLists[i]]),
  ) as Record<string, { id: string; name: string }[]>;

  // Shared option lists + display-label maps, keyed by optionsKey / field name.
  const options: Record<string, Option[]> = {};
  const relLabels: Record<string, Map<string, string>> = {};
  for (const kind of MASTER_KINDS) {
    for (const f of RESOURCES[kind].fields) {
      if (f.type !== "select" || !f.globalType || !f.optionsKey) continue;
      if (options[f.optionsKey]) continue;
      const items = globalByModel[f.globalType];
      options[f.optionsKey] = items.map((x) => ({ value: x.id, label: x.name }));
      relLabels[f.name] = new Map(items.map((x) => [x.id, x.name]));
    }
  }

  const kinds: KindData[] = MASTER_KINDS.map((kind, i) => {
    const def = RESOURCES[kind];
    const numericFields = def.fields.filter((f) => f.numeric).map((f) => f.name);
    const rows: MasterRow[] = rowSets[i].map((r) => {
      if (!numericFields.length) return r as MasterRow;
      const o = { ...r };
      for (const name of numericFields)
        if (o[name] != null) o[name] = String(Number(o[name]));
      return o as MasterRow;
    });
    return { def: toClientDef(def), rows };
  });

  const canManage = hasPermission(me.role, "manage_master_data");

  return (
    <div>
      <PageHeader
        title="Master data"
        description="Your district's account dimensions. Switch between them with the tabs below."
      />
      <MasterDataWorkspace
        kinds={kinds}
        options={options}
        relLabels={relLabels}
        districtId={me.districtId}
        canManage={canManage}
        initialTab={tab}
      />
    </div>
  );
}
