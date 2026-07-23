"use client";

import { useActionState } from "react";
import { saveForecastAssumptions } from "@/app/actions/forecast";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { Button } from "@/components/ui/button";

/**
 * The two growth rates (Spec §6.2 card 1) — the entry screen the specification lists as a
 * known gap.
 *
 * Read-only for anyone without `edit_forecast_assumptions`: a Viewer should still see the
 * assumptions behind the projection they are being shown, because a projection whose
 * inputs are hidden is a number nobody can argue with.
 */
export function AssumptionsForm({
  fiscalYear,
  revenueGrowth,
  expenditureGrowth,
  canEdit,
}: {
  fiscalYear: string;
  revenueGrowth: number | null;
  expenditureGrowth: number | null;
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState(saveForecastAssumptions, EMPTY_FORM_STATE);

  if (!canEdit) {
    return (
      <dl className="grid gap-4 sm:grid-cols-2">
        <Readonly label="Revenue growth (annual)" value={revenueGrowth} />
        <Readonly label="Expenditure growth (annual)" value={expenditureGrowth} />
      </dl>
    );
  }

  return (
    <form action={action} className="grid gap-4 lg:grid-cols-[1fr_1fr_1.4fr]">
      <input type="hidden" name="fiscalYear" value={fiscalYear} />

      <Field
        name="revenueGrowth"
        label="Revenue growth (annual)"
        defaultValue={revenueGrowth}
        errors={state.fieldErrors?.revenueGrowth}
        hint="Expected increase in state, local and federal sources."
      />
      <Field
        name="expenditureGrowth"
        label="Expenditure growth (annual)"
        defaultValue={expenditureGrowth}
        errors={state.fieldErrors?.expenditureGrowth}
        hint="Expected cost increases including salaries, benefits and inflation."
      />

      <div className="flex flex-col justify-between gap-3">
        <p className="rounded-lg bg-panel px-3.5 py-3 text-[12px] leading-relaxed text-muted">
          These rates compound from the current year&apos;s projected pace. Leave them empty and
          the projection holds this year&apos;s figures flat — which is an assumption too, and
          usually an optimistic one.
        </p>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save assumptions"}
          </Button>
          {state.success && <span className="text-[12.5px] text-strong">{state.success}</span>}
          {state.error && <span className="text-[12.5px] text-action">{state.error}</span>}
        </div>
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  defaultValue,
  errors,
  hint,
}: {
  name: string;
  label: string;
  defaultValue: number | null;
  errors?: string[];
  hint: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-[12.5px] font-medium text-ink-soft">
        {label}
      </label>
      <div className="relative mt-1.5">
        <input
          id={name}
          name={name}
          type="number"
          step="0.01"
          min={-100}
          max={100}
          defaultValue={defaultValue ?? ""}
          placeholder="0.00"
          aria-describedby={`${name}-hint`}
          className="h-9 w-full rounded-lg border border-line bg-white pl-3 pr-7 text-[13px] tabular-nums text-ink outline-none transition-colors focus:border-brand"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px] text-muted-2">
          %
        </span>
      </div>
      <p id={`${name}-hint`} className="mt-1 text-[11px] leading-snug text-muted-2">
        {hint}
      </p>
      {errors?.map((e) => (
        <p key={e} className="mt-1 text-[11.5px] text-action">
          {e}
        </p>
      ))}
    </div>
  );
}

function Readonly({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <dt className="text-[12.5px] text-muted">{label}</dt>
      <dd className="mt-1 text-[17px] font-semibold tabular-nums text-ink">
        {value === null ? "0.00%" : `${value.toFixed(2)}%`}
      </dd>
    </div>
  );
}
