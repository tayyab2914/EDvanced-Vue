"use client";

import { useActionState } from "react";
import { updateDistrictSettings } from "@/app/actions/districts";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms";
import { MONTHS } from "@/lib/format";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export function DistrictSettingsForm({
  district,
}: {
  district: {
    id: string;
    name: string;
    fiscalYearStartMonth: number;
  };
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    updateDistrictSettings,
    EMPTY_FORM_STATE,
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="districtId" value={district.id} />
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="District name"
          htmlFor="s-name"
          error={state.fieldErrors?.name?.[0]}
        >
          <Input id="s-name" name="name" defaultValue={district.name} required />
        </Field>
        <Field
          label="Fiscal year starts"
          htmlFor="s-fy"
          error={state.fieldErrors?.fiscalYearStartMonth?.[0]}
        >
          <Select
            id="s-fy"
            name="fiscalYearStartMonth"
            defaultValue={String(district.fiscalYearStartMonth)}
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}
