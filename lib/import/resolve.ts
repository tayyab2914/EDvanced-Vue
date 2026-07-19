import type { TenantDb } from "@/lib/tenant-db";
import type { ResolveTarget } from "@/lib/datasets/fields";

/**
 * Turning the codes a district wrote into the ids our rows point at.
 *
 * This is where the leading-zero problem is actually solved. Reading columns "as text"
 * does not solve it: if the district's ERP wrote fund 0101 into a NUMERIC cell, the xlsx
 * contains 101 and the zero was gone before we opened the file — no read mode recovers
 * it. What does recover it is master data, which holds the canonical code. If "101"
 * matches nothing but "0101" exists, that is not a guess, it is the only candidate.
 *
 * Doubles as the referential-integrity pass (Spec §5.6): a code that resolves to nothing
 * IS the dangling reference. Same shape as M1's `validateSelects` — a separate async
 * pass, because a database question cannot live inside a synchronous Zod schema.
 */

/** One master list, indexed for both exact and zero-tolerant lookup. */
interface CodeIndex {
  /** normalised code -> id */
  exact: Map<string, string>;
  /** code with leading zeros stripped -> id, or AMBIGUOUS when two codes collide */
  loose: Map<string, string | typeof AMBIGUOUS>;
}

const AMBIGUOUS = Symbol("ambiguous");

const norm = (c: string) => c.trim().toLowerCase();
/** "0101" -> "101"; "000" -> "0". Only leading zeros, and never the last digit. */
const stripZeros = (c: string) => norm(c).replace(/^0+(?=.)/, "");

function buildIndex(rows: { id: string; code: string }[]): CodeIndex {
  const exact = new Map<string, string>();
  const loose = new Map<string, string | typeof AMBIGUOUS>();

  for (const { id, code } of rows) {
    if (!code) continue;
    exact.set(norm(code), id);

    const key = stripZeros(code);
    // If a district genuinely has both "0101" and "101", stripping cannot tell them
    // apart — so it must not try. Better a legible error than the wrong fund.
    loose.set(key, loose.has(key) && loose.get(key) !== id ? AMBIGUOUS : id);
  }
  return { exact, loose };
}

export type ResolveOutcome =
  | { ok: true; id: string; /** set when a lost leading zero was recovered */ recovered?: string }
  | { ok: false; reason: "unknown" | "ambiguous" };

function lookup(index: CodeIndex, code: string): ResolveOutcome {
  const exact = index.exact.get(norm(code));
  if (exact) return { ok: true, id: exact };

  // Only now, having failed honestly, do we consider that Excel ate a zero.
  const loose = index.loose.get(stripZeros(code));
  if (loose === AMBIGUOUS) return { ok: false, reason: "ambiguous" };
  if (loose) {
    const canonical = [...index.exact.entries()].find(([, id]) => id === loose)?.[0];
    return { ok: true, id: loose, recovered: canonical };
  }
  return { ok: false, reason: "unknown" };
}

export interface ResolveMaps {
  fund: CodeIndex;
  revenueSource: CodeIndex;
  function: CodeIndex;
  object: CodeIndex;
  costCenter: CodeIndex;
  project: CodeIndex;
  status: CodeIndex;
}

/**
 * Loads every list an import could reference, once, before the row loop — exactly as
 * M1's importer builds its maps up front. Per-row queries across 40,000 rows would be
 * 40,000 round trips.
 *
 * Master lists are read through `db` (tenant-scoped, so district-owned rows cannot leak
 * across); Statuses are a platform-managed global list and are read through the same
 * client only because the scoping extension leaves non-tenant models alone.
 */
export async function loadResolveMaps(db: TenantDb): Promise<ResolveMaps> {
  const [funds, revenueSources, functions, objects, costCenters, projects, statuses] =
    await Promise.all([
      db.fund.findMany({ select: { id: true, code: true } }),
      db.revenueSource.findMany({ select: { id: true, code: true } }),
      db.accountFunction.findMany({ select: { id: true, code: true } }),
      db.accountObject.findMany({ select: { id: true, code: true } }),
      db.school.findMany({ select: { id: true, schoolNumber: true } }),
      db.project.findMany({ select: { id: true, projectNumber: true } }),
      db.status.findMany({ select: { id: true, code: true, name: true } }),
    ]);

  return {
    fund: buildIndex(funds),
    revenueSource: buildIndex(revenueSources),
    function: buildIndex(functions),
    object: buildIndex(objects),
    costCenter: buildIndex(costCenters.map((c) => ({ id: c.id, code: c.schoolNumber }))),
    project: buildIndex(projects.map((p) => ({ id: p.id, code: p.projectNumber }))),
    // A district writes "Final", not a code — so a Status resolves by either.
    status: buildIndex(
      statuses.flatMap((s) => [
        ...(s.code ? [{ id: s.id, code: s.code }] : []),
        { id: s.id, code: s.name },
      ]),
    ),
  };
}

/** Resolves one code against one target list. */
export function resolveCode(
  maps: ResolveMaps,
  target: ResolveTarget,
  code: string,
): ResolveOutcome {
  return lookup(maps[target], code);
}

/** How many codes a list holds — used to tell "no match" from "you have no funds yet". */
export function indexSize(maps: ResolveMaps, target: keyof ResolveMaps): number {
  return maps[target].exact.size;
}
