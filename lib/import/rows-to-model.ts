// Turning a validated, resolved staging row into the shape its Prisma model wants.
//
// The one place the six importers stop being uniform. Everything upstream — parsing,
// validation, staging — treats them identically because the registry describes them
// identically. But they land in five different tables with five different column sets,
// and pretending otherwise would mean a registry field for every column of every model.
//
// Pure: takes a resolved row, returns a plain object. No database, so it is testable
// without one.

import type { DatasetSlug } from "@/lib/datasets/kinds";

/** The resolved staging payload: codes already ids, calculated fields already computed. */
export type ResolvedPayload = Record<string, string | undefined>;

export interface RowContext {
  versionId: string;
  fiscalYear: string;
  /** Null for the three annual datasets. */
  period: number | null;
}

type ModelRow = Record<string, unknown>;

/** Decimal columns take a string; Prisma parses it. Never a JS number — that is the float trap. */
const dec = (v: string | undefined): string => v ?? "0";
const decOrNull = (v: string | undefined): string | null => (v === undefined || v === "" ? null : v);

/**
 * The mappers, one per importer.
 *
 * Note the two budget importers share a table. BudgetLine holds both, discriminated by
 * `kind`, because "what is this district's budget for X" is one question and answering it
 * from two tables with different shapes would push that join into every caller.
 */
const MAPPERS: Record<DatasetSlug, (r: ResolvedPayload, c: RowContext) => ModelRow> = {
  "revenue-budget": (r, c) => ({
    versionId: c.versionId,
    fiscalYear: c.fiscalYear,
    budgetType: "ADOPTED",
    kind: "REVENUE",
    fundId: r.fundId,
    revenueSourceId: r.revenueSourceId,
    costCenterId: r.costCenterId ?? null,
    capitalProjectId: r.capitalProjectId ?? null,
    grantId: r.grantId ?? null,
    amount: dec(r.amount),
  }),

  "expenditure-budget": (r, c) => ({
    versionId: c.versionId,
    fiscalYear: c.fiscalYear,
    budgetType: "ADOPTED",
    kind: "EXPENDITURE",
    fundId: r.fundId,
    functionId: r.functionId,
    objectId: r.objectId,
    costCenterId: r.costCenterId ?? null,
    capitalProjectId: r.capitalProjectId ?? null,
    grantId: r.grantId ?? null,
    amount: dec(r.amount),
  }),

  "opening-fund-balance": (r, c) => ({
    versionId: c.versionId,
    fiscalYear: c.fiscalYear,
    fundId: r.fundId,
    pyNonspendable: dec(r.pyNonspendable),
    pyRestricted: dec(r.pyRestricted),
    pyCommitted: dec(r.pyCommitted),
    pyAssigned: dec(r.pyAssigned),
    pyUnassigned: dec(r.pyUnassigned),
    pyTotal: dec(r.pyTotal),
    begNonspendable: decOrNull(r.begNonspendable),
    begRestricted: decOrNull(r.begRestricted),
    begCommitted: decOrNull(r.begCommitted),
    begAssigned: decOrNull(r.begAssigned),
    begUnassigned: dec(r.begUnassigned),
    begTotal: dec(r.begTotal),
    effectiveDate: new Date(r.effectiveDate!),
    statusId: r.statusId ?? null,
    notes: r.notes ?? null,
  }),

  "revenue-detail": (r, c) => ({
    versionId: c.versionId,
    fiscalYear: c.fiscalYear,
    period: c.period,
    fundId: r.fundId,
    revenueSourceId: r.revenueSourceId,
    // The single "Project / Grant" column resolved into exactly one of these two.
    grantId: r.grantId ?? null,
    capitalProjectId: r.capitalProjectId ?? null,
    costCenterId: r.costCenterId ?? null,
    // The file's Budget column IS the current/revised budget — that is why it stays on
    // the row rather than moving to BudgetLine.
    budget: dec(r.budget),
    actualMtd: dec(r.actualMtd),
    actualYtd: dec(r.actualYtd),
  }),

  "expenditure-detail": (r, c) => ({
    versionId: c.versionId,
    fiscalYear: c.fiscalYear,
    period: c.period,
    fundId: r.fundId,
    functionId: r.functionId,
    objectId: r.objectId,
    costCenterId: r.costCenterId ?? null,
    grantId: r.grantId ?? null,
    capitalProjectId: r.capitalProjectId ?? null,
    budget: dec(r.budget),
    actualMtd: dec(r.actualMtd),
    actualYtd: dec(r.actualYtd),
    encumbrances: dec(r.encumbrances),
    // Computed by the engine, from the same evaluator the calculation layer compared the
    // file against — never taken from the file itself.
    availableBudget: dec(r.availableBudget),
  }),

  "cash-position": (r, c) => ({
    versionId: c.versionId,
    fiscalYear: c.fiscalYear,
    period: c.period,
    fundId: r.fundId,
    beginningCash: dec(r.beginningCash),
    receiptsMtd: dec(r.receiptsMtd),
    disbursementsMtd: dec(r.disbursementsMtd),
    endingCash: dec(r.endingCash),
    investmentBalance: decOrNull(r.investmentBalance),
    restrictedCash: decOrNull(r.restrictedCash),
    unrestrictedCash: decOrNull(r.unrestrictedCash),
  }),
};

export function toModelRow(
  slug: DatasetSlug,
  resolved: ResolvedPayload,
  ctx: RowContext,
): ModelRow {
  return MAPPERS[slug](resolved, ctx);
}

export function toModelRows(
  slug: DatasetSlug,
  rows: ResolvedPayload[],
  ctx: RowContext,
): ModelRow[] {
  const map = MAPPERS[slug];
  return rows.map((r) => map(r, ctx));
}
