// The six importers, field by field — transcribed from the client workbook's field
// tables, which are the source of truth for what a file may contain.
//
// One declaration drives parsing, validation, the blank template, and the browse
// columns. Deliberately parallel to lib/master-data/registry.ts: same shape, same Zod
// idiom, same toClientDef boundary. If you have changed that file, this one probably
// wants the same change.
//
// Pure and client-safe (zod only) — see the note at the top of ./fields.ts.

import * as z from "zod";
import { PeriodType, BudgetType } from "@/lib/enums";
import { DATASETS, type DatasetSlug } from "@/lib/datasets/kinds";
import {
  amount,
  calculated,
  code,
  optionalAmount,
  optionalCode,
  optionalText,
  requiredAmount,
  requiredCode,
  requiredDate,
  type DatasetField,
} from "@/lib/datasets/fields";

export interface DatasetDef {
  slug: DatasetSlug;
  /** Prisma delegate the committed rows land in. */
  model: string;
  title: string;
  periodType: PeriodType;
  budgetType?: BudgetType;
  fields: DatasetField[];
  /**
   * What makes two rows "the same row", by field name.
   *
   * Earns its place twice: the duplicate-rows validation layer uses it to spot repeats
   * within one file, and version compare uses it to pair a row in v1 with its
   * counterpart in v2. Defining it once is what stops those two disagreeing about
   * identity — which would show a district a diff that quietly lied.
   */
  grain: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: z.ZodType<any>;
}

/** Serializable subset safe to hand to Client Components (no Zod schema, no model). */
export type ClientDatasetDef = Pick<
  DatasetDef,
  "slug" | "title" | "periodType" | "budgetType" | "fields"
>;

export function toClientDef(def: DatasetDef): ClientDatasetDef {
  return {
    slug: def.slug,
    title: def.title,
    periodType: def.periodType,
    budgetType: def.budgetType,
    fields: def.fields,
  };
}

// The same column is labelled two different ways in the client's own workbook — the
// annual budget sheet says "Revenue Object / Source Code", the monthly detail sheet says
// "Revenue Source / Object Code". Both resolve to the same district Revenue Source.
const REVENUE_SOURCE_ALIASES = [
  "Revenue Object / Source Code",
  "Revenue Source / Object Code",
  "Revenue Source Code",
  "Revenue Object Code",
  "Revenue Source",
];

const COST_CENTER_ALIASES = [
  "Cost Center Code",
  "Cost Center",
  "School / Cost Center",
  "School",
];

// The unified project column. The client's workbook still heads it "Project / Grant" on
// the detail sheets, so those spellings stay accepted even though the canonical label is
// now "Project Code" — one Project master backs them all.
const PROJECT_GRANT_ALIASES = [
  "Project / Grant",
  "Project/Grant",
  "Grant / Project",
  "Project Number",
  "Project",
];

// ===================== Annual =====================

const revenueBudget: DatasetDef = {
  slug: "revenue-budget",
  model: "budgetLine",
  title: DATASETS["revenue-budget"].label,
  periodType: PeriodType.ANNUAL,
  budgetType: BudgetType.ADOPTED,
  fields: [
    code("fundId", "Fund Code", "fund"),
    code("revenueSourceId", "Revenue Object / Source Code", "revenueSource", "required", REVENUE_SOURCE_ALIASES),
    code("costCenterId", "Cost Center Code", "costCenter", "optional", COST_CENTER_ALIASES),
    code("projectId", "Project Code", "project", "optional", PROJECT_GRANT_ALIASES),
    amount("amount", "Budget Amount"),
  ],
  grain: ["fundId", "revenueSourceId", "costCenterId", "projectId"],
  schema: z.object({
    fundId: requiredCode("Fund Code"),
    revenueSourceId: requiredCode("Revenue source code"),
    costCenterId: optionalCode,
    projectId: optionalCode,
    amount: requiredAmount("Budget Amount"),
  }),
};

const expenditureBudget: DatasetDef = {
  slug: "expenditure-budget",
  model: "budgetLine",
  title: DATASETS["expenditure-budget"].label,
  periodType: PeriodType.ANNUAL,
  budgetType: BudgetType.ADOPTED,
  fields: [
    code("fundId", "Fund Code", "fund"),
    code("functionId", "Function Code", "function"),
    code("objectId", "Object Code", "object"),
    // The workbook marks this Recommended, not Optional: a district CAN report without
    // it, but every cost-centre view goes blind if they do. Absence is a Warning.
    code("costCenterId", "Cost Center Code", "costCenter", "recommended", COST_CENTER_ALIASES),
    code("projectId", "Project Code", "project", "optional", PROJECT_GRANT_ALIASES),
    amount("amount", "Budget Amount"),
  ],
  grain: ["fundId", "functionId", "objectId", "costCenterId", "projectId"],
  schema: z.object({
    fundId: requiredCode("Fund Code"),
    functionId: requiredCode("Function Code"),
    objectId: requiredCode("Object Code"),
    costCenterId: optionalCode,
    projectId: optionalCode,
    amount: requiredAmount("Budget Amount"),
  }),
};

