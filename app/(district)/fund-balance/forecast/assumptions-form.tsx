"use client";

import { useActionState, useState } from "react";
import { saveForecastAssumptions, saveComponentAssumptions } from "@/app/actions/forecast";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
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
            label="Annual Revenue Growth"
            defaultValue={revenueGrowth}
            errors={growthState.fieldErrors?.revenueGrowth}
            hint="Applied annually to recurring revenue sources only."
            canEdit={canEdit}
          />
          <Amount
            name="recurringRevenueAdjustment"
            label="Recurring Revenue Adjustments"
            defaultValue={recurringRevenueAdjustment}
            errors={growthState.fieldErrors?.recurringRevenueAdjustment}
            hint="Permanent annual adjustments, such as a millage change or recurring grant. Applied in each projected year."
            canEdit={canEdit}
          />
          <Amount
            name="oneTimeRevenueAdjustment"
            label="One-Time Revenue Adjustments"
            defaultValue={oneTimeRevenueAdjustment}
            errors={growthState.fieldErrors?.oneTimeRevenueAdjustment}
            hint="Nonrecurring revenue applied to the first projected year only and excluded from future-year growth."
            canEdit={canEdit}
          />
        </Panel>

        <Panel letter="B" title="Expenditure assumptions" tone="blue">
          <Rate
            name="expenditureGrowth"
            label="Annual Expenditure Growth"
            defaultValue={expenditureGrowth}
            errors={growthState.fieldErrors?.expenditureGrowth}
            hint="Applied annually to the recurring operating base shown below."
            canEdit={canEdit}
          />

          <div className="rounded-lg border border-line-soft bg-panel px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-brand">
              Recurring operating base
            </p>
            <dl className="mt-2 flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[11px] text-[#060606]">Projected FY {fiscalYear} Expenditures</dt>
                <dd className="text-[12px] font-semibold tabular-nums text-[#060606]">
                  {totalBudgetedDisplay}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[11px] text-[#060606]">Less: One-Time & Carryforward Expenditures</dt>
                <dd className="text-[12px] font-semibold tabular-nums text-action">
                  {oneTimeDisplay}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-line pt-1.5">
                <dt className="text-[11px] font-semibold text-[#060606]">
                  Recurring Operating Base
                </dt>
                <dd className="text-[13px] font-semibold tabular-nums text-[#060606]">
                  {recurringBaseDisplay}
                </dd>
              </div>
            </dl>
          </div>

          <Amount
            name="oneTimeExpenditure"
            label="One-Time & Carryforward Expenditures"
            defaultValue={oneTimeExpenditure}
            errors={growthState.fieldErrors?.oneTimeExpenditure}
            hint="Excluded from the recurring base so annual growth applies only to ongoing operations."
            canEdit={canEdit}
          />
          <Amount
            name="recurringExpenditureAdjustment"
            label="Recurring Expenditure Adjustments"
            defaultValue={recurringExpenditureAdjustment}
            errors={growthState.fieldErrors?.recurringExpenditureAdjustment}
            hint="Permanent annual costs not included in the current operating base."
            canEdit={canEdit}
          />

          {canEdit && (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button type="submit" disabled={growthPending}>
                {growthPending ? "Saving…" : "Save Revenue & Expenditure Assumptions"}
              </Button>
              {growthState.success && (
                <span className="text-[12px] text-strong">{growthState.success}</span>
              )}
              {growthState.error && (
                <span className="text-[12px] text-action">{growthState.error}</span>
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
          subtitle={`How each ${fundName} balance component is projected`}
          tone="purple"
          info={<MethodHelp />}
        >
          <div className="-mx-1 overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  {["Component", "Current balance", "Projection method", ""].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="px-2 pb-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.05em] text-[#060606]"
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

          <p className="rounded-lg bg-panel px-3 py-2.5 text-[11px] leading-relaxed text-[#060606]">
            Projected component balances are subtracted from total projected fund balance to
            calculate projected unassigned fund balance.
          </p>

          {canEdit && (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={componentPending}>
                {componentPending ? "Saving…" : "Save Component Assumptions"}
              </Button>
              {componentState.success && (
                <span className="text-[12px] text-strong">{componentState.success}</span>
              )}
              {componentState.error && (
                <span className="text-[12px] text-action">{componentState.error}</span>
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
      <td className="px-2 py-2 text-[12px] font-medium text-[#060606]">
        {FUND_BALANCE_COMPONENT_LABELS[row.component]}
      </td>
      <td className="px-2 py-2 text-[12px] tabular-nums text-[#060606]">{row.currentDisplay}</td>
      <td className="px-2 py-2">
        {canEdit ? (
          <select
            name={`method_${row.component}`}
            value={method}
            onChange={(e) => setMethod(e.target.value as ForecastMethod)}
            aria-label={`${FUND_BALANCE_COMPONENT_LABELS[row.component]} projection method`}
            className="h-8 w-full min-w-[150px] rounded-lg border border-line bg-white px-2 text-[12px] text-[#060606] outline-none transition-colors focus:border-brand"
          >
            {FORECAST_METHOD_VALUES.map((m) => (
              <option key={m} value={m}>
                {FORECAST_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-[12px] text-[#060606]">{FORECAST_METHOD_LABELS[method]}</span>
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
              className="h-8 w-full rounded-lg border border-line bg-white pl-2 pr-6 text-[12px] tabular-nums text-[#060606] outline-none transition-colors focus:border-brand disabled:bg-panel"
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-[#060606]">
              %
            </span>
          </div>
        ) : null}
        {errors?.map((e) => (
          <span key={e} className="mt-1 block text-[11px] text-action">
            {e}
          </span>
        ))}
      </td>
    </tr>
  );
}

/**
 * The projection methods, explained — one line per method, in the order they appear in the
 * dropdown. This used to sit in the table's fourth column, one copy per row, which spent a
 * fifth of panel C's width restating four fixed sentences; the reader who needs them needs
 * them once, while choosing, and never again. So they live behind the `?` in the header,
 * where the whole set reads at once and the row a method is chosen on stays a row.
 *
 * Hover OR keyboard focus opens it — a tooltip that only answers a mouse is a tooltip a
 * keyboard reader cannot get to, and this is the only place the methods are explained.
 */
function MethodHelp() {
  return (
    <span className="relative flex-none">
      <button
        type="button"
        aria-label="What each projection method does"
        className="peer flex h-4.5 w-4.5 items-center justify-center rounded-full text-[#5b4bb5] opacity-70 outline-none transition-opacity hover:opacity-100 focus-visible:opacity-100"
      >
        <Icon name="help" size={15} aria-hidden="true" />
      </button>
      <span
        role="tooltip"
        // `pointer-events-none` so the panel underneath stays clickable while it is hidden —
        // and while it is shown, since there is nothing in here to click.
        className="pointer-events-none absolute right-0 top-5.5 z-20 w-65.5 rounded-lg border border-line bg-white p-2.5 text-left opacity-0 shadow-[0_10px_24px_rgba(9,20,38,0.14)] transition-opacity peer-hover:opacity-100 peer-focus-visible:opacity-100"
      >
        <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#5b4bb5]">
          Projection methods
        </span>
        <span className="mt-1.5 flex flex-col gap-1.5">
          {FORECAST_METHOD_VALUES.map((m) => (
            <span key={m} className="block text-[11px] leading-snug text-[#060606]">
              <span className="font-semibold">{FORECAST_METHOD_LABELS[m]}</span> —{" "}
              {FORECAST_METHOD_HELP[m]}
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}

function Panel({
  letter,
  title,
  subtitle,
  tone,
  info,
  children,
}: {
  letter: string;
  title: string;
  subtitle?: string;
  tone: "green" | "blue" | "purple";
  /** Sits at the top-right of the header — the `?` on panel C, nothing on A and B. */
  info?: React.ReactNode;
  children: React.ReactNode;
}) {
  const TONE = {
    green: "border-strong-bg text-strong",
    blue: "border-[#d5e3fb] text-brand",
    purple: "border-[#ded6f5] text-[#5b4bb5]",
  } as const;

  return (
    // `min-w-0`: these panels are grid items, and a grid item will not shrink below its own
    // min-content unless told it may. One of the three (the component table) has a wider
    // min-content than a phone, and because a one-column grid gives every item the same
    // track, that ONE panel widened all three past the card and the hints were clipped.
    <section
      className={cn("flex min-w-0 flex-col gap-3 rounded-xl border bg-white p-3.5", TONE[tone])}
    >
      <header>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.055em]">
            {letter}. {title}
          </h3>
          {info}
        </div>
        {subtitle && <p className="mt-0.5 text-[11px] text-[#060606]">{subtitle}</p>}
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
          className="h-9 w-full rounded-lg border border-line bg-white pl-3 pr-7 text-[13px] tabular-nums text-[#060606] outline-none transition-colors focus:border-brand disabled:bg-panel"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-[#060606]">
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
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-[#060606]">
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
          className="h-9 w-full rounded-lg border border-line bg-white pl-7 pr-3 text-[13px] tabular-nums text-[#060606] outline-none transition-colors focus:border-brand disabled:bg-panel"
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
      <label htmlFor={name} className="block text-[11px] font-medium text-[#060606]">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      <p id={`${name}-hint`} className="mt-1 text-[11px] leading-snug text-[#060606]">
        {hint}
      </p>
      {errors?.map((e) => (
        <p key={e} className="mt-1 text-[11px] text-action">
          {e}
        </p>
      ))}
    </div>
  );
}
