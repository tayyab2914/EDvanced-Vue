"use client";

import { useActionState, useEffect, useState } from "react";
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
  optionsByParent,
  row,
  onDone,
}: {
  def: ClientResourceDef;
  districtId: string;
  options: Record<string, Option[]>;
  optionsByParent: Record<string, Record<string, Option[]>>;
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

  // Radio + dependent fields are controlled so the Type can react to Category.
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of def.fields) {
      if (f.type === "radio" || f.dependsOn) init[f.name] = val(f.name);
    }
    return init;
  });
  const setVal = (name: string, value: string) =>
    setVals((prev) => {
      const next = { ...prev, [name]: value };
      // Reset any field that depends on the one we just changed.
      for (const f of def.fields) if (f.dependsOn === name) next[f.name] = "";
      return next;
    });

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
          const selectDefault =
            val(f.name) ||
            (f.required && !f.placeholder ? (opts[0]?.value ?? "") : "");
          const fullWidth = f.type === "textarea" || f.type === "radio";
          return (
            <div key={f.name} className={fullWidth ? "sm:col-span-2" : ""}>
              <Field
                label={f.label}
                htmlFor={`f-${f.name}`}
                error={state.fieldErrors?.[f.name]?.[0]}
              >
                {f.type === "radio" ? (
                  <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
                    {(f.staticOptions ?? []).map((o) => (
                      <label
                        key={o.value}
                        className="inline-flex items-center gap-1.5 text-[13.5px] text-ink-soft"
                      >
                        <input
                          type="radio"
                          name={f.name}
                          value={o.value}
                          checked={vals[f.name] === o.value}
                          onChange={() => setVal(f.name, o.value)}
                          required={f.required}
                          className="h-4 w-4 accent-brand"
                        />
                        {o.label}
                      </label>
                    ))}
                  </div>
                ) : f.dependsOn ? (
                  (() => {
                    const parent = vals[f.dependsOn] ?? "";
                    // Options come either from a static map or, for a globalType-backed
                    // select, from the server-loaded parent→options map.
                    const depOpts =
                      f.optionsByParent?.[parent] ??
                      optionsByParent[f.optionsByParentKey ?? ""]?.[parent] ??
                      [];
                    const parentLabel =
                      def.fields
                        .find((p) => p.name === f.dependsOn)
                        ?.label.toLowerCase() ?? "parent";
                    return (
                      <Select
                        id={`f-${f.name}`}
                        name={f.name}
                        required={f.required}
                        disabled={!parent}
                        value={vals[f.name] ?? ""}
                        onChange={(e) => setVal(f.name, e.target.value)}
                      >
                        <option value="" disabled>
                          {!parent
                            ? `Select a ${parentLabel} first`
                            : depOpts.length
                              ? "Select…"
                              : `No types for this ${parentLabel} yet`}
                        </option>
                        {depOpts.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    );
                  })()
                ) : f.type === "textarea" ? (
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
