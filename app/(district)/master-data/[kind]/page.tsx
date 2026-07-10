import { redirect, notFound } from "next/navigation";
import { requirePermission, getTenantDb } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import { RESOURCES, type MasterKind } from "@/lib/master-data/registry";
import { PageHeader } from "@/components/page-header";
import {
  MasterDataSection,
  type MasterRow,
} from "@/components/master-data/master-data-section";
import type { Option } from "@/components/master-data/add-item-form";

export default async function MasterDataKindPage({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const me = await requirePermission("view_master_data");
  if (!me.districtId) redirect("/platform");

  const { kind } = await params;
  const def = RESOURCES[kind as MasterKind];
  if (!def) notFound();

  const { db } = await getTenantDb();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = (db as any)[def.model];
  const orderBy = def.isReference
    ? [{ isStandard: "desc" }, { code: "asc" }]
    : { createdAt: "desc" };
  const rows: MasterRow[] = await model.findMany({ orderBy });

  const options: Record<string, Option[]> = {};
  const relLabels: Record<string, Map<string, string>> = {};

  if (def.kind === "funds") {
    const fundTypes = await db.fundType.findMany({
      where: { active: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    });
    options.fundTypes = fundTypes.map((x) => ({
      value: x.id,
      label: `${x.code} — ${x.name}`,
    }));
    relLabels.fundTypeId = new Map(
      fundTypes.map((x) => [x.id, `${x.code} — ${x.name}`]),
    );
  }
  if (def.kind === "grants") {
    const funds = await db.fund.findMany({
      where: { active: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    });
    options.funds = funds.map((x) => ({
      value: x.id,
      label: `${x.code} — ${x.name}`,
    }));
    relLabels.fundId = new Map(
      funds.map((x) => [x.id, `${x.code} — ${x.name}`]),
    );
  }

  const canManage = hasPermission(me.role, "manage_master_data");

  return (
    <div>
      <PageHeader
        title={def.title}
        description={
          def.isReference
            ? "Reference list used to validate uploads. Standard rows are seeded; add or deactivate as needed."
            : `Manage your district's ${def.title.toLowerCase()}.`
        }
      />
      <MasterDataSection
        def={def}
        districtId={me.districtId}
        rows={rows}
        options={options}
        relLabels={relLabels}
        canManage={canManage}
      />
    </div>
  );
}
