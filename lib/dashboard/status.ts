import type { ReserveStatus } from "@/lib/alerts/catalog";

/**
 * The four-rung ladder, generalised beyond the reserve percentage.
 *
 * `reserveStatus()` in lib/alerts/catalog.ts already grades the reserve against the
 * district's fund-balance thresholds. Milestone 3 needs the same grading for every other
 * figure a dashboard measures against a policy — days of cash, budget utilisation, revenue
 * variance — and each of those reads a DIFFERENT pair of thresholds and runs in a
 * DIFFERENT direction.
 *
 * Writing that comparison four more times by hand is how a status badge ends up
 * contradicting the alert printed beside it. So the comparison lives here once, and
 * `reserveStatus()` stays where it is: it is read by the alert engine, which is server
 * code with no business importing a presentation module.
 *
 * Pure and client-safe. No Prisma, no server-only.
 */

/** The ladder, plus the one state the ladder itself cannot express. */
export type StatusRung = ReserveStatus | "N/A";

/**
 * Which way the number runs toward trouble.
 *
 * "falling" — reserve percentage, days of cash. Small is bad.
 * "rising"  — budget utilisation, absolute variance. Large is bad.
 *
 * The same distinction the policy form validates ordering with
 * (lib/policies/registry.ts ORDERING), and for the same reason: a critical threshold
 * that fires before its warning means a district sees red having never seen amber.
 */
export type Direction = "falling" | "rising";

export interface LadderThresholds {
  warning: number;
  critical: number;
  /**
   * The district's aspiration, distinct from the point at which it starts worrying.
   *
   * Only the fund-balance policy carries one, which is why it is optional: with a target,
   * the ladder has four rungs and "Acceptable" means "past the warning bar but short of
   * where you want to be". Without one there is no coherent fourth rung, and inventing a
   * band would be putting a number on the screen that no district ever agreed to.
   */
  target?: number;
  direction: Direction;
}

/**
 * Grades a figure against a district's own thresholds.
 *
 * A null value returns "N/A", never a rung. That is the whole discipline of §5.17: "we
 * cannot say yet" and "you are fine" are different answers, and a green badge over a
 * figure the platform could not compute is the worst thing this screen could do.
 */
export function ladder(value: number | null | undefined, t: LadderThresholds): StatusRung {
  if (value === null || value === undefined || !Number.isFinite(value)) return "N/A";

  if (t.direction === "falling") {
    if (value < t.critical) return "Action Required";
    if (value < t.warning) return "Monitor";
    if (t.target !== undefined && value < t.target) return "Acceptable";
    return "Strong";
  }

  if (value >= t.critical) return "Action Required";
  if (value >= t.warning) return "Monitor";
  if (t.target !== undefined && value > t.target) return "Acceptable";
  return "Strong";
}

/**
 * The bands, in ladder order, for the benchmark bar on the Fund Balance dashboard
 * (Spec §6.1) — the gradient strip a district reads its reserve position off.
 *
 * Derived from the same thresholds the badge reads, so the strip cannot be drawn showing
 * a district sitting in a band its own badge disagrees with. Returned worst-first, which
 * is left-to-right on screen.
 */
export interface StatusBand {
  rung: StatusRung;
  /** Inclusive lower bound. Null at the open end. */
  from: number | null;
  /** Exclusive upper bound. Null at the open end. */
  to: number | null;
  label: string;
}

export function bands(t: LadderThresholds): StatusBand[] {
  const fmt = (n: number) => `${n}%`;

  if (t.direction === "falling") {
    const out: StatusBand[] = [
      { rung: "Action Required", from: null, to: t.critical, label: `< ${fmt(t.critical)}` },
      {
        rung: "Monitor",
        from: t.critical,
        to: t.warning,
        label: `${fmt(t.critical)} – ${fmt(t.warning)}`,
      },
    ];
    if (t.target !== undefined) {
      out.push({
        rung: "Acceptable",
        from: t.warning,
        to: t.target,
        label: `${fmt(t.warning)} – ${fmt(t.target)}`,
      });
      out.push({ rung: "Strong", from: t.target, to: null, label: `≥ ${fmt(t.target)}` });
    } else {
      out.push({ rung: "Strong", from: t.warning, to: null, label: `≥ ${fmt(t.warning)}` });
    }
    return out;
  }

  const out: StatusBand[] = [];
  if (t.target !== undefined) {
    out.push({ rung: "Strong", from: null, to: t.target, label: `≤ ${fmt(t.target)}` });
    out.push({
      rung: "Acceptable",
      from: t.target,
      to: t.warning,
      label: `${fmt(t.target)} – ${fmt(t.warning)}`,
    });
  } else {
    out.push({ rung: "Strong", from: null, to: t.warning, label: `< ${fmt(t.warning)}` });
  }
  out.push({
    rung: "Monitor",
    from: t.warning,
    to: t.critical,
    label: `${fmt(t.warning)} – ${fmt(t.critical)}`,
  });
  out.push({ rung: "Action Required", from: t.critical, to: null, label: `≥ ${fmt(t.critical)}` });
  return out;
}

/**
 * One line stating the rule a figure was graded against, for the caption under a badge or
 * a benchmark bar.
 *
 * A status with no stated rule is an opinion. §5.16's whole argument for publishing
 * thresholds to Viewers is that someone being measured should be able to read the ruler.
 */
export function ruleOf(t: LadderThresholds, unit: "percent" | "days" = "percent"): string {
  const u = (n: number) => (unit === "days" ? `${n} days` : `${n}%`);
  if (t.direction === "falling") {
    return t.target !== undefined
      ? `Target ≥ ${u(t.target)} · warning below ${u(t.warning)} · critical below ${u(t.critical)}`
      : `Policy ≥ ${u(t.warning)} · critical below ${u(t.critical)}`;
  }
  return `Warning at ${u(t.warning)} · critical at ${u(t.critical)}`;
}
