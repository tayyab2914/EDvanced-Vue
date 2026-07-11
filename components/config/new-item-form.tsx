"use client";

import { useActionState, useEffect } from "react";
import { createConfigItem } from "@/app/actions/config";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms";
import type { ConfigKind } from "@/lib/config/registry";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export function NewConfigItemForm({
  kind,
  singular,
  onDone,
}: {
  kind: ConfigKind;
  singular: string;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    createConfigItem,
    EMPTY_FORM_STATE,
  );

  // Close once the create succeeds; the revalidated list shows the new row.
  useEffect(() => {
    if (state.success) onDone();
  }, [state.success, onDone]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="kind" value={kind} />
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <Field
        label={`${singular} name`}
        htmlFor="c-name"
        error={state.fieldErrors?.name?.[0]}
      >
        <Input id="c-name" name="name" required autoComplete="off" autoFocus />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
