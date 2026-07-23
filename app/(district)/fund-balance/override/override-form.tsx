"use client";

import { useActionState, useState } from "react";
import { saveFundBalanceOverride, clearFundBalanceOverride } from "@/app/actions/fund-balance";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { Button } from "@/components/ui/button";

const FIELDS = [
  { value: "TOTAL", label: "Total fund balance" },
  { value: "UNASSIGNED", label: "Unassigned" },
  { value: "NONSPENDABLE", label: "Nonspendable" },
  { value: "RESTRICTED", label: "Restricted" },
  { value: "COMMITTED", label: "Committed" },
  { value: "ASSIGNED", label: "Assigned" },
] as const;

/**
 * The override form.
 *
 * The reason is a required field with no default text and a minimum length, and that is
 * the point of the whole screen. §5.20: "An override on a derived financial figure is the
 * first thing an auditor asks about, and 'why' is the question." A placeholder that could
 * be accepted as-is would make the requirement decorative.
 */
export function OverrideForm({
  fiscalYear,
  period,
  fundId,
  computed,
  existing,
}: {
  fiscalYear: string;
  period: number;
  fundId: string;
  computed: Record<string, string>;
  existing: { field: string; value: string; reason: string }[];
}) {
  const [state, action, pending] = useActionState(saveFundBalanceOverride, EMPTY_FORM_STATE);
  const [clearState, clearAction] = useActionState(clearFundBalanceOverride, EMPTY_FORM_STATE);
  const [field, setField] = useState<string>(FIELDS[0].value);

  const current = existing.find((e) => e.field === field);

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <input type="hidden" name="fiscalYear" value={fiscalYear} />
        <input type="hidden" name="period" value={period} />
        <input type="hidden" name="fundId" value={fundId} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="field" className="block text-[12.5px] font-medium text-ink-soft">
              Which figure
            </label>
            <select
              id="field"
              name="field"
              value={field}
              onChange={(e) => setField(e.target.value)}
              className="mt-1.5 h-9 w-full rounded-lg border border-line bg-white px-2.5 text-[13px] text-ink outline-none focus:border-brand"
            >
              {FIELDS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                  {existing.some((e) => e.field === f.value) ? " — corrected" : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-muted-2">
              Calculated: <strong className="tabular-nums">{computed[field] ?? "—"}</strong>
            </p>
          </div>

          <div>
            <label htmlFor="value" className="block text-[12.5px] font-medium text-ink-soft">
              Corrected amount
            </label>
            <input
              id="value"
              name="value"
              inputMode="decimal"
              defaultValue={current?.value ?? ""}
              placeholder="0.00"
              key={field}
              className="mt-1.5 h-9 w-full rounded-lg border border-line bg-white px-3 text-[13px] tabular-nums text-ink outline-none focus:border-brand"
            />
            {state.fieldErrors?.value?.map((e) => (
              <p key={e} className="mt-1 text-[11.5px] text-action">
                {e}
              </p>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="reason" className="block text-[12.5px] font-medium text-ink-soft">
            Why is this being corrected? <span className="text-action">*</span>
          </label>
          <textarea
            id="reason"
            name="reason"
            rows={3}
            required
            defaultValue={current?.reason ?? ""}
            key={`reason-${field}`}
            placeholder="e.g. Audit adjustment per the FY2025 management letter, item 4."
            className="mt-1.5 w-full rounded-lg border border-line bg-white px-3 py-2 text-[13px] leading-relaxed text-ink outline-none focus:border-brand"
          />
          <p className="mt-1 text-[11px] text-muted-2">
            Stored with the figure and shown to anyone who sees it. Required.
          </p>
          {state.fieldErrors?.reason?.map((e) => (
            <p key={e} className="mt-1 text-[11.5px] text-action">
              {e}
            </p>
          ))}
        </div>

        {state.error && <p className="text-[12.5px] text-action">{state.error}</p>}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : current ? "Update correction" : "Save correction"}
          </Button>
        </div>
      </form>

      {current && (
        <form action={clearAction} className="border-t border-line-soft pt-4">
          <input type="hidden" name="fiscalYear" value={fiscalYear} />
          <input type="hidden" name="period" value={period} />
          <input type="hidden" name="fundId" value={fundId} />
          <input type="hidden" name="field" value={field} />
          <button
            type="submit"
            className="text-[12.5px] font-medium text-action hover:underline"
          >
            Remove this correction and use the calculated figure
          </button>
          {clearState.success && (
            <p className="mt-1 text-[12px] text-strong">{clearState.success}</p>
          )}
        </form>
      )}
    </div>
  );
}
