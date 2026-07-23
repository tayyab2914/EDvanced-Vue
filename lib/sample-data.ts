import { MONTH_NAMES, periodToMonth } from "@/lib/periods/fiscal";

/**
 * The sample data's file-naming convention, in one place.
 *
 * The generator writes these names and the loader reads them, and they used to hold two
 * separate hardcoded lists of two periods each. At twelve periods that duplication stops
 * being harmless: a file the generator writes and the loader never asks for is a period
 * missing from every trend chart, silently, with both scripts reporting success.
 *
 * It lives under lib/ rather than beside either script because a cross-import between two
 * `.mts` files fights the module resolver, and because `@/` resolves cleanly from both.
 *
 * The demo district runs a July fiscal year, which is the platform default.
 */
const SAMPLE_START_MONTH = 7;

/** "P1-July", "P2-August" … "P12-June". */
export function samplePeriodLabel(period: number): string {
  const month = periodToMonth(period, SAMPLE_START_MONTH);
  return `P${period}-${MONTH_NAMES[month - 1]}`;
}

export const SAMPLE_PERIODS = 12;

export const PERIOD_LABELS: string[] = Array.from({ length: SAMPLE_PERIODS }, (_, i) =>
  samplePeriodLabel(i + 1),
);

export const SAMPLE_FISCAL_YEAR = "2026-27";
