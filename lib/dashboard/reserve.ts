import {
  RESERVE_DENOMINATOR_LABELS,
  type ReserveBasis,
  type ReserveDenominator,
} from "@/lib/enums";

/**
 * How a reserve figure is LABELLED — in one place, because there are now four ways to get
 * it wrong.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A MODULE AND NOT SIX STRING LITERALS
 *
 * Before M6 every reserve caption in the product was the same hardcoded sentence — "of
 * budgeted general fund expenditures" — repeated across the executive tile, the fund
 * balance tile, the print sheet, the policies screen, the benchmark strip and the export
 * header. That was safe only because the figure could not be anything else.
 *
 * It can now be four things: projected revenue while the year runs, actual revenue once it
 * is in, and either of the two expenditure equivalents for a district that has chosen that
 * basis. A caption that says "budgeted expenditures" over a revenue-basis figure is not a
 * cosmetic bug — it is a district reporting a number to its board against the wrong
 * denominator, which is the entire failure this milestone exists to prevent. Six literals
 * is six chances to update five of them.
 *
 * ---------------------------------------------------------------------------
 * PURE AND CLIENT-SAFE
 *
 * Structural parameter types rather than an import of `ReserveResult`, so a client
 * component can render a caption without dragging the Prisma-bound finance layer into the
 * browser bundle.
 * ---------------------------------------------------------------------------
 */

/** The shape every helper here needs — satisfied by `ReserveResult`, and by a test fixture. */
export interface ReserveCaptionInput {
  denominator: ReserveDenominator;
  basis: ReserveBasis;
  actual: boolean;
}

/**
 * The sub-line under a reserve percentage: "of projected General Fund revenue".
 *
 * Falls back to the revenue wording when there is no reserve to describe, because a tile
 * showing N/A still has to say what it would have been a percentage OF — otherwise the
 * district cannot tell whether the figure is missing or the basis is misconfigured.
 */
export function reserveCaption(reserve: ReserveCaptionInput | null): string {
  const denominator: ReserveDenominator = reserve?.denominator ?? "AMENDED_REVENUE";
  return `of ${RESERVE_DENOMINATOR_LABELS[denominator]}`;
}

/** Sentence-leading form: "Projected unassigned fund balance" / "Unassigned fund balance". */
export function reserveSubject(reserve: ReserveCaptionInput | null): string {
  return reserve?.actual ? "Unassigned fund balance" : "Projected unassigned fund balance";
}

/** Tile label. Same distinction, kept short enough for a KPI header. */
export function reserveTileLabel(reserve: ReserveCaptionInput | null): string {
  return reserve?.actual ? "Unassigned fund balance %" : "Projected unassigned %";
}

/**
 * What a district must upload before this figure can exist.
 *
 * Names the file the basis actually needs. Telling a revenue-basis district to import an
 * adopted EXPENDITURE budget — which is what the old hardcoded string did — sends them to
 * upload a file that will not fix anything.
 */
export function reserveUnavailableReason(basis: ReserveBasis): string {
  return basis === "EXPENDITURE"
    ? "Needs a fund typed General, an opening fund balance and an adopted expenditure budget."
    : "Needs a fund typed General, an opening fund balance and a General Fund revenue budget.";
}

/**
 * The methodology line shown under the fund balance breakdown.
 *
 * Spells the arithmetic out because the projected ending balance is the one figure on these
 * screens a finance officer cannot reconcile by inspection — it is not on any file they
 * uploaded, it is three of them combined.
 */
export function reserveMethodology(reserve: ReserveCaptionInput | null): string {
  if (reserve?.actual) {
    return "Actual ending fund balance over actual General Fund revenue collected.";
  }
  return reserve?.basis === "EXPENDITURE"
    ? "Beginning fund balance plus the amended budget's net change, over budgeted General Fund expenditures."
    : "Beginning fund balance, plus amended revenue budget, less amended expenditure budget — over projected General Fund revenue.";
}
