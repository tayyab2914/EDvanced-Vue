import {
  DATASETS,
  DATASET_SLUGS,
  datasetByKind,
  datasetBySlug,
  datasetsByRhythm,
} from "@/lib/datasets/kinds";
import { DatasetKind, PeriodType } from "@/lib/enums";
import {
  fiscalYearFor,
  formatFiscalYear,
  isValidPeriod,
  monthToPeriod,
  parseFiscalYear,
  periodCalendarYear,
  periodCount,
  periodLabel,
  periodOptions,
  periodToMonth,
} from "@/lib/periods/fiscal";

/** Checks the fiscal-calendar rules in lib/periods/fiscal.ts (every M2 module keys off them). */
let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

const JULY = 7;
const OCT = 10;

// ---- Fiscal year formatting / parsing ----
console.log("\nFiscal year");
assert(formatFiscalYear(2026) === "2026-27", 'formats 2026 as "2026-27"');
assert(formatFiscalYear(2099) === "2099-00", 'crosses the century: 2099 -> "2099-00"');
assert(formatFiscalYear(2009) === "2009-10", "pads the short year: 2009-10");

assert(parseFiscalYear("2026-27")?.startYear === 2026, "parses a valid year");
assert(parseFiscalYear("2026-27")?.endYear === 2027, "derives the end year");
assert(parseFiscalYear("  2026-27  ")?.startYear === 2026, "tolerates surrounding space");
assert(parseFiscalYear("2099-00")?.endYear === 2100, "parses across the century");

// The strictness is the point — these are what stop data being filed against a year
// nobody means.
assert(parseFiscalYear("2026-28") === null, "rejects non-consecutive years (2026-28)");
assert(parseFiscalYear("2026-2027") === null, "rejects YYYY-YYYY");
assert(parseFiscalYear("26-27") === null, "rejects YY-YY");
assert(parseFiscalYear("2026") === null, "rejects a bare year");
assert(parseFiscalYear("") === null, "rejects empty");
assert(parseFiscalYear("FY2026-27") === null, 'rejects an "FY" prefix');

// ---- fiscalYearFor, incl. a non-July district ----
console.log("\nWhich fiscal year a date falls in");
assert(
  fiscalYearFor(new Date(2026, 7, 15), JULY) === "2026-27",
  "July district: 15 Aug 2026 -> 2026-27",
);
assert(
  fiscalYearFor(new Date(2026, 5, 15), JULY) === "2025-26",
  "July district: 15 Jun 2026 is still 2025-26",
);
assert(
  fiscalYearFor(new Date(2026, 6, 1), JULY) === "2026-27",
  "July district: 1 Jul 2026 is the first day of 2026-27",
);
// fiscalYearStartMonth is per-district and must never be assumed to be July.
assert(
  fiscalYearFor(new Date(2026, 8, 15), OCT) === "2025-26",
  "October district: 15 Sep 2026 is still 2025-26",
);
assert(
  fiscalYearFor(new Date(2026, 9, 1), OCT) === "2026-27",
  "October district: 1 Oct 2026 starts 2026-27",
);

// ---- period <-> month ----
console.log("\nPeriod <-> month");
assert(periodToMonth(1, JULY) === 7, "July district: period 1 is July");
assert(periodToMonth(2, JULY) === 8, "July district: period 2 is August");
assert(periodToMonth(7, JULY) === 1, "July district: period 7 wraps to January");
assert(periodToMonth(12, JULY) === 6, "July district: period 12 is June");
assert(periodToMonth(1, OCT) === 10, "October district: period 1 is October");
assert(periodToMonth(4, OCT) === 1, "October district: period 4 wraps to January");

assert(monthToPeriod(7, JULY) === 1, "July district: July is period 1");
assert(monthToPeriod(8, JULY) === 2, "July district: August is period 2");
assert(monthToPeriod(6, JULY) === 12, "July district: June is period 12");
assert(monthToPeriod(10, OCT) === 1, "October district: October is period 1");

// Round-trip every period for both calendars — the cheapest way to catch an off-by-one.
let roundTripOk = true;
for (const start of [JULY, OCT, 1, 12]) {
  for (let p = 1; p <= 12; p++) {
    if (monthToPeriod(periodToMonth(p, start), start) !== p) roundTripOk = false;
  }
}
assert(roundTripOk, "period -> month -> period round-trips for every start month");

// ---- which calendar year a period sits in ----
console.log("\nCalendar year of a period");
const fy = parseFiscalYear("2026-27")!;
assert(
  periodCalendarYear(1, JULY, fy) === 2026,
  "July district: period 1 (Jul) is in 2026",
);
assert(
  periodCalendarYear(7, JULY, fy) === 2027,
  "July district: period 7 (Jan) is in 2027",
);
assert(
  periodCalendarYear(12, JULY, fy) === 2027,
  "July district: period 12 (Jun) is in 2027",
);

