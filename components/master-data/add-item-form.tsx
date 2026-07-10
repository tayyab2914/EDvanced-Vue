"use client";

import { useActionState } from "react";
import { createMasterItem } from "@/app/actions/master-data";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms";
import type { FieldDef, MasterKind } from "@/lib/master-data/registry";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export interface Option {
  value: string;
  label: string;
}

export function AddItemForm({
  kind,
  districtId,
  singular,
  fields,
  options,
}: {
  kind: MasterKind;
  districtId: string;
  singular: string;
  fields: FieldDef[];
  options: Record<string, Option[]>;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    createMasterItem,
    EMPTY_FORM_STATE,
  );

  return (
    <Card>
      <form action={action} className="space-y-4">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="districtId" value={districtId} />
        {state.error && <Alert tone="error">{state.error}</Alert>}
        {state.success && <Alert tone="success">{state.success}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <Field
              key={f.name}
              label={f.label}
              htmlFor={`f-${f.name}`}
              error={state.fieldErrors?.[f.name]?.[0]}
            >
              {f.type === "textarea" ? (
                <Textarea id={`f-${f.name}`} name={f.name} rows={2} />
              ) : f.type === "select" ? (
                <Select id={`f-${f.name}`} name={f.name} defaultValue="">
                  <option value="">— none —</option>
                  {(options[f.optionsKey ?? ""] ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  id={`f-${f.name}`}
                  name={f.name}
                  required={f.required}
                  placeholder={f.placeholder}
                />
              )}
            </Field>
          ))}
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : `Add ${singular.toLowerCase()}`}
        </Button>
      </form>
    </Card>
  );
}
