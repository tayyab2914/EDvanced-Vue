import type { PrismaClient } from "@/lib/generated/prisma/client";
import { ActivityClass } from "@/lib/enums";

/**
 * Telling transfers apart from revenue and spending, by object code.
 *
 * Transfers In and Other Financing Sources are REVENUE object codes; Transfers Out is an
 * EXPENSE object code. They arrive inside the Revenue and Expenditure files that already
 * exist — no new column, no new import. All the platform needs is to know which codes
 * they are.
 *
 * Pure matching logic; the loader is the only part that touches the database. Not
 * tenant-scoped: the classification is platform-managed, because the Red Book is the
 * standardised core and "9700 is a transfer out" is a fact about the chart of accounts
 * rather than a district's opinion.
 */

/** One class's codes: exact values plus inclusive ranges. */
export interface CodeMatcher {
  exact: Set<string>;
  ranges: { from: number; to: number }[];
}

const EMPTY: CodeMatcher = { exact: new Set(), ranges: [] };

/**
 * Codes are compared numerically once leading zeros are gone, because a chart of accounts
 * range means "9700 through 9799", not a string comparison in which "97000" sits inside
 * it. A non-numeric code can still match exactly; it just cannot fall in a range.
 */
function numeric(code: string): number | null {
  const t = code.trim();
  if (!/^\d+$/.test(t)) return null;
  return Number(t);
}

export function matches(m: CodeMatcher, code: string): boolean {
  const t = code.trim();
  if (m.exact.has(t)) return true;
  // Leading zeros are cosmetic in a code: "0101" and "101" are the same account, and a
  // range should catch it either way.
  const n = numeric(t);
  if (n === null) return false;
  if (m.exact.has(String(n))) return true;
  return m.ranges.some((r) => n >= r.from && n <= r.to);
}

export interface ActivityCodes {
  transfersIn: CodeMatcher;
  transfersOut: CodeMatcher;
  otherFinancing: CodeMatcher;
  /**
   * False when nothing has been configured yet.
   *
   * Worth knowing, but NOT a reason to withhold a fund balance — see the note in
   * ./fund-balance.ts. It gates the figures that must EXCLUDE transfers, like the
   * dashboard's Net Operating Surplus, not the balance itself.
   */
  configured: boolean;
}

export const NO_CODES: ActivityCodes = {
  transfersIn: EMPTY,
  transfersOut: EMPTY,
  otherFinancing: EMPTY,
  configured: false,
};

export function buildMatcher(
  rows: { codeFrom: string; codeTo: string | null }[],
): CodeMatcher {
  const exact = new Set<string>();
  const ranges: { from: number; to: number }[] = [];

  for (const r of rows) {
    if (!r.codeTo) {
      exact.add(r.codeFrom.trim());
      continue;
    }
    const from = numeric(r.codeFrom);
    const to = numeric(r.codeTo);
    // A range whose ends are not numbers is meaningless. Treat the low end as an exact
    // code rather than silently matching nothing.
    if (from === null || to === null) {
      exact.add(r.codeFrom.trim());
      continue;
    }
    ranges.push(from <= to ? { from, to } : { from: to, to: from });
  }

  return { exact, ranges };
}

/**
 * Loads the classification. Reads through the BASE client, not a tenant one: this is a
 * global lookup shared by every district.
 */
export async function loadActivityCodes(db: PrismaClient): Promise<ActivityCodes> {
  const rows = await db.financialActivityCode.findMany({
    where: { active: true },
    select: { activityClass: true, codeFrom: true, codeTo: true },
  });

  const of = (c: ActivityClass) => buildMatcher(rows.filter((r) => r.activityClass === c));

  return {
    transfersIn: of(ActivityClass.TRANSFERS_IN),
    transfersOut: of(ActivityClass.TRANSFERS_OUT),
    otherFinancing: of(ActivityClass.OTHER_FINANCING_SOURCES),
    configured: rows.length > 0,
  };
}

/** True when this revenue object code is a transfer in or other financing source. */
export function isRevenueTransfer(codes: ActivityCodes, code: string): boolean {
  return matches(codes.transfersIn, code) || matches(codes.otherFinancing, code);
}

/** True when this expense object code is a transfer out. */
export function isExpenseTransfer(codes: ActivityCodes, code: string): boolean {
  return matches(codes.transfersOut, code);
}
