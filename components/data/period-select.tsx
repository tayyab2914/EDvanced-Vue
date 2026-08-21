"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/cn";

export interface PeriodOption {
  /** The `period` URL parameter — the ordinal within the fiscal year. */
  value: string;
  /** What the period is called on its own: "August (Period 2)", "Survey 1". */
  label: string;
}

export interface FiscalYearOption {
  /** "2026-27", as it is written everywhere else and as it travels in the URL. */
  fiscalYear: string;
  /**
   * Every committed period of that year, chronological. EMPTY for the annual datasets,
   * which carry no period at all — see `periodLabel` in lib/periods/fiscal.ts.
   */
  periods: PeriodOption[];
}

/**
 * The reporting-period picker on a dataset browse page: fiscal year, then period.
 *
 * WHY TWO DROPDOWNS AND NOT ONE. This was a single select of every committed version,
 * grouped by year — which is right for a district's first year and wrong by its fifth: a
 * monthly dataset commits twelve versions a year, so the list grows without bound and the
 * reader scrolls a menu to find a month they already know the name of. Split, neither
 * control grows: the period list is capped at the twelve months of a fiscal year by the
 * fiscal calendar itself, and the year list gains one entry a year.
 *
 * (Before that it was a row of pills capped at the twelve most recent versions — worse
 * than long, because a period past the cap could not be reached from this page at all.)
 *
 * ONE OPTION IS STILL A CHOICE, HERE. The single-select version collapsed to plain text
 * when a district had committed only one version, on the grounds that a menu offering
 * only what you are already looking at is a lie about what it does. That reasoning holds
 * for a control that will never grow and not for one that grows every month: a district
 * in its first August has one period and will have twelve, and hiding the picker until
 * then reads as "this screen cannot change period". So both selects render whenever the
 * dataset has the dimension at all.
 *
 * The exception is the annual datasets — Revenue Budget, Expenditure Budget, Opening Fund
 * Balance. Their period is "Full year" now and forever, so it is stated, not offered.
 *
 * A CLIENT COMPONENT THAT ONLY NAVIGATES. Like the rest of this page's state, the choice
 * lives in the URL — this writes `fy` / `period` and nothing else.
 */
export function PeriodSelect({
  dataset,
  years,
  fiscalYear,
  period,
}: {
  dataset: string;
  /** Newest year first — the order the page read them in, preserved. */
  years: FiscalYearOption[];
  /** The applied fiscal year. */
  fiscalYear: string;
  /** The applied period ordinal, or null on the annual datasets. */
  period: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const periods = years.find((y) => y.fiscalYear === fiscalYear)?.periods ?? [];

  // The search, sort and filters are deliberately NOT carried over: the filter options are
  // built from the version being browsed, so a fund that only appears in August would come
  // back as an empty screen in September rather than a fresh one.
  function go(fy: string, p: string | null) {
    router.push(`/data/${dataset}?fy=${fy}${p ? `&period=${p}` : ""}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label="Fiscal year">
        <select
          value={fiscalYear}
          disabled={pending}
          aria-label="Fiscal year"
          // No period: a year is not guaranteed to hold the month being left behind, and
          // the page defaults to the latest period the chosen year actually has.
          onChange={(e) => start(() => go(e.target.value, null))}
          className={FIELD}
        >
          {years.map((y) => (
            <option key={y.fiscalYear} value={y.fiscalYear}>
              FY {y.fiscalYear}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Reporting period">
        {periods.length > 0 ? (
          <select
            value={period ?? ""}
            disabled={pending}
            aria-label="Reporting period"
            onChange={(e) => start(() => go(fiscalYear, e.target.value))}
            className={FIELD}
          >
            {periods.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="py-1.5 text-[12.5px] text-ink">Full year</span>
        )}
      </Field>
    </div>
  );
}

/** The face of the filter row on the same page — components/data/server-table.tsx. */
const FIELD = cn(
  "max-w-full rounded-lg border border-line bg-white px-2 py-1.5 text-[12.5px] text-ink",
  "transition-opacity hover:border-[#c8d3e4] disabled:opacity-60",
);

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] uppercase tracking-wider text-muted-2">{label}</span>
      {children}
    </label>
  );
}
