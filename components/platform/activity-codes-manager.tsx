"use client";

import { useActionState } from "react";
import { addActivityCode, deleteActivityCode } from "@/app/actions/activity-codes";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export interface ActivityCodeRow {
  id: string;
  activityClass: "TRANSFERS_IN" | "TRANSFERS_OUT" | "OTHER_FINANCING_SOURCES";
  codeFrom: string;
  codeTo: string | null;
  note: string | null;
}

const CLASSES = [
  {
    value: "TRANSFERS_IN",
    label: "Transfers In",
    hint: "Revenue object codes for money moved in from another fund.",
  },
  {
    value: "TRANSFERS_OUT",
    label: "Transfers Out",
    hint: "Expense object codes for money moved out to another fund.",
  },
  {
    value: "OTHER_FINANCING_SOURCES",
    label: "Other Financing Sources",
    hint: "Revenue object codes that aren't earned revenue — sale of assets, debt proceeds.",
  },
] as const;

export function ActivityCodesManager({ rows }: { rows: ActivityCodeRow[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    addActivityCode,
    EMPTY_FORM_STATE,
  );

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-[15px] font-semibold">Why this matters</h2>
        <p className="mt-1.5 max-w-[68ch] text-[13px] leading-relaxed text-ink-soft">
          Transfers arrive inside the Revenue and Expenditure files rather than in a column of
          their own — they are ordinary rows carrying a particular object code. Telling them apart
          is what stops money a district moved between its own funds reading as though it earned or
          spent it.
        </p>
        <p className="mt-2.5 max-w-[68ch] text-[12.5px] leading-relaxed text-muted">
          The fund balance itself does <strong className="font-semibold">not</strong> depend on
          this — the classification cancels out of that arithmetic. What needs it is Net Operating
          Surplus and any figure that excludes transfers.
        </p>
      </Card>

      <Card>
        <h2 className="mb-4 text-[15px] font-semibold">Classify a code or range</h2>

        {state.error && (
          <div className="mb-4">
            <Alert tone="error">{state.error}</Alert>
          </div>
        )}
        {state.success && (
          <div className="mb-4">
            <Alert tone="success">{state.success}</Alert>
          </div>
        )}

        <form key={state.success ?? "form"} action={action} className="space-y-4">
          <Field
            label="Activity"
            htmlFor="activityClass"
            error={state.fieldErrors?.activityClass?.[0]}
          >
            <Select id="activityClass" name="activityClass" defaultValue="TRANSFERS_OUT">
              {CLASSES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Code"
              htmlFor="codeFrom"
              hint="A single object code, or the start of a range."
              error={state.fieldErrors?.codeFrom?.[0]}
            >
              <Input id="codeFrom" name="codeFrom" placeholder="9700" required />
            </Field>
            <Field
              label="To (optional)"
              htmlFor="codeTo"
              hint="Leave blank for one code. A chart of accounts usually groups them."
              error={state.fieldErrors?.codeTo?.[0]}
            >
              <Input id="codeTo" name="codeTo" placeholder="9799" />
            </Field>
          </div>

          <Field label="Note (optional)" htmlFor="note">
            <Input id="note" name="note" placeholder="Red Book: interfund transfers out" />
          </Field>

          <Button type="submit" disabled={pending}>
            {pending ? "Adding…" : "Add classification"}
          </Button>
        </form>
      </Card>

      {CLASSES.map((c) => {
        const mine = rows.filter((r) => r.activityClass === c.value);
        return (
          <Card key={c.value}>
            <div className="mb-3 flex items-baseline justify-between">
              <div>
                <h2 className="text-[14.5px] font-semibold">{c.label}</h2>
                <p className="mt-0.5 text-[12px] text-muted-2">{c.hint}</p>
              </div>
              <Badge tone={mine.length > 0 ? "blue" : "gray"}>
                {mine.length} {mine.length === 1 ? "entry" : "entries"}
              </Badge>
            </div>

            {mine.length === 0 ? (
              <p className="py-4 text-center text-[12.5px] text-muted-2">
                Nothing classified yet. Until it is, these figures are treated as ordinary revenue
                or spending.
              </p>
            ) : (
              <div className="flex flex-col">
                {mine.map((r, i) => (
                  <div
                    key={r.id}
                    className={
                      "flex items-center gap-3 py-2" +
                      (i < mine.length - 1 ? " border-b border-line-soft" : "")
                    }
                  >
                    <span className="font-mono text-[12.5px] font-medium text-ink">
                      {r.codeTo ? `${r.codeFrom}–${r.codeTo}` : r.codeFrom}
                    </span>
                    <span className="flex-1 truncate text-[12px] text-muted">{r.note ?? ""}</span>
                    <DeleteButton id={r.id} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function DeleteButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    deleteActivityCode,
    EMPTY_FORM_STATE,
  );
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" disabled={pending}>
        {pending ? "Removing…" : "Remove"}
      </Button>
      {state.error && <span className="ml-2 text-[11.5px] text-bad">{state.error}</span>}
    </form>
  );
}
