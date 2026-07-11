"use client";

import { useActionState, useEffect } from "react";
import { updateConfigItem } from "@/app/actions/config";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms";
import type { ConfigKind, ConfigRow } from "@/lib/config/registry";
import { TR, TD } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export function EditConfigRow({
  kind,
  row,
  onDone,
}: {
  kind: ConfigKind;
  row: ConfigRow;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    updateConfigItem,
    EMPTY_FORM_STATE,
  );

  // Close the editor once the rename succeeds (the revalidated list already
  // carries the new name).
  useEffect(() => {
    if (state.success) onDone();
  }, [state.success, onDone]);

  return (
    <TR>
      <TD colSpan={3}>
        {state.error && (
          <div className="mb-2">
            <Alert tone="error">{state.error}</Alert>
          </div>
        )}
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={row.id} />
          <Input
            name="name"
            defaultValue={row.name}
            required
            autoComplete="off"
            autoFocus
            className="h-9 w-72 max-w-full"
          />
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancel
          </Button>
        </form>
      </TD>
    </TR>
  );
}
