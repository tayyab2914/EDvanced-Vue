"use client";

import { useActionState } from "react";
import { setLabelMode } from "@/app/actions/display";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms";
import { LABEL_MODES, type LabelMode } from "@/lib/text";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";

/**
 * "How dimension fields are shown" — the client's Codes Only / Names Only / Codes + Names.
 *
 * THREE SUBMIT BUTTONS, NOT A SELECT AND A SAVE. Each option is a button carrying its own
 * value, so choosing one applies it: there is no state to get out of sync and nothing to
 * forget to press. It also means the control works with JavaScript off, which is not
 * incidental — the whole preference is a cookie set by a form post, and the page it changes
 * is server-rendered.
 *
 * The example beside each option is the point of the card. "Codes + Names" describes a
 * setting; `1000 — General Fund` shows the reader what their tables will look like, which
 * is the only question they are actually asking.
 */
export function DisplayForm({ current }: { current: LabelMode }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    setLabelMode,
    EMPTY_FORM_STATE,
  );

  return (
    <Card>
      <h2 className="text-[15px] font-semibold">Dimension fields</h2>
      <p className="mt-0.5 mb-4 text-[12.5px] text-muted-2">
        How funds, functions, objects, cost centers and projects are labelled on your
        dashboards, tables and filters. This is yours alone — it changes nothing anyone else
        sees, and nothing in an export.
      </p>

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

      <form action={action} className="grid gap-2 sm:grid-cols-3">
        {LABEL_MODES.map((m) => {
          const active = m.value === current;
          return (
            <button
              key={m.value}
              type="submit"
              name="mode"
              value={m.value}
              disabled={pending}
              aria-pressed={active}
              className={cn(
                "rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-60",
                active
                  ? "border-brand bg-[#f2f7ff] text-brand"
                  : "border-line text-ink-muted hover:border-[#c8d3e4]",
              )}
            >
              <span className="block text-[12.5px] font-medium">{m.label}</span>
              <span
                className={cn(
                  "mt-0.5 block truncate text-[11.5px]",
                  active ? "text-brand/80" : "text-muted-2",
                )}
              >
                {m.hint}
              </span>
            </button>
          );
        })}
      </form>
    </Card>
  );
}
