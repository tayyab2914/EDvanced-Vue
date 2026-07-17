"use client";

import { useActionState, useEffect } from "react";
import { deleteMasterItem } from "@/app/actions/master-data";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms";
import type { ClientResourceDef } from "@/lib/master-data/registry";
import type { MasterRow } from "@/components/master-data/master-item-form";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

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
  const [state, action, pending] = useActionState<FormState, FormData>(
    deleteMasterItem,
    EMPTY_FORM_STATE,
  );

  // Close only on success. A delete can now legitimately fail — periodic data references
  // master data with onDelete: Restrict — and closing regardless would swallow the reason.
  useEffect(() => {
    if (state.success) onCancel();
  }, [state.success, onCancel]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="kind" value={def.kind} />
      <input type="hidden" name="districtId" value={districtId} />
      <input type="hidden" name="id" value={row.id} />

      {state.error && <Alert tone="error">{state.error}</Alert>}

      <p className="text-[13.5px] leading-relaxed text-ink-soft">
        Delete <strong className="font-semibold text-ink">{label}</strong>? This
        can&rsquo;t be undone.
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {state.error ? "Close" : "Cancel"}
        </Button>
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Deleting…" : "Delete"}
        </Button>
      </div>
    </form>
  );
}
