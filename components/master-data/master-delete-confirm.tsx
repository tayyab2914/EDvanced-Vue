"use client";

import { deleteMasterItem } from "@/app/actions/master-data";
import type { ClientResourceDef } from "@/lib/master-data/registry";
import type { MasterRow } from "@/components/master-data/master-item-form";
import { Button } from "@/components/ui/button";

export function MasterDeleteConfirm({
  def,
  districtId,
  row,
  label,
  onCancel,
}: {
  def: ClientResourceDef;
  districtId: string;
  row: MasterRow;
  label: string;
  onCancel: () => void;
}) {
  // deleteMasterItem is a void action that revalidates; the confirm modal closes
  // when the parent clears its `deleting` state on submit.
  return (
    <form action={deleteMasterItem} onSubmit={onCancel} className="space-y-4">
      <input type="hidden" name="kind" value={def.kind} />
      <input type="hidden" name="districtId" value={districtId} />
      <input type="hidden" name="id" value={row.id} />
      <p className="text-[13.5px] leading-relaxed text-ink-soft">
        Delete <strong className="font-semibold text-ink">{label}</strong>? This
        can’t be undone.
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="danger">
          Delete
        </Button>
      </div>
    </form>
  );
}
