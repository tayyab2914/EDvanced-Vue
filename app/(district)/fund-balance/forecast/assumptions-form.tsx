"use client";

import { useActionState, useState } from "react";
import { saveForecastAssumptions, saveComponentAssumptions } from "@/app/actions/forecast";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  FUND_BALANCE_COMPONENT_VALUES,
  FUND_BALANCE_COMPONENT_LABELS,
  FORECAST_METHOD_VALUES,
  FORECAST_METHOD_LABELS,
  FORECAST_METHOD_HELP,
  type FundBalanceComponent,
  type ForecastMethod,
} from "@/lib/enums";

/**
 * §6.2 card 1 — Forecast Assumptions, in the client's three panels:
 *
 *   A. Revenue assumptions           — annual growth, plus recurring and one-time adjustments
 *   B. Expenditure assumptions       — annual growth, and the recurring operating base
 *   C. Fund balance component assumptions — a forecast METHOD per component
 *
 * The brief behind panel C is the important one: "districts have different board policies
 * and budgeting practices, so assumptions such as one-time expenditures, recurring
 * expenditures, committed reserves, restricted balances, and other fund balance components
 * should be configurable rather than hard-coded". So none of these are constants in the
 * engine — each is a stored rule the district owns, and the projection reads them.
 *
 * TWO FORMS, NOT ONE. Panels A and B write ForecastAssumption rows keyed by fiscal year;
 * panel C writes FundBalanceComponentAssumption rows keyed by fiscal year AND fund. One
 * submit button over both would either save the components to the wrong fund when the fund
 * selector moved, or force a fund onto the district-level growth rates, and neither is a
 * thing anyone should have to reason about while typing a percentage.
 *
 * Read-only for anyone without `edit_forecast_assumptions`: a Viewer should still see the
 * assumptions behind the projection they are being shown, because a projection whose inputs
 * are hidden is a number nobody can argue with.
 */

export interface ComponentRow {
  component: FundBalanceComponent;
  method: ForecastMethod;
  annualIncreasePercent: number | null;
  /** Pre-formatted — every figure upstream is a Prisma.Decimal. */
  currentDisplay: string;
}