const openingFundBalance: DatasetDef = {
  slug: "opening-fund-balance",
  model: "openingFundBalance",
  title: DATASETS["opening-fund-balance"].label,
  periodType: PeriodType.ANNUAL,
  fields: [
    code("fundId", "Fund Code", "fund"),
    // Prior-year components: all required, because they exist to reconcile against last
    // year's close, and a partial reconciliation reconciles nothing.
    amount("pyNonspendable", "Prior Year Nonspendable"),
    amount("pyRestricted", "Prior Year Restricted"),
    amount("pyCommitted", "Prior Year Committed"),
    amount("pyAssigned", "Prior Year Assigned"),
    amount("pyUnassigned", "Prior Year Unassigned"),
    calculated(
      "pyTotal",
      "Prior Year Total Ending Fund Balance",
      { plus: ["pyNonspendable", "pyRestricted", "pyCommitted", "pyAssigned", "pyUnassigned"] },
      // The platform totals this — the district enters only the five components. Keeping it
      // off the file removes the whole class of "your total doesn't match its parts" errors
      // districts were tripping on, for a figure they never needed to supply.
      { computeOnly: true },
    ),
    amount("begNonspendable", "Beginning Nonspendable", "optional"),
    amount("begRestricted", "Beginning Restricted", "optional"),
    amount("begCommitted", "Beginning Committed", "optional"),
    amount("begAssigned", "Beginning Assigned", "optional"),
    // Required while its four siblings are optional: this is the reserve figure every
    // fund-balance KPI and threshold in the platform is built on.
    amount("begUnassigned", "Beginning Unassigned"),
    calculated(
      "begTotal",
      "Beginning Total Fund Balance",
      { plus: ["begNonspendable", "begRestricted", "begCommitted", "begAssigned", "begUnassigned"] },
      { computeOnly: true },
    ),
    { name: "effectiveDate", label: "Effective Date", requiredness: "required", type: "date" },
    code("statusId", "Status", "status", "required"), // Preliminary · Unaudited · Final
    { name: "notes", label: "Notes", requiredness: "optional", type: "text" },
  ],
  // One opening balance per fund per year — the balance IS the fund's starting point.
  grain: ["fundId"],
  schema: z.object({
    fundId: requiredCode("Fund Code"),
    pyNonspendable: requiredAmount("Prior Year Nonspendable"),
    pyRestricted: requiredAmount("Prior Year Restricted"),
    pyCommitted: requiredAmount("Prior Year Committed"),
    pyAssigned: requiredAmount("Prior Year Assigned"),
    pyUnassigned: requiredAmount("Prior Year Unassigned"),
    pyTotal: optionalAmount,
    begNonspendable: optionalAmount,
    begRestricted: optionalAmount,
    begCommitted: optionalAmount,
    begAssigned: optionalAmount,
    begUnassigned: requiredAmount("Beginning Unassigned"),
    begTotal: optionalAmount,
    effectiveDate: requiredDate("Effective Date"),
    statusId: requiredCode("Status"),
    notes: optionalText,
  }),
};

// ===================== Monthly =====================

const revenueDetail: DatasetDef = {
  slug: "revenue-detail",
  model: "revenueActual",
  title: DATASETS["revenue-detail"].label,
  periodType: PeriodType.MONTHLY,
  budgetType: BudgetType.CURRENT,
  fields: [
    code("fundId", "Fund Code", "fund"),
    code("revenueSourceId", "Revenue Source / Object Code", "revenueSource", "required", REVENUE_SOURCE_ALIASES),
    // Required here but optional on the annual budget — and this column is why deferring
    // the Grants Activity importer costs so little: grant revenue arrives tagged, here,
    // on every row, against the unified Project master.
    code("projectId", "Project Code", "project", "required", PROJECT_GRANT_ALIASES),
    code("costCenterId", "School / Cost Center", "costCenter", "optional", COST_CENTER_ALIASES),
    // The file's Budget column IS the current/revised budget, tagged CURRENT on ingest.
    amount("budget", "Budget"),
    amount("actualMtd", "Actual MTD"),
    amount("actualYtd", "Actual YTD"),
  ],
  grain: ["fundId", "revenueSourceId", "projectId", "costCenterId"],
  schema: z.object({
    fundId: requiredCode("Fund Code"),
    revenueSourceId: requiredCode("Revenue source code"),
    projectId: requiredCode("Project Code"),
    costCenterId: optionalCode,
    budget: requiredAmount("Budget"),
    actualMtd: requiredAmount("Actual MTD"),
    actualYtd: requiredAmount("Actual YTD"),
  }),
};

