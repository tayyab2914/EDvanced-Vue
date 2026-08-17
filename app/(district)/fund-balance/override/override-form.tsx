"use client";

import { useActionState, useMemo, useState } from "react";
import {
  saveFundBalanceCorrections,
  clearFundBalanceCorrections,
} from "@/app/actions/fund-balance";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { money, accounting } from "@/lib/dashboard/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export interface ComponentRow {
  field: string;
  label: string;
  /** The platform's figure, as a plain decimal string — what the entry is measured against. */
  calculated: string;
  calculatedDisplay: string;
  /** The correction currently in force, or "" when the calculated figure stands. */
  corrected: string;
}

/**
 * The correction sheet.
 *
 * Two columns and one row per component, which is the client's own sketch of this screen:
 * "all the fund balance components are listed, there is the system calculated column which
 * cannot be edited, and the corrected column they can just type — and it auto-calculates the
 * total FB based on their entry."
 *
 * The total row is the reason this is a controlled form rather than a plain one. It has to
 * move as the district types, before anything is posted, because the total is what they are
 * actually checking — the components are how they get to it. The same arithmetic runs again
 * on the server (`correctedTotal`) against a freshly recomputed base, so nothing here is
 * trusted; this copy exists to be read, not to be saved.
 *
 * The reason remains a required field with no default text and a minimum length, and that is
 * still the point of the whole screen. §5.20: "An override on a derived financial figure is
 * the first thing an auditor asks about, and 'why' is the question." A placeholder that could
 * be accepted as-is would make the requirement decorative.
 */