export function AssumptionsForm({
  fiscalYear,
  fundId,
  fundName,
  revenueGrowth,
  expenditureGrowth,
  recurringRevenueAdjustment,
  oneTimeRevenueAdjustment,
  recurringExpenditureAdjustment,
  oneTimeExpenditure,
  totalBudgetedDisplay,
  oneTimeDisplay,
  recurringBaseDisplay,
  components,
  canEdit,
}: {
  fiscalYear: string;
  fundId: string;
  fundName: string;
  revenueGrowth: number | null;
  expenditureGrowth: number | null;
  recurringRevenueAdjustment: number | null;
  oneTimeRevenueAdjustment: number | null;
  recurringExpenditureAdjustment: number | null;
  oneTimeExpenditure: number | null;
  totalBudgetedDisplay: string;
  oneTimeDisplay: string;
  recurringBaseDisplay: string;
  components: ComponentRow[];
  canEdit: boolean;
}) {
  const [growthState, growthAction, growthPending] = useActionState(
    saveForecastAssumptions,
    EMPTY_FORM_STATE,
  );
  const [componentState, componentAction, componentPending] = useActionState(
    saveComponentAssumptions,
    EMPTY_FORM_STATE,
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)_minmax(0,1.35fr)]">
      {/* ================= A + B: the growth rates ================= */}
      <form action={growthAction} className="contents">
        <input type="hidden" name="fiscalYear" value={fiscalYear} />

        <Panel letter="A" title="Revenue assumptions" tone="green">
          <Rate
            name="revenueGrowth"
            label="Annual revenue growth"
            defaultValue={revenueGrowth}
            errors={growthState.fieldErrors?.revenueGrowth}
            hint="Example: 2.00. Applied to recurring revenue sources only."
            canEdit={canEdit}
          />
          <Amount
            name="recurringRevenueAdjustment"
            label="Recurring revenue adjustments (annual)"
            defaultValue={recurringRevenueAdjustment}
            errors={growthState.fieldErrors?.recurringRevenueAdjustment}
            hint="A permanent change — a millage adjustment, a recurring grant. Applied every projected year."
            canEdit={canEdit}
          />
          <Amount
            name="oneTimeRevenueAdjustment"
            label="One-time revenue adjustments"
            defaultValue={oneTimeRevenueAdjustment}
            errors={growthState.fieldErrors?.oneTimeRevenueAdjustment}
            hint="Non-recurring money. Applied to the first projected year only, so it never compounds."
            canEdit={canEdit}
          />
        </Panel>

        <Panel letter="B" title="Expenditure assumptions" tone="blue">
          <Rate
            name="expenditureGrowth"
            label="Annual expenditure growth"
            defaultValue={expenditureGrowth}
            errors={growthState.fieldErrors?.expenditureGrowth}
            hint="Example: 3.00. Applied to the recurring operating base below."
            canEdit={canEdit}
          />

          <div className="rounded-lg border border-line-soft bg-panel px-3 py-2.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-brand">
              Recurring operating base (excludes one-time)
            </p>
            <dl className="mt-2 flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[11.5px] text-muted">Total FY {fiscalYear} projected spending</dt>
                <dd className="text-[12px] font-semibold tabular-nums text-ink">
                  {totalBudgetedDisplay}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[11.5px] text-muted">Less: one-time / carryforward</dt>
                <dd className="text-[12px] font-semibold tabular-nums text-action">
                  {oneTimeDisplay}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-line pt-1.5">
                <dt className="text-[11.5px] font-semibold text-ink-soft">
                  Recurring operating base
                </dt>
                <dd className="text-[13px] font-semibold tabular-nums text-ink">
                  {recurringBaseDisplay}
                </dd>
              </div>
            </dl>
          </div>

          <Amount
            name="oneTimeExpenditure"
            label="One-time and carryforward expenditures"
            defaultValue={oneTimeExpenditure}
            errors={growthState.fieldErrors?.oneTimeExpenditure}
            hint="Excluded from the base above so growth compounds on operations, not on a one-off capital year."
            canEdit={canEdit}
          />
          <Amount
            name="recurringExpenditureAdjustment"
            label="Recurring expenditure adjustments (annual)"
            defaultValue={recurringExpenditureAdjustment}
            errors={growthState.fieldErrors?.recurringExpenditureAdjustment}
            hint="A permanent cost the current run-rate does not contain yet."
            canEdit={canEdit}
          />

          {canEdit && (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button type="submit" disabled={growthPending}>
                {growthPending ? "Saving…" : "Save revenue & expenditure"}
              </Button>
              {growthState.success && (
                <span className="text-[12.5px] text-strong">{growthState.success}</span>
              )}
              {growthState.error && (
                <span className="text-[12.5px] text-action">{growthState.error}</span>
              )}
            </div>
          )}
        </Panel>
      </form>

      {/* ================= C: the component rules ================= */}
      <form action={componentAction} className="contents">
        <input type="hidden" name="fiscalYear" value={fiscalYear} />
        <input type="hidden" name="fundId" value={fundId} />

        <Panel
          letter="C"
          title="Fund balance component assumptions"
          subtitle={`How each component of ${fundName} is forecast`}
          tone="purple"
        >
          <div className="-mx-1 overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  {["Component", `Current balance`, "Forecast method", ""].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="px-2 pb-1.5 text-left text-[9.5px] font-semibold uppercase tracking-[0.05em] text-muted-2"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {components.map((row) => (
                  <ComponentRowFields
                    key={row.component}
                    row={row}
                    canEdit={canEdit}
                    errors={componentState.fieldErrors?.[`rate_${row.component}`]}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <p className="rounded-lg bg-panel px-3 py-2.5 text-[11.5px] leading-relaxed text-muted">
            These amounts are subtracted from the projected total fund balance to calculate
            the projected unassigned fund balance.
          </p>

          {canEdit && (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={componentPending}>
                {componentPending ? "Saving…" : "Save component methods"}
              </Button>
              {componentState.success && (
                <span className="text-[12.5px] text-strong">{componentState.success}</span>
              )}
              {componentState.error && (
                <span className="text-[12.5px] text-action">{componentState.error}</span>
              )}
            </div>
          )}
        </Panel>
      </form>
    </div>
  );
}

