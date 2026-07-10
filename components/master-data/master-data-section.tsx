import { Disclosure } from "@/components/disclosure";
import { AddItemForm, type Option } from "@/components/master-data/add-item-form";
import {
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  EmptyRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toggleMasterItem, deleteMasterItem } from "@/app/actions/master-data";
import type { FieldDef, ResourceDef } from "@/lib/master-data/registry";

export interface MasterRow {
  id: string;
  active: boolean;
  isStandard?: boolean;
  [key: string]: unknown;
}

function cellValue(
  f: FieldDef,
  row: MasterRow,
  relLabels: Record<string, Map<string, string>>,
): string {
  const val = row[f.name];
  if (f.type === "select" && relLabels[f.name]) {
    return val ? (relLabels[f.name].get(String(val)) ?? "—") : "—";
  }
  return val ? String(val) : "—";
}

export function MasterDataSection({
  def,
  districtId,
  rows,
  options,
  relLabels,
  canManage,
}: {
  def: ResourceDef;
  districtId: string;
  rows: MasterRow[];
  options: Record<string, Option[]>;
  relLabels: Record<string, Map<string, string>>;
  canManage: boolean;
}) {
  const colSpan = def.fields.length + (canManage ? 2 : 1);
  return (
    <div className="space-y-4">
      {canManage && (
        <Disclosure label={`Add ${def.singular.toLowerCase()}`}>
          <AddItemForm
            kind={def.kind}
            districtId={districtId}
            singular={def.singular}
            fields={def.fields}
            options={options}
          />
        </Disclosure>
      )}

      <Table>
        <THead>
          <TR>
            {def.fields.map((f) => (
              <TH key={f.name}>{f.label}</TH>
            ))}
            <TH>Status</TH>
            {canManage && <TH className="text-right">Actions</TH>}
          </TR>
        </THead>
        <TBody>
          {rows.length === 0 && (
            <EmptyRow colSpan={colSpan}>
              No {def.title.toLowerCase()} yet
              {canManage ? ". Add your first above." : "."}
            </EmptyRow>
          )}
          {rows.map((r) => {
            const protectedRow = def.isReference && r.isStandard;
            return (
              <TR key={r.id}>
                {def.fields.map((f, i) => (
                  <TD
                    key={f.name}
                    className={i === 0 ? "font-medium text-ink" : ""}
                  >
                    {cellValue(f, r, relLabels)}
                  </TD>
                ))}
                <TD>
                  {r.active ? (
                    <Badge tone="green">Active</Badge>
                  ) : (
                    <Badge tone="gray">Inactive</Badge>
                  )}
                  {protectedRow && (
                    <span className="ml-2">
                      <Badge tone="blue">Standard</Badge>
                    </span>
                  )}
                </TD>
                {canManage && (
                  <TD>
                    <div className="flex items-center justify-end gap-1.5">
                      <form action={toggleMasterItem}>
                        <input type="hidden" name="kind" value={def.kind} />
                        <input
                          type="hidden"
                          name="districtId"
                          value={districtId}
                        />
                        <input type="hidden" name="id" value={r.id} />
                        <input
                          type="hidden"
                          name="active"
                          value={r.active ? "false" : "true"}
                        />
                        <Button type="submit" variant="ghost" size="sm">
                          {r.active ? "Deactivate" : "Activate"}
                        </Button>
                      </form>
                      {!protectedRow && (
                        <form action={deleteMasterItem}>
                          <input type="hidden" name="kind" value={def.kind} />
                          <input
                            type="hidden"
                            name="districtId"
                            value={districtId}
                          />
                          <input type="hidden" name="id" value={r.id} />
                          <Button type="submit" variant="danger" size="sm">
                            Delete
                          </Button>
                        </form>
                      )}
                    </div>
                  </TD>
                )}
              </TR>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}
