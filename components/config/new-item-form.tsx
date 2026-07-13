"use client";

import { useActionState, useEffect } from "react";
import { createConfigItem } from "@/app/actions/config";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms";
import { CONFIG_RESOURCES, type ConfigKind } from "@/lib/config/registry";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
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
  const categoryField = CONFIG_RESOURCES[kind].categoryField;

  // Close once the create succeeds; the revalidated list shows the new row.
  useEffect(() => {
    if (state.success) onDone();
  }, [state.success, onDone]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="kind" value={kind} />
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Code"
          hint="Optional"
          htmlFor="c-code"
          error={state.fieldErrors?.code?.[0]}
        >
          <Input id="c-code" name="code" autoComplete="off" autoFocus />
        </Field>
        <Field
          label={`${singular} name`}
          htmlFor="c-name"
          error={state.fieldErrors?.name?.[0]}
        >
          <Input id="c-name" name="name" required autoComplete="off" />
        </Field>
        {categoryField && (
          <div className="sm:col-span-2">
            <Field
              label={categoryField.label}
              hint={`Which ${categoryField.label.toLowerCase()} this ${singular.toLowerCase()} applies to`}
              htmlFor="c-category"
              error={state.fieldErrors?.category?.[0]}
            >
              <Select id="c-category" name="category" required defaultValue="">
                <option value="" disabled>
                  Select a {categoryField.label.toLowerCase()}…
                </option>
                {categoryField.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
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
