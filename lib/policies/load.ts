import type { TenantDb } from "@/lib/tenant-db";
import { resolvePolicy, type PolicyValues } from "@/lib/policies/registry";
import type { BusinessRuleThresholds } from "@/lib/validation/import/layers/business-rules";

/**
 * Reading a district's policy, with the workbook's defaults filling every gap.
 *
 * Separate from the registry because the registry is client-safe and this touches the
 * database.
 */
export async function loadPolicy(db: TenantDb, districtId: string): Promise<PolicyValues> {
  const row = await db.districtPolicy.findFirst({ where: { districtId } });
  if (!row) return resolvePolicy(null);

  return resolvePolicy({
    revenue: row.revenue,
    expenditure: row.expenditure,
    cash: row.cash,
    fundBalance: row.fundBalance,
  });
}

/**
 * The import validator's view of the policy.
 *
 * This is the seam M2.5 was built against: business-rules.ts has always read a
 * `BusinessRuleThresholds`, and until now it got the workbook's constants. Now it gets
 * the district's own. The rule itself never forked — which matters, because the spec's
 * warning examples ARE four of the workbook's alerts under different names, and two
 * definitions of "over budget" would have disagreed within a term.
 */
export function toBusinessRules(policy: PolicyValues): BusinessRuleThresholds {
  return {
    flagRevenueOverCollected: policy.revenue.flagOverCollected === true,
    flagSpendOverBudget: policy.expenditure.flagActualOverBudget === true,
    // The workbook has no separate switch for this one; it belongs with the utilisation
    // family, and turning off "spend over budget" without it would leave a district
    // warned about the smaller problem and not the larger.
    flagUtilisationOver100: policy.expenditure.flagActualOverBudget === true,
    flagNegativeAvailableBudget: policy.expenditure.flagNegativeAvailable === true,
    flagEncumbrancesOverAvailable: policy.expenditure.flagEncumbrancesOverAvailable === true,
  };
}
