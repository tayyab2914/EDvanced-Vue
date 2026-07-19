"use client";

import { useActionState, useState } from "react";
import { savePolicyGroup, resetPolicyGroup } from "@/app/actions/policies";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms";
import type { PolicyGroup, PolicyGroupKey, Setting } from "@/lib/policies/registry";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

/**
 * The four threshold groups, generated from the registry rather than hand-built.
 *
 * Four hand-written forms would be four places to fix a typo, and — worse — four places
 * for a label to disagree with the rule that actually fires.
 */
export function PolicyForm({
  groups,
  values,
  districtId,
  canEdit,
}: {
  groups: PolicyGroup[];
  values: Record<PolicyGroupKey, Record<string, number | boolean>>;
  districtId: string;
  canEdit: boolean;
}) {
  const [tab, setTab] = useState<PolicyGroupKey>(groups[0].key);
  const group = groups.find((g) => g.key === tab)!;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {groups.map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => setTab(g.key)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors",
              g.key === tab
                ? "bg-navy text-white"
                : "border border-line text-muted hover:border-[#c8d3e4]",
            )}
          >
            {g.title}
          </button>
        ))}
      </div>

      {/* Keyed on the tab so switching resets the form's action state — otherwise a
          success message from Revenue would still be sitting there under Cash. */}
      <GroupForm
        key={group.key}
        group={group}
        values={values[group.key]}
        districtId={districtId}
        canEdit={canEdit}
      />
    </div>
  );
}

function GroupForm({
  group,
  values,
  districtId,
  canEdit,
}: {
  group: PolicyGroup;
  values: Record<string, number | boolean>;
  districtId: string;
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    savePolicyGroup,
    EMPTY_FORM_STATE,
  );
  const [resetState, resetAction, resetting] = useActionState<FormState, FormData>(
    resetPolicyGroup,
    EMPTY_FORM_STATE,
  );

  // Settings carry their own sub-section label; group them in registry order so the form's
  // headings (CURRENT PERFORMANCE, IMPORT VALIDATION, …) come straight from the registry
  // rather than being maintained a second time here. Hidden settings never render but still
  // ride along as hidden inputs, so a save doesn't drop a value the engine still reads.
  const hidden = group.settings.filter((s) => s.hidden);
  const sections: { name: string; settings: Setting[] }[] = [];
  for (const s of group.settings) {
    if (s.hidden) continue;
    const name = s.section ?? "";
    const existing = sections.find((x) => x.name === name);
    if (existing) existing.settings.push(s);
    else sections.push({ name, settings: [s] });
  }

  const renderNumber = (s: Setting) => {
    const err = state.fieldErrors?.[s.key]?.[0];
    return (
      <div key={s.key} className="space-y-1.5">
        <label htmlFor={s.key} className="block text-[13px] font-medium text-ink-soft">
          {s.label}
        </label>
        <div className="relative">
          {s.type === "money" && (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-2">
              $
            </span>
          )}
          <Input
            id={s.key}
            name={s.key}
            type="number"
            step={s.type === "money" ? "1000" : s.type === "days" ? "1" : "0.1"}
            min={s.min}
            max={s.max}
            defaultValue={String(values[s.key] ?? s.default)}
            disabled={!canEdit}
            className={cn(s.type === "money" && "pl-6", s.type === "percent" && "pr-8")}
          />
          {s.type === "percent" && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-2">
              %
            </span>
          )}
          {s.type === "days" && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-2">
              days
            </span>
          )}
        </div>
        {err ? (
          <p className="text-xs text-bad">{err}</p>
        ) : (
          <p className="text-[11.5px] leading-relaxed text-muted-2">{s.help}</p>
        )}
      </div>
    );
  };

  const renderToggle = (s: Setting) => (
    <label key={s.key} className="flex cursor-pointer gap-3">
      <input
        type="checkbox"
        name={s.key}
        defaultChecked={Boolean(values[s.key] ?? s.default)}
        disabled={!canEdit}
        className="mt-0.5"
      />
      <span>
        <span className="block text-[13px] font-medium text-ink">{s.label}</span>
        <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted">{s.help}</span>
      </span>
    </label>
  );

  return (
    <Card>
      <div className="mb-4">
        <h2 className="text-[15px] font-semibold">{group.title}</h2>
        <p className="mt-0.5 text-[12.5px] text-muted-2">{group.description}</p>
      </div>

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
      {resetState.success && (
        <div className="mb-4">
          <Alert tone="info">{resetState.success}</Alert>
        </div>
      )}

      <form action={action}>
        <input type="hidden" name="group" value={group.key} />
        <input type="hidden" name="districtId" value={districtId} />

        <div className="space-y-6">
          {sections.map((sec, i) => {
            const nums = sec.settings.filter((s) => s.type !== "toggle");
            const secToggles = sec.settings.filter((s) => s.type === "toggle");
            return (
              <div key={sec.name || i} className={cn(i > 0 && "border-t border-line-soft pt-5")}>
                {sec.name && (
                  <h3 className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted-2">
                    {sec.name}
                  </h3>
                )}
                {nums.length > 0 && (
                  <div className="grid gap-4 sm:grid-cols-2">{nums.map(renderNumber)}</div>
                )}
                {secToggles.length > 0 && (
                  <div className={cn("space-y-2", nums.length > 0 && "mt-4")}>
                    {secToggles.map(renderToggle)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Kept in the policy and read by the engine, but not shown — round-tripped so a
            save preserves the stored value. */}
        {hidden.map((s) => (
          <input
            key={s.key}
            type="hidden"
            name={s.key}
            value={String(values[s.key] ?? s.default)}
          />
        ))}

        {canEdit && (
          <div className="mt-5 flex items-center gap-2 border-t border-line-soft pt-4">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save Policies"}
            </Button>
            <span className="text-[12px] text-muted-2">
              These take effect on the next upload and on every dashboard.
            </span>
          </div>
        )}
      </form>

      {canEdit && (
        <form action={resetAction} className="mt-2">
          <input type="hidden" name="group" value={group.key} />
          <input type="hidden" name="districtId" value={districtId} />
          <Button type="submit" variant="ghost" disabled={resetting}>
            {resetting ? "Resetting…" : "Reset to Recommended Values"}
          </Button>
        </form>
      )}
    </Card>
  );
}
