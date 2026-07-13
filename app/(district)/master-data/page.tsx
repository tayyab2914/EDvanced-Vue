import { redirect } from "next/navigation";
import { requirePermission, getTenantDb, userCan } from "@/lib/auth/dal";
import { prisma } from "@/lib/db";
import { homePathForUser } from "@/lib/auth/routes";
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
  "costCenterType",
] as const;

// Lookup models whose rows carry a parent column (Cost Center Type → category), so a
// dependent select can filter its options. Derived from the registry, not hardcoded.
const PARENT_COLUMN: Record<string, string> = {};
for (const kind of MASTER_KINDS) {
  for (const f of RESOURCES[kind].fields) {
    if (f.globalType && f.parentColumn) PARENT_COLUMN[f.globalType] = f.parentColumn;
  }
}

export default async function MasterDataPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const me = await requirePermission("view_master_data");
  if (!me.districtId) redirect(homePathForUser(me));
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
          select: {
            id: true,
            name: true,
            ...(PARENT_COLUMN[m] ? { [PARENT_COLUMN[m]]: true } : {}),
          },
        }),
      ),
    ),
    ...MASTER_KINDS.map((kind) => {
      const def = RESOURCES[kind];
      const select: Record<string, true> = { id: true, active: true };
      for (const f of def.fields) select[f.name] = true;
      return (db as unknown as Record<string, AnyDelegate>)[def.model].findMany({
        orderBy: { [def.defaultSort]: "asc" },
        select,
      }) as Promise<Record<string, unknown>[]>;
    }),
  ]);

  const globalByModel = Object.fromEntries(
    GLOBAL_TYPE_MODELS.map((m, i) => [m, globalLists[i]]),
  ) as Record<string, Record<string, string>[]>;

  // Shared option lists + display-label maps, keyed by optionsKey / field name.
  const options: Record<string, Option[]> = {};
  const relLabels: Record<string, Map<string, string>> = {};
  // For dependent selects: parent value → options (e.g. category → cost center types).
  const optionsByParent: Record<string, Record<string, Option[]>> = {};

  for (const kind of MASTER_KINDS) {
    for (const f of RESOURCES[kind].fields) {
      if (f.type !== "select" || !f.globalType || !f.optionsKey) continue;
      const items = globalByModel[f.globalType];
      if (!options[f.optionsKey]) {
        options[f.optionsKey] = items.map((x) => ({ value: x.id, label: x.name }));
        relLabels[f.name] = new Map(items.map((x) => [x.id, x.name]));
      }
      if (f.optionsByParentKey && f.parentColumn && !optionsByParent[f.optionsByParentKey]) {
        const grouped: Record<string, Option[]> = {};
        for (const x of items) {
          const parent = String(x[f.parentColumn] ?? "");
          (grouped[parent] ??= []).push({ value: x.id, label: x.name });
        }
        optionsByParent[f.optionsByParentKey] = grouped;
      }
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

  // For an external user this reflects the level their district granted, so a VIEW_ONLY
  // external sees the same read-only workspace a Viewer does.
  const canManage = userCan(me, "manage_master_data");

  return (
    <div>
      <PageHeader
        title="Master data"
        description="Your district's account dimensions. Switch between them with the tabs below."
      />
      <MasterDataWorkspace
        kinds={kinds}
        options={options}
        optionsByParent={optionsByParent}
        relLabels={relLabels}
        districtId={me.districtId}
        canManage={canManage}
        initialTab={tab}
      />
    </div>
  );
}
