"use client";

import { useActionState, useState } from "react";
import { updateDistrictSettings } from "@/app/actions/districts";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms";
import { MONTHS } from "@/lib/format";
import { US_STATES } from "@/lib/us-states";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/cn";

const STATE_NAME = new Map(US_STATES.map((s) => [s.code, s.name]));

export function DistrictSettingsForm({
  district,
  title,
}: {
  district: {
    id: string;
    name: string;
    fiscalYearStartMonth: number;
    state: string;
  };
  title?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(
    updateDistrictSettings,
    EMPTY_FORM_STATE,
  );

  // Leave edit mode once a save succeeds — handled during render (each action
  // returns a fresh state object) rather than in an effect.
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.success) setEditing(false);
  }

  return (
    <div>
      <div
        className={cn(
          "mb-4 flex items-center gap-3",
          title ? "justify-between" : "justify-end",
        )}
      >
        {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
        {!editing && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setEditing(true)}
          >
            <Icon name="pencil" size={14} />
            Edit
          </Button>
        )}
      </div>

      {state.error && (
        <div className="mb-4">
          <Alert tone="error">{state.error}</Alert>
        </div>
      )}
      {!editing && state.success && (
        <div className="mb-4">
          <Alert tone="success">{state.success}</Alert>
        </div>
      )}

      {editing ? (
        <form action={action} className="space-y-4">
          <input type="hidden" name="districtId" value={district.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="District name"
              htmlFor="s-name"
              error={state.fieldErrors?.name?.[0]}
            >
              <Input
                id="s-name"
                name="name"
                defaultValue={district.name}
                required
              />
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
            <Field
              label="State"
              htmlFor="s-state"
              error={state.fieldErrors?.state?.[0]}
            >
              <Select id="s-state" name="state" defaultValue={district.state}>
                {US_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save settings"}
            </Button>
          </div>
        </form>
      ) : (
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <ReadRow label="District name" value={district.name} />
          <ReadRow
            label="State"
            value={STATE_NAME.get(district.state) ?? district.state}
          />
          <ReadRow
            label="Fiscal year starts"
            value={MONTHS[district.fiscalYearStartMonth - 1] ?? "—"}
          />
        </dl>
      )}
    </div>
  );
}

function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] text-muted-2">{label}</dt>
      <dd className="mt-0.5 text-[14px] font-medium text-ink">{value}</dd>
    </div>
  );
}