/** One component's row: name, today's balance, the method, and the rate it may need. */
function ComponentRowFields({
  row,
  canEdit,
  errors,
}: {
  row: ComponentRow;
  canEdit: boolean;
  errors?: string[];
}) {
  const [method, setMethod] = useState<ForecastMethod>(row.method);

  return (
    <tr className="border-t border-line-soft align-middle">
      <td className="px-2 py-2 text-[12px] font-medium text-ink-muted">
        {FUND_BALANCE_COMPONENT_LABELS[row.component]}
      </td>
      <td className="px-2 py-2 text-[12px] tabular-nums text-ink">{row.currentDisplay}</td>
      <td className="px-2 py-2">
        {canEdit ? (
          <select
            name={`method_${row.component}`}
            value={method}
            onChange={(e) => setMethod(e.target.value as ForecastMethod)}
            aria-label={`${FUND_BALANCE_COMPONENT_LABELS[row.component]} forecast method`}
            className="h-8 w-full min-w-[150px] rounded-lg border border-line bg-white px-2 text-[12px] text-ink outline-none transition-colors focus:border-brand"
          >
            {FORECAST_METHOD_VALUES.map((m) => (
              <option key={m} value={m}>
                {FORECAST_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-[12px] text-ink-muted">{FORECAST_METHOD_LABELS[method]}</span>
        )}
      </td>
      <td className="px-2 py-2">
        {method === "INCREASE_BY_PERCENT" ? (
          <div className="relative w-[92px]">
            <input
              name={`rate_${row.component}`}
              type="number"
              step="0.01"
              min={-100}
              max={100}
              disabled={!canEdit}
              defaultValue={row.annualIncreasePercent ?? ""}
              placeholder="0.00"
              aria-label={`${FUND_BALANCE_COMPONENT_LABELS[row.component]} annual increase`}
              className="h-8 w-full rounded-lg border border-line bg-white pl-2 pr-6 text-[12px] tabular-nums text-ink outline-none transition-colors focus:border-brand disabled:bg-panel"
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-2">
              %
            </span>
          </div>
        ) : (
          <span
            className="block max-w-[190px] text-[10.5px] leading-snug text-muted-2"
            title={FORECAST_METHOD_HELP[method]}
          >
            {FORECAST_METHOD_HELP[method]}
          </span>
        )}
        {errors?.map((e) => (
          <span key={e} className="mt-1 block text-[11px] text-action">
            {e}
          </span>
        ))}
      </td>
    </tr>
  );
}

function Panel({
  letter,
  title,
  subtitle,
  tone,
  children,
}: {
  letter: string;
  title: string;
  subtitle?: string;
  tone: "green" | "blue" | "purple";
  children: React.ReactNode;
}) {
  const TONE = {
    green: "border-strong-bg text-strong",
    blue: "border-[#d5e3fb] text-brand",
    purple: "border-[#ded6f5] text-[#5b4bb5]",
  } as const;

  return (
    <section className={cn("flex flex-col gap-3 rounded-xl border bg-white p-3.5", TONE[tone])}>
      <header>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.055em]">
          {letter}. {title}
        </h3>
        {subtitle && <p className="mt-0.5 text-[11.5px] text-muted-2">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

function Rate({
  name,
  label,
  defaultValue,
  errors,
  hint,
  canEdit,
}: {
  name: string;
  label: string;
  defaultValue: number | null;
  errors?: string[];
  hint: string;
  canEdit: boolean;
}) {
  return (
    <Field name={name} label={label} hint={hint} errors={errors}>
      <div className="relative">
        <input
          id={name}
          name={name}
          type="number"
          step="0.01"
          min={-100}
          max={100}
          disabled={!canEdit}
          defaultValue={defaultValue ?? ""}
          placeholder="0.00"
          aria-describedby={`${name}-hint`}
          className="h-9 w-full rounded-lg border border-line bg-white pl-3 pr-7 text-[13px] tabular-nums text-ink outline-none transition-colors focus:border-brand disabled:bg-panel"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px] text-muted-2">
          %
        </span>
      </div>
    </Field>
  );
}

function Amount({
  name,
  label,
  defaultValue,
  errors,
  hint,
  canEdit,
}: {
  name: string;
  label: string;
  defaultValue: number | null;
  errors?: string[];
  hint: string;
  canEdit: boolean;
}) {
  return (
    <Field name={name} label={label} hint={hint} errors={errors}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12.5px] text-muted-2">
          $
        </span>
        <input
          id={name}
          name={name}
          type="text"
          inputMode="decimal"
          disabled={!canEdit}
          defaultValue={defaultValue ?? ""}
          placeholder="0.00"
          aria-describedby={`${name}-hint`}
          className="h-9 w-full rounded-lg border border-line bg-white pl-7 pr-3 text-[13px] tabular-nums text-ink outline-none transition-colors focus:border-brand disabled:bg-panel"
        />
      </div>
    </Field>
  );
}

function Field({
  name,
  label,
  hint,
  errors,
  children,
}: {
  name: string;
  label: string;
  hint: string;
  errors?: string[];
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-[11.5px] font-medium text-ink-soft">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      <p id={`${name}-hint`} className="mt-1 text-[10.5px] leading-snug text-muted-2">
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