export function OverrideForm({
  fiscalYear,
  period,
  fundId,
  rows,
  total,
  hasCorrections,
  reason,
}: {
  fiscalYear: string;
  period: number;
  fundId: string;
  rows: ComponentRow[];
  total: { calculated: string; calculatedDisplay: string };
  hasCorrections: boolean;
  reason: string;
}) {
  const [state, action, pending] = useActionState(
    saveFundBalanceCorrections,
    EMPTY_FORM_STATE,
  );
  const [clearState, clearAction, clearing] = useActionState(
    clearFundBalanceCorrections,
    EMPTY_FORM_STATE,
  );

  const [entries, setEntries] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.field, r.corrected])),
  );

  /**
   * The derived total, and whether every box currently holds something that is a number.
   *
   * A row mid-typing ("1,2") is not an error yet and must not blank the total out — it is
   * left at its calculated figure until it parses, and the caption says the total is
   * provisional while anything is unreadable.
   */
  const derived = useMemo(() => {
    let value = Number(total.calculated);
    let corrections = 0;
    let unreadable = 0;
    for (const row of rows) {
      const raw = (entries[row.field] ?? "").trim();
      if (raw === "") continue;
      const n = parseAmount(raw);
      if (n === null) {
        unreadable += 1;
        continue;
      }
      corrections += 1;
      value += n - Number(row.calculated);
    }
    return { value, corrections, unreadable, change: value - Number(total.calculated) };
  }, [entries, rows, total.calculated]);

  const anyCorrection = derived.corrections > 0;

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <input type="hidden" name="fiscalYear" value={fiscalYear} />
        <input type="hidden" name="period" value={period} />
        <input type="hidden" name="fundId" value={fundId} />

        <div className="-mx-1 overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.05em] text-[#060606]"
                >
                  Component
                </th>
                <th
                  scope="col"
                  style={{ width: "26%" }}
                  className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.05em] text-[#060606]"
                >
                  Calculated
                </th>
                <th
                  scope="col"
                  style={{ width: "30%" }}
                  className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.05em] text-[#060606]"
                >
                  Corrected amount
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const errors = state.fieldErrors?.[`value_${row.field}`];
                const entry = entries[row.field] ?? "";
                const edited = entry.trim() !== "" && entry.trim() !== row.corrected.trim();
                return (
                  <tr key={row.field} className="border-t border-line-soft align-top">
                    <td className="px-3 py-2.5 text-[12px] text-[#060606]">
                      <span className="font-medium">{row.label}</span>
                      {row.corrected !== "" && (
                        <span className="ml-1.5 text-[11px] text-[#060606]">
                          {edited ? "correction edited" : "corrected"}
                        </span>
                      )}
                    </td>
                    {/* System driven, and not editable. The figure the correction is against. */}
                    <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-[#060606]">
                      {row.calculatedDisplay}
                    </td>
                    <td className="px-3 py-2">
                      <label className="sr-only" htmlFor={`value_${row.field}`}>
                        Corrected {row.label.toLowerCase()}
                      </label>
                      <input
                        id={`value_${row.field}`}
                        name={`value_${row.field}`}
                        inputMode="decimal"
                        autoComplete="off"
                        value={entry}
                        onChange={(e) =>
                          setEntries((s) => ({ ...s, [row.field]: e.target.value }))
                        }
                        placeholder="Use calculated"
                        aria-invalid={errors ? true : undefined}
                        className={cn(
                          "h-9 w-full rounded-lg border bg-white px-3 text-right text-[13px] tabular-nums text-[#060606] outline-none placeholder:text-[#060606] placeholder:text-[12px] focus:border-brand",
                          errors ? "border-action" : "border-line",
                        )}
                      />
                      {errors?.map((e) => (
                        <p key={e} className="mt-1 text-right text-[11px] text-action">
                          {e}
                        </p>
                      ))}
                    </td>
                  </tr>
                );
              })}

              {/*
                THE TOTAL — auto calculated by the system, on both columns.

                Left column: what the platform derived. Right column: that same figure with
                the entries above applied. Nobody types in this row, which is why there is no
                input in it: a hand-typed total could be saved disagreeing with its own parts.
              */}
              <tr className="border-t-2 border-line bg-panel font-semibold text-[#060606]">
                <td className="px-3 py-2.5 text-[12px]">
                  Total fund balance
                  <span className="ml-1.5 text-[11px] font-normal text-[#060606]">
                    auto calculated
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right text-[12px] tabular-nums">
                  {total.calculatedDisplay}
                </td>
                <td className="px-3 py-2.5 text-right text-[12px] tabular-nums">
                  <span className={cn(!anyCorrection && "font-normal text-[#060606]")}>
                    {money(derived.value)}
                  </span>
                  {anyCorrection && derived.change !== 0 && (
                    <span className="mt-0.5 block text-[11px] font-normal text-[#060606]">
                      {accounting(derived.change)} vs calculated
                    </span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-[11px] leading-relaxed text-[#060606]">
          {derived.unreadable > 0
            ? "One of the amounts above is not a number yet, so the total does not include it."
            : anyCorrection
              ? "The total is the calculated total with your corrections applied. It is saved with them and is what alerts and forecasts will read."
              : "Leave a box empty to keep the calculated figure. Clearing a correction that is in force restores the calculated figure for that component."}
        </p>

        <div>
          <label htmlFor="reason" className="block text-[12px] font-medium text-[#060606]">
            Why is this being corrected? <span className="text-action">*</span>
          </label>
          <textarea
            id="reason"
            name="reason"
            rows={3}
            defaultValue={reason}
            placeholder="e.g. Audit adjustment per the FY2025 management letter, item 4."
            className="mt-1.5 w-full rounded-lg border border-line bg-white px-3 py-2 text-[13px] leading-relaxed text-[#060606] outline-none focus:border-brand"
          />
          <p className="mt-1 text-[11px] text-[#060606]">
            Stored with every figure you change here and shown to anyone who sees them.
            Required. Components you leave untouched keep the reason they were entered with.
          </p>
          {state.fieldErrors?.reason?.map((e) => (
            <p key={e} className="mt-1 text-[11px] text-action">
              {e}
            </p>
          ))}
        </div>

        {state.error && <p className="text-[12px] text-action">{state.error}</p>}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : hasCorrections ? "Update corrections" : "Save corrections"}
          </Button>
        </div>
      </form>

      {hasCorrections && (
        <form action={clearAction} className="border-t border-line-soft pt-4">
          <input type="hidden" name="fiscalYear" value={fiscalYear} />
          <input type="hidden" name="period" value={period} />
          <input type="hidden" name="fundId" value={fundId} />
          <button
            type="submit"
            disabled={clearing}
            className="text-[12px] font-medium text-action hover:underline disabled:opacity-60"
          >
            {clearing
              ? "Removing…"
              : "Remove every correction and use the calculated figures"}
          </button>
          {clearState.error && (
            <p className="mt-1 text-[12px] text-action">{clearState.error}</p>
          )}
          {clearState.success && (
            <p className="mt-1 text-[12px] text-strong">{clearState.success}</p>
          )}
        </form>
      )}
    </div>
  );
}

/**
 * A typed amount, or null when it is not a number yet.
 *
 * The same shape the action parses with, deliberately — a figure this accepts and the server
 * rejects would show a total that cannot be saved.
 */
function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
