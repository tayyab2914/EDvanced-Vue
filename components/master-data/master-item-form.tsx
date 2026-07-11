"use client";

import { useActionState, useEffect } from "react";
import { createMasterItem, updateMasterItem } from "@/app/actions/master-data";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms";
import type { ClientResourceDef } from "@/lib/master-data/registry";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export interface Option {
  value: string;
  label: string;
}

export interface MasterRow {
  id: string;
  active: boolean;
  [key: string]: unknown;
}

export function MasterItemForm({
  def,
  districtId,
  options,
  row,
  onDone,
}: {
  def: ClientResourceDef;
  districtId: string;
  options: Record<string, Option[]>;
  row?: MasterRow;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    row ? updateMasterItem : createMasterItem,
    EMPTY_FORM_STATE,
  );

  useEffect(() => {
    if (state.success) onDone();
  }, [state.success, onDone]);

  const val = (name: string) => (row ? String(row[name] ?? "") : "");

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="kind" value={def.kind} />
      <input type="hidden" name="districtId" value={districtId} />
      {row && <input type="hidden" name="id" value={row.id} />}
      {state.error && <Alert tone="error">{state.error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        {def.fields.map((f) => {
          const opts: { value: string; label: string }[] =
            f.staticOptions ?? options[f.optionsKey ?? ""] ?? [];
          // Required + placeholder (the Type fields) → start blank so the user must
          // pick. Required without a placeholder (statuses) → default to the first.
          const selectDefault =
            val(f.name) ||
            (f.required && !f.placeholder ? (opts[0]?.value ?? "") : "");
          return (
            <div
              key={f.name}
              className={f.type === "textarea" ? "sm:col-span-2" : ""}
            >
              <Field
                label={f.label}
                htmlFor={`f-${f.name}`}
                error={state.fieldErrors?.[f.name]?.[0]}
              >
                {f.type === "textarea" ? (
                  <Textarea
                    id={`f-${f.name}`}
                    name={f.name}
                    rows={2}
                    defaultValue={val(f.name)}
                  />
                ) : f.type === "select" ? (
                  <Select
                    id={`f-${f.name}`}
                    name={f.name}
                    required={f.required}
                    defaultValue={selectDefault}
                  >
                    {f.required && f.placeholder ? (
                      <option value="" disabled>
                        {f.placeholder}
                      </option>
                    ) : (
                      !f.required && <option value="">— none —</option>
                    )}
                    {opts.map((o) => (
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
                    defaultValue={val(f.name)}
                    inputMode={f.numeric ? "decimal" : undefined}
                    autoComplete="off"
                  />
                )}
              </Field>
            </div>
          );
        })}
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