// ---- labels ----
console.log("\nLabels");
assert(
  periodLabel(PeriodType.MONTHLY, 2, JULY) === "August (Period 2)",
  'monthly reads "August (Period 2)" — mirrors the client\'s upload screen',
);
assert(
  periodLabel(PeriodType.MONTHLY, 2, OCT) === "November (Period 2)",
  "monthly label respects a non-July calendar",
);
assert(periodLabel(PeriodType.SURVEY, 1) === "Survey 1", 'survey reads "Survey 1"');
assert(
  periodLabel(PeriodType.ANNUAL, null) === "Full year",
  'annual reads "Full year"',
);
assert(
  periodOptions(PeriodType.MONTHLY, JULY).length === 12,
  "monthly offers 12 options",
);
assert(periodOptions(PeriodType.SURVEY).length === 2, "survey offers 2 options");
assert(periodOptions(PeriodType.ANNUAL).length === 0, "annual offers none");
assert(
  periodOptions(PeriodType.MONTHLY, JULY)[0]?.label === "July (Period 1)",
  "first monthly option is the district's own first month",
);

// ---- period validity ----
console.log("\nPeriod validity");
assert(periodCount(PeriodType.MONTHLY) === 12, "monthly has 12 periods");
assert(periodCount(PeriodType.SURVEY) === 2, "survey has 2 periods");
assert(periodCount(PeriodType.ANNUAL) === 0, "annual has none");

assert(isValidPeriod(PeriodType.MONTHLY, 1), "monthly period 1 is valid");
assert(isValidPeriod(PeriodType.MONTHLY, 12), "monthly period 12 is valid");
assert(!isValidPeriod(PeriodType.MONTHLY, 0), "monthly period 0 is not");
assert(!isValidPeriod(PeriodType.MONTHLY, 13), "monthly period 13 is not");
assert(!isValidPeriod(PeriodType.MONTHLY, 1.5), "a fractional period is not");
assert(!isValidPeriod(PeriodType.MONTHLY, null), "monthly requires a period");
assert(isValidPeriod(PeriodType.SURVEY, 2), "survey period 2 is valid");
assert(!isValidPeriod(PeriodType.SURVEY, 3), "survey period 3 is not");

// This pair is load-bearing, not pedantry: `period` is NULL for annual rows, and the
// DatasetVersion uniqueness indexes COALESCE it to -1 to survive Postgres treating
// NULLs as distinct. An annual row carrying a period would be keyed differently from
// its siblings and escape both invariants.
assert(isValidPeriod(PeriodType.ANNUAL, null), "annual accepts no period");
assert(!isValidPeriod(PeriodType.ANNUAL, 1), "annual REJECTS a period");

// ---- dataset registry coverage ----
console.log("\nDataset kinds");
assert(DATASET_SLUGS.length === 6, `six importers registered (got ${DATASET_SLUGS.length})`);

const enumKinds = Object.values(DatasetKind);
assert(
  enumKinds.length === 6,
  `DatasetKind enum has six members (got ${enumKinds.length})`,
);
// Every enum member must have a meta entry, or datasetByKind throws at runtime.
let coverageOk = true;
for (const k of enumKinds) {
  try {
    datasetByKind(k);
  } catch {
    coverageOk = false;
  }
}
assert(coverageOk, "every DatasetKind has a registered meta entry");

assert(datasetBySlug("revenue-detail")?.kind === DatasetKind.REVENUE_DETAIL, "slug -> kind");
assert(datasetBySlug("nope") === null, "an unknown slug returns null, it does not throw");

const rhythm = datasetsByRhythm();
assert(rhythm.annual.length === 3, "three annual importers");
assert(rhythm.monthly.length === 3, "three monthly importers");
assert(
  rhythm.annual.every((d) => d.periodType === PeriodType.ANNUAL),
  "annual group is all ANNUAL",
);

// Budget tagging is what makes Adopted and Current reportable side by side.
assert(
  DATASETS["revenue-budget"].budgetType === "ADOPTED",
  "the annual budget file is tagged ADOPTED",
);
assert(
  DATASETS["revenue-detail"].budgetType === "CURRENT",
  "the monthly detail Budget column is tagged CURRENT",
);
assert(
  DATASETS["cash-position"].budgetType === undefined,
  "cash position carries no budget",
);
assert(
  DATASETS["opening-fund-balance"].budgetType === undefined,
  "opening fund balance carries no budget",
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
