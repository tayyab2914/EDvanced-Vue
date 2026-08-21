"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/cn";

export interface PeriodOption {
  /** `"<fy>"`, or `"<fy>:<period>"` for the monthly datasets — the URL's two parameters, joined. */
  value: string;
  /** What the period is called on its own: "August (Period 2)", "Full year". */
  label: string;
  /** The fiscal year this period sits under — the `<optgroup>` it is grouped into. */
  fiscalYear: string;
}

/**
 * The reporting-period picker on a dataset browse page.
 *
 * WHY A SELECT AND NOT THE PILL ROW IT REPLACES. The pills were fine for a district's
 * first year and wrong for its fifth: one per committed version, so a monthly dataset
 * grows twelve a year and the row wraps into a paragraph. The old code capped it at the
 * twelve most recent — which is worse than long, because a period past the cap could not
 * be reached from this page at all.
 *
 * A native `<select>` is the same control the filter row on this page already uses, so it
 * costs the reader nothing new to learn; it scrolls instead of wrapping however many years
 * pile up; and `<optgroup>` per fiscal year keeps "Period 2" of one year from reading like
 * "Period 2" of another.
 *
 * A CLIENT COMPONENT THAT ONLY NAVIGATES. Like the rest of this page's state, the choice
 * lives in the URL — this writes `fy` / `period` and nothing else.
 */
export function PeriodSelect({
  dataset,
  options,
  value,
}: {
  dataset: string;
  options: PeriodOption[];
  /** The applied option's `value`. */
  value: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  // Declaration order is already newest-first; grouping preserves it.
  const years: { fiscalYear: string; options: PeriodOption[] }[] = [];
  for (const o of options) {
    const last = years[years.length - 1];
    if (last?.fiscalYear === o.fiscalYear) last.options.push(o);
    else years.push({ fiscalYear: o.fiscalYear, options: [o] });
  }

  function go(next: string) {
    const [fy, period] = next.split(":");
    // The search, sort and filters are deliberately NOT carried over: the filter options
    // are built from the version being browsed, so a fund that only appears in August
    // would come back as an empty screen in September rather than a fresh one.
    router.push(`/data/${dataset}?fy=${fy}${period ? `&period=${period}` : ""}`);
  }

  return (
    <select
      value={value}
      disabled={pending}
      aria-label="Reporting period"
      onChange={(e) => start(() => go(e.target.value))}
      className={cn(
        "max-w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12.5px] text-ink",
        "transition-opacity hover:border-[#c8d3e4] disabled:opacity-60",
      )}
    >
      {years.map((y) => (
        <optgroup key={y.fiscalYear} label={`FY ${y.fiscalYear}`}>
          {y.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
