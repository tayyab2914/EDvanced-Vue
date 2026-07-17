// Layer 6 — business rules: legitimate-but-noteworthy conditions, raised as Warnings.
//
// The two-tier split is the point of this layer. Spec §5.6: "some real-world states,
// such as a grant being over-collected, are valid and should be surfaced rather than
// blocked". So nothing here is an Error. A district acknowledges these and proceeds.
//
// ---------------------------------------------------------------------------
// THE SEAM FOR M2.10 (thresholds)
//
// Thresholds become district-configurable in M2.10. Until then the defaults below come
// straight from the client's workbook, so an untouched district still behaves sensibly —
// and when M2.10 lands, it swaps the SOURCE of this object and touches nothing else.
//
// It matters that this stays one interface. The spec's warning examples (over-collection,
// spend over budget, utilisation over 100%, reserve below minimum) ARE four of the
// workbook's 27 alerts, described in different words in a different document. Fork them
// and "over budget" ends up with two definitions that disagree in the third month.
// ---------------------------------------------------------------------------
//
// Note the scale difference from the dashboard alerts: the workbook's 80% utilisation
// warning is an early signal for ONE aggregate figure. Applied per row it would fire on
// thousands of lines and bury the report. Only the genuine anomalies belong here.

import { Prisma } from "@/lib/generated/prisma/client";
import type { DatasetDef } from "@/lib/datasets/registry";
import { RULE, money, warning, type Finding } from "@/lib/validation/import/findings";
import type { ResolvedRow } from "@/lib/validation/import/layers/referential";

const D = Prisma.Decimal;

export interface BusinessRuleThresholds {
  /** Flag a line whose collections exceed its budget. Workbook: on. */
  flagRevenueOverCollected: boolean;
  /** Flag a line whose spend exceeds its budget (the workbook's "Budget Exceeded", 100%). */
  flagSpendOverBudget: boolean;
  /** Flag a line where actual + encumbrances exceeds budget. */
  flagUtilisationOver100: boolean;
  /** The workbook's "Negative Available Budget" check. */
  flagNegativeAvailableBudget: boolean;
  /** The workbook's "Encumbrances over Available Budget" check. */
  flagEncumbrancesOverAvailable: boolean;
}

/** Straight from the workbook's threshold tables. M2.10 replaces the source, not the shape. */
export const WORKBOOK_DEFAULTS: BusinessRuleThresholds = {
  flagRevenueOverCollected: true,
  flagSpendOverBudget: true,
  flagUtilisationOver100: true,
  flagNegativeAvailableBudget: true,
  flagEncumbrancesOverAvailable: true,
};

export function businessRuleFindings(
  def: DatasetDef,
  rows: ResolvedRow[],
  thresholds: BusinessRuleThresholds = WORKBOOK_DEFAULTS,
): Finding[] {
  const findings: Finding[] = [];
  const has = (name: string) => def.fields.some((f) => f.name === name);

  // Only the two detail imports carry a budget alongside actuals, so only they can be
  // over it. Guarding on the fields rather than the slug means a new dataset with the
  // same shape gets these checks for free.
  const hasBudgetAndActual = has("budget") && has("actualYtd");
  if (!hasBudgetAndActual) return findings;

  const isExpenditure = has("encumbrances");

  for (const row of rows) {
    const budget = new D(row.value.budget || 0);
    const actualYtd = new D(row.value.actualYtd || 0);
    const encumbrances = new D(row.value.encumbrances || 0);

    // A zero budget with no activity is just an unused line, not an anomaly.
    if (budget.isZero() && actualYtd.isZero()) continue;

    if (!isExpenditure && thresholds.flagRevenueOverCollected && actualYtd.greaterThan(budget)) {
      findings.push(
        warning({
          layer: "business-rules",
          rule: RULE.REVENUE_OVER_COLLECTED,
          rowNumber: row.rowNumber,
          column: "Actual YTD",
          value: actualYtd.toFixed(2),
          // Deliberately not phrased as a problem. Over-collection is good news, and the
          // spec names it as the example of a valid state that must not block.
          message: `Collected ${money(actualYtd.toFixed(2))} against a budget of ${money(budget.toFixed(2))} — ${money(actualYtd.minus(budget).toFixed(2))} over. That may be perfectly correct; acknowledge to continue.`,
        }),
      );
    }

    if (isExpenditure) {
      if (thresholds.flagSpendOverBudget && actualYtd.greaterThan(budget)) {
        findings.push(
          warning({
            layer: "business-rules",
            rule: RULE.SPEND_OVER_BUDGET,
            rowNumber: row.rowNumber,
            column: "Actual YTD",
            value: actualYtd.toFixed(2),
            message: `Spent ${money(actualYtd.toFixed(2))} against a budget of ${money(budget.toFixed(2))} — ${money(actualYtd.minus(budget).toFixed(2))} over budget.`,
          }),
        );
      }

      const committed = actualYtd.plus(encumbrances);
      if (
        thresholds.flagUtilisationOver100 &&
        committed.greaterThan(budget) &&
        !actualYtd.greaterThan(budget) // else it duplicates the finding above
      ) {
        findings.push(
          warning({
            layer: "business-rules",
            rule: RULE.UTILISATION_OVER_100,
            rowNumber: row.rowNumber,
            column: "Encumbrances",
            value: encumbrances.toFixed(2),
            message: `Spend plus encumbrances is ${money(committed.toFixed(2))} against a budget of ${money(budget.toFixed(2))} — this line is committed beyond its budget even though it hasn't overspent yet.`,
          }),
        );
      }

      const available = budget.minus(actualYtd).minus(encumbrances);
      if (thresholds.flagNegativeAvailableBudget && available.lessThan(0)) {
        findings.push(
          warning({
            layer: "business-rules",
            rule: RULE.NEGATIVE_AVAILABLE_BUDGET,
            rowNumber: row.rowNumber,
            column: "Available Budget",
            value: available.toFixed(2),
            message: `Available budget is ${money(available.toFixed(2))}. Budget minus spend minus encumbrances has gone below zero.`,
          }),
        );
      }

      const availableBeforeEncumbrances = budget.minus(actualYtd);
      if (
        thresholds.flagEncumbrancesOverAvailable &&
        encumbrances.greaterThan(availableBeforeEncumbrances) &&
        !available.lessThan(0) // the negative-available finding already says it louder
      ) {
        findings.push(
          warning({
            layer: "business-rules",
            rule: RULE.ENCUMBRANCES_OVER_AVAILABLE,
            rowNumber: row.rowNumber,
            column: "Encumbrances",
            value: encumbrances.toFixed(2),
            message: `Encumbrances of ${money(encumbrances.toFixed(2))} exceed the ${money(availableBeforeEncumbrances.toFixed(2))} left after spend.`,
          }),
        );
      }
    }
  }

  return findings;
}
