// The six importers, and how each is named in the URL, the upload dropdown and the
// audit log. Pure and client-safe — the dataset registry (M2.3) layers field
// definitions on top of this; nothing here knows about columns.
//
// Uploads are ONE dataset per file, never a combined workbook. The client's workbook
// showed a coarser five-item dropdown ("Budget Summary", "Financial Activity Summary /
// Fund Balance"), but its own field tables define these six shapes — and a dropdown
// entry that maps to two different templates makes "download this type's blank
// template" incoherent. So each importer is named in full.

import { DatasetKind, PeriodType, BudgetType } from "@/lib/enums";

/** URL-safe slug for a dataset. Used in routes: /data/[dataset]. */
export type DatasetSlug =
  | "revenue-budget"
  | "expenditure-budget"
  | "opening-fund-balance"
  | "revenue-detail"
  | "expenditure-detail"
  | "cash-position";

export interface DatasetMeta {
  kind: DatasetKind;
  slug: DatasetSlug;
  /** Name shown in the dropdown, the report and the version list. */
  label: string;
  /** One line explaining what the file holds, shown under the dropdown. */
  description: string;
  periodType: PeriodType;
  /** Set only for budget-bearing imports — decides how amounts are tagged on ingest. */
  budgetType?: BudgetType;
}

/**
 * Declaration order is UI order: annual first (a district sets its year up once), then
 * monthly (what they do every reporting period).
 */
export const DATASETS: Record<DatasetSlug, DatasetMeta> = {
  "revenue-budget": {
    kind: DatasetKind.REVENUE_BUDGET,
    slug: "revenue-budget",
    label: "Revenue Budget",
    description: "What the district plans to collect, by fund and revenue source.",
    periodType: PeriodType.ANNUAL,
    budgetType: BudgetType.ADOPTED,
  },
  "expenditure-budget": {
    kind: DatasetKind.EXPENDITURE_BUDGET,
    slug: "expenditure-budget",
    label: "Expenditure Budget",
    description: "What the district plans to spend, by fund, function and object.",
    periodType: PeriodType.ANNUAL,
    budgetType: BudgetType.ADOPTED,
  },
  "opening-fund-balance": {
    kind: DatasetKind.OPENING_FUND_BALANCE,
    slug: "opening-fund-balance",
    label: "Opening Fund Balance",
    description:
      "What the district started the year with. Anchors every fund balance figure for the year.",
    periodType: PeriodType.ANNUAL,
  },
  "revenue-detail": {
    kind: DatasetKind.REVENUE_DETAIL,
    slug: "revenue-detail",
    label: "Revenue Detail",
    description: "What was actually collected this month and year to date.",
    periodType: PeriodType.MONTHLY,
    budgetType: BudgetType.CURRENT,
  },
  "expenditure-detail": {
    kind: DatasetKind.EXPENDITURE_DETAIL,
    slug: "expenditure-detail",
    label: "Expenditure Detail",
    description:
      "What was actually spent, including encumbrances — money committed but not yet paid.",
    periodType: PeriodType.MONTHLY,
    budgetType: BudgetType.CURRENT,
  },
  "cash-position": {
    kind: DatasetKind.CASH_POSITION,
    slug: "cash-position",
    label: "Cash Position",
    description: "The month's cash movement, in and out, by fund.",
    periodType: PeriodType.MONTHLY,
  },
};

export const DATASET_SLUGS = Object.keys(DATASETS) as DatasetSlug[];

const BY_KIND = new Map<DatasetKind, DatasetMeta>(
  Object.values(DATASETS).map((d) => [d.kind, d]),
);

export function datasetByKind(kind: DatasetKind): DatasetMeta {
  const meta = BY_KIND.get(kind);
  // Unreachable while DATASETS covers the enum — verify:periods asserts that it does.
  if (!meta) throw new Error(`No dataset registered for kind "${kind}".`);
  return meta;
}

/** Narrows an untrusted route param. Returns null rather than throwing. */
export function datasetBySlug(slug: string): DatasetMeta | null {
  return DATASETS[slug as DatasetSlug] ?? null;
}

/** The two upload rhythms, for grouping the dropdown. */
export function datasetsByRhythm(): {
  annual: DatasetMeta[];
  monthly: DatasetMeta[];
} {
  const all = Object.values(DATASETS);
  return {
    annual: all.filter((d) => d.periodType === PeriodType.ANNUAL),
    monthly: all.filter((d) => d.periodType === PeriodType.MONTHLY),
  };
}