const expenditureDetail: DatasetDef = {
  slug: "expenditure-detail",
  model: "expenditureActual",
  title: DATASETS["expenditure-detail"].label,
  periodType: PeriodType.MONTHLY,
  budgetType: BudgetType.CURRENT,
  fields: [
    code("fundId", "Fund Code", "fund"),
    code("functionId", "Function Code", "function"),
    code("objectId", "Object Code", "object"),
    code("costCenterId", "Cost Center", "costCenter", "optional", COST_CENTER_ALIASES),
    code("projectId", "Project Code", "project", "required", PROJECT_GRANT_ALIASES),
    amount("budget", "Budget"),
    amount("actualMtd", "Actual MTD"),
    amount("actualYtd", "Actual YTD"),
    // "Committed but not yet paid. Important for districts" — the workbook's own note.
    amount("encumbrances", "Encumbrances"),
    calculated("availableBudget", "Available Budget", {
      plus: ["budget"],
      minus: ["actualYtd", "encumbrances"],
    }),
  ],
  grain: ["fundId", "functionId", "objectId", "costCenterId", "projectId"],
  schema: z.object({
    fundId: requiredCode("Fund Code"),
    functionId: requiredCode("Function Code"),
    objectId: requiredCode("Object Code"),
    costCenterId: optionalCode,
    projectId: requiredCode("Project Code"),
    budget: requiredAmount("Budget"),
    actualMtd: requiredAmount("Actual MTD"),
    actualYtd: requiredAmount("Actual YTD"),
    encumbrances: requiredAmount("Encumbrances"),
    availableBudget: optionalAmount,
  }),
};

const cashPosition: DatasetDef = {
  slug: "cash-position",
  model: "cashPosition",
  title: DATASETS["cash-position"].label,
  periodType: PeriodType.MONTHLY,
  fields: [
    code("fundId", "Fund Code", "fund"),
    amount("beginningCash", "Beginning Cash Balance"),
    amount("receiptsMtd", "Cash Receipts MTD"),
    amount("disbursementsMtd", "Cash Disbursements MTD"),
    calculated("endingCash", "Ending Cash Balance", {
      plus: ["beginningCash", "receiptsMtd"],
      minus: ["disbursementsMtd"],
    }),
    amount("investmentBalance", "Investment Balance", "optional"), // LGIP, CDs and similar
    amount("restrictedCash", "Restricted Cash", "optional"),
    amount("unrestrictedCash", "Unrestricted Cash", "optional"),
  ],
  grain: ["fundId"],
  schema: z.object({
    fundId: requiredCode("Fund Code"),
    beginningCash: requiredAmount("Beginning Cash Balance"),
    receiptsMtd: requiredAmount("Cash Receipts MTD"),
    disbursementsMtd: requiredAmount("Cash Disbursements MTD"),
    endingCash: optionalAmount,
    investmentBalance: optionalAmount,
    restrictedCash: optionalAmount,
    unrestrictedCash: optionalAmount,
  }),
};

// ===================== Registry =====================

export const DATASET_DEFS: Record<DatasetSlug, DatasetDef> = {
  "revenue-budget": revenueBudget,
  "expenditure-budget": expenditureBudget,
  "opening-fund-balance": openingFundBalance,
  "revenue-detail": revenueDetail,
  "expenditure-detail": expenditureDetail,
  "cash-position": cashPosition,
};

export function datasetDef(slug: DatasetSlug): DatasetDef {
  return DATASET_DEFS[slug];
}

/** Every header the importer will accept for a field: its label first, then any aliases. */
export function acceptedHeaders(field: DatasetField): string[] {
  return [field.label, ...(field.aliases ?? [])];
}

/**
 * The blank template: every field label the district supplies, in declaration order.
 *
 * Checksum calculated columns (Available Budget, Ending Cash) are included on purpose. The
 * platform computes them regardless, but a district exporting from its ERP will have them
 * anyway, and a template that omitted them would imply they are unwelcome — when in fact
 * supplying them is useful: we recompute and compare, which is how a district finds out
 * its own ERP disagrees with itself.
 *
 * `computeOnly` calculated columns (the Opening Fund Balance totals) are the exception and
 * are left off: the platform owns them, the district enters only the components, and a
 * total on the template is only an invitation to enter one that doesn't add up.
 */
export function templateHeaders(def: DatasetDef): string[] {
  return def.fields.filter((f) => !f.computeOnly).map((f) => f.label);
}
