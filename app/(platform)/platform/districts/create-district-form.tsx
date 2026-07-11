"use client";

import { useActionState } from "react";
import { createDistrict } from "@/app/actions/districts";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms";
import { MONTHS } from "@/lib/format";
import { US_STATES, DEFAULT_STATE } from "@/lib/us-states";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export function CreateDistrictForm({ onCancel }: { onCancel?: () => void }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    createDistrict,
    EMPTY_FORM_STATE,
  );

  return (
    <form action={action} className="space-y-4">
        {state.error && <Alert tone="error">{state.error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="District name"
            htmlFor="d-name"
            error={state.fieldErrors?.name?.[0]}
          >
            <Input id="d-name" name="name" required />
          </Field>
          <Field
            label="Short code"
            htmlFor="d-code"
            hint="Unique identifier, e.g. “alpha”."
            error={state.fieldErrors?.code?.[0]}
          >
            <Input id="d-code" name="code" required />
          </Field>
          <Field
            label="Fiscal year starts"
            htmlFor="d-fy"
            error={state.fieldErrors?.fiscalYearStartMonth?.[0]}
          >
            <Select id="d-fy" name="fiscalYearStartMonth" defaultValue="7">
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="State"
            htmlFor="d-state"
            error={state.fieldErrors?.state?.[0]}
          >
            <Select id="d-state" name="state" defaultValue={DEFAULT_STATE}>
              {US_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="rounded-md bg-panel p-4">
          <p className="mb-3 text-sm font-medium text-ink-soft">
            First District Admin{" "}
            <span className="font-normal text-faint">(optional)</span>
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Admin name" htmlFor="a-name">
              <Input id="a-name" name="adminName" />
            </Field>
            <Field
              label="Admin email"
              htmlFor="a-email"
              hint="They’ll receive an invite to set a password."
              error={state.fieldErrors?.adminEmail?.[0]}
            >
              <Input id="a-email" name="adminEmail" type="email" />
            </Field>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create district"}
          </Button>
        </div>
    </form>
  );
}
