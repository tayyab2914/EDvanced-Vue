"use client";

import { useActionState, useEffect } from "react";
import { deleteConfigItem } from "@/app/actions/config";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms";
import type { ConfigKind, ConfigRow } from "@/lib/config/registry";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export function DeleteConfigConfirm({
  kind,
  row,
  onDone,
}: {
  kind: ConfigKind;
  row: ConfigRow;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    deleteConfigItem,
    EMPTY_FORM_STATE,
  );

  useEffect(() => {
    if (state.success) onDone();
  }, [state.success, onDone]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={row.id} />
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <p className="text-[13.5px] leading-relaxed text-ink-soft">
        Delete <strong className="font-semibold text-ink">{row.name}</strong>?
        This can’t be undone.
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Deleting…" : "Delete"}
        </Button>
      </div>
    </form>
  );
}
