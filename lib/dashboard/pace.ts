import type { StatusRung, LadderThresholds } from "@/lib/dashboard/status";

/**
 * The row-level badge on the budget-comparison cards — "On Target", "Ahead", "Behind",
 * "Over Budget", "Critical".
 *
 * The client's brief was explicit about where these come from: "the Financial Policies &
 * Thresholds become the single source of truth", with a worked example — a revenue policy
 * of warning 5% / critical 10% displaying 2% as On Target, 7% as Warning and 12% as
 * Critical. So this reads the SAME `LadderThresholds` the KPI badges and the alert engine
 * read (lib/dashboard/load.ts builds them from the district's own policy), and a district
 * that moves its warning band moves every one of these badges with it.
 *
 * Kept separate from `ladder()` in lib/dashboard/status.ts because the question is
 * different. `ladder()` grades a figure that runs one way toward trouble — a reserve
 * percentage, days of cash. A pace variance is SIGNED and both signs mean something: a
 * revenue source 12% ahead of pace and one 12% behind are not the same news, and grading
 * them on `Math.abs()` — which is what the KPI tiles do, correctly, for a single headline
 * number — would print the same badge on both.
 *
 * Pure and client-safe.
 */

/** The word a row wears. Never a bare colour: the label is the identity channel. */
export type PaceLabel = "Ahead" | "On Target" | "Behind" | "Over Budget" | "Critical" | "N/A";

export interface PaceStatus {
  label: PaceLabel;
  /** Which colour rung the badge borrows. */
  rung: StatusRung;
}

const NA: PaceStatus = { label: "N/A", rung: "N/A" };

/**
 * Grades a signed pace variance for a REVENUE row — actual collections against the budget
 * expected by now, as a percentage.
 *
 * Collecting ahead of pace is good news and says so. Collecting behind it crosses the
 * district's own warning band into Behind, and its critical band into Critical.
 */
export function revenuePace(
  variancePercent: number | null | undefined,
  t: LadderThresholds,
): PaceStatus {
  if (variancePercent === null || variancePercent === undefined || !Number.isFinite(variancePercent)) {
    return NA;
  }
  if (variancePercent <= -t.critical) return { label: "Critical", rung: "Action Required" };
  if (variancePercent <= -t.warning) return { label: "Behind", rung: "Monitor" };
  if (variancePercent >= t.warning) return { label: "Ahead", rung: "Strong" };
  return { label: "On Target", rung: "Strong" };
}

/**
 * The same for an EXPENDITURE row, where the polarity inverts.
 *
 * Spending ahead of pace is the risk, so it is what earns Over Budget and Critical.
 * Spending behind pace is worth surfacing — an underspent programme is a plan that is not
 * happening — but it is a Monitor, not an emergency.
 */
export function expenditurePace(
  variancePercent: number | null | undefined,
  t: LadderThresholds,
): PaceStatus {
  if (variancePercent === null || variancePercent === undefined || !Number.isFinite(variancePercent)) {
    return NA;
  }
  if (variancePercent >= t.critical) return { label: "Critical", rung: "Action Required" };
  if (variancePercent >= t.warning) return { label: "Over Budget", rung: "Monitor" };
  if (variancePercent <= -t.warning) return { label: "Behind", rung: "Monitor" };
  return { label: "On Target", rung: "Strong" };
}

/**
 * "Approaching its budget threshold" — the client's third Expenditure request.
 *
 * A function that has consumed more of its budget than the year has consumed of itself is
 * on track to overrun, and this is the flag that says so BEFORE the utilisation policy
 * fires. Deliberately a separate signal from `expenditurePace`: a row can be On Target on
 * pace this month and still be heading for the ceiling.
 */
export function approachingCeiling(
  utilisationPercent: number | null | undefined,
  t: LadderThresholds,
): boolean {
  if (utilisationPercent === null || utilisationPercent === undefined) return false;
  if (!Number.isFinite(utilisationPercent)) return false;
  // Within five points below the warning band, but not yet past it — past it the row is
  // already wearing a Monitor badge and does not need a second warning.
  return utilisationPercent >= t.warning - 5 && utilisationPercent < t.warning;
}
