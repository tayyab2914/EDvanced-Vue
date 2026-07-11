"use client";

import { useActionState, useEffect } from "react";
import { updateConfigItem } from "@/app/actions/config";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms";
import type { ConfigKind, ConfigRow } from "@/lib/config/registry";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export function EditConfigForm({
  kind,
  singular,
  row,
  onDone,
}: {
  kind: ConfigKind;
  singular: string;
  row: ConfigRow;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    updateConfigItem,
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Code"
          hint="Optional"
          htmlFor="e-code"
          error={state.fieldErrors?.code?.[0]}
        >
          <Input
            id="e-code"
            name="code"
            defaultValue={row.code ?? ""}
            autoComplete="off"
          />
        </Field>
        <Field
          label={`${singular} name`}
          htmlFor="e-name"
          error={state.fieldErrors?.name?.[0]}
        >
          <Input
            id="e-name"
            name="name"
            defaultValue={row.name}
            required
            autoComplete="off"
          />
        </Field>
      </div>
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
