import type { TenantDb } from "@/lib/tenant-db";
import type { DatasetSlug } from "@/lib/datasets/kinds";
import { datasetDef } from "@/lib/datasets/registry";
import type { ResolveTarget } from "@/lib/datasets/fields";
import { money } from "@/lib/dashboard/format";
import { codeName, DEFAULT_LABEL_MODE, type LabelMode } from "@/lib/text";

/**
 * Reading committed periodic data back out.
 *
 * SERVER-SIDE paging, sorting and filtering — a genuinely new pattern in this codebase,
 * and the one place M1's approach cannot be reused. Every list in Milestone 1 loads all
 * its rows and paginates in the browser, which is right at master-data scale and wrong
 * here: Expenditure Detail is fund x function x object x cost centre x project, tens of
 * thousands of rows per district-month. `usePagination`, `useSort` and the client-side
 * CSV export do not transfer, and reaching for them is the trap.
 *
 * State lives in the URL rather than React state, which is what lets the export route and
 * the page share one query builder and therefore never disagree about what "the rows you
 * are looking at" means.
 */

/**
 * How a `code` field's id turns back into the code a district typed.
 *
 * Derived from the registry's `resolvesTo` rather than listed per dataset, so a new field
 * gets its column for free. The code column differs per model because M1 named them
 * before there was a convention — School has schoolNumber, Project has projectNumber.
 */
const RELATION: Record<
  ResolveTarget,
  { rel: string; codeField: string; nameField: string }
> = {
  fund: { rel: "fund", codeField: "code", nameField: "name" },
  revenueSource: { rel: "revenueSource", codeField: "code", nameField: "name" },
  function: { rel: "function", codeField: "code", nameField: "name" },
  object: { rel: "object", codeField: "code", nameField: "name" },
  costCenter: { rel: "costCenter", codeField: "schoolNumber", nameField: "name" },
  project: { rel: "project", codeField: "projectNumber", nameField: "name" },
  status: { rel: "status", codeField: "name", nameField: "name" },
};

export interface BrowseColumn {
  /** Sort key and URL parameter. */
  key: string;
  label: string;
  type: "code" | "text" | "amount" | "date";
  /** True when this column is a relation and sorts by the related code. */
  relation?: string;
}

/** The columns for a dataset, in registry order. */
export function browseColumns(slug: DatasetSlug): BrowseColumn[] {
  const def = datasetDef(slug);
  return def.fields.map((f): BrowseColumn => {
    if (f.type !== "code") return { key: f.name, label: f.label, type: f.type };
    return {
      key: f.name,
      label: f.label,
      type: "code",
      relation: RELATION[f.resolvesTo!].rel,
    };
  });
}

/** Everything a row needs to render its columns, without a query per row. */
export function browseInclude(slug: DatasetSlug): Record<string, unknown> {
  const def = datasetDef(slug);
  const include: Record<string, unknown> = {};

  for (const f of def.fields) {
    if (f.type !== "code") continue;
    const r = RELATION[f.resolvesTo!];
    include[r.rel] = { select: { [r.codeField]: true, [r.nameField]: true } };
  }
  return include;
}

/**
 * Reads one cell, from a row loaded with `browseInclude`.
 *
 * Two callers, two contracts, one function so they can never disagree about WHICH rows and
 * columns they are reading:
 *
 *   - the CSV export takes the default, `display: false`, and gets bare digits. Master
 *     data's round-trip rule is that numbers export unadorned (1000, not $1,000) so a
 *     district can edit the file and import it straight back.
 *   - the screen passes `display: true` and gets the same currency format as every other
 *     figure in the product — grouped, with a dollar sign, and with cents only where there
 *     are cents. "426845120.00" in a ledger column is a number the reader has to count.
 *
 * THE SAME SPLIT NOW DECIDES WHETHER A DIMENSION CARRIES ITS NAME, and for the same reason.
 * The screen shows `1000 — General Fund`, per the client's §10: this page was the last place
 * in the product still rendering bare codes, with the name hidden in a `title`, and "the
 * name is one hover away from every one of eight columns" is not the same as showing it.
 * The EXPORT still gets the bare code — it is a file a district edits and imports straight
 * back, and `1000 — General Fund` in a Fund Code column would not resolve on the way in.
 */
export function cellOf(
  slug: DatasetSlug,
  row: Record<string, unknown>,
  col: BrowseColumn,
  opts: { display?: boolean; mode?: LabelMode } = {},
): string {
  const def = datasetDef(slug);
  const field = def.fields.find((f) => f.name === col.key);

  if (col.relation) {
    const rel = row[col.relation] as Record<string, unknown> | null;
    if (!rel) return "";
    const target = RELATION[field!.resolvesTo!];
    const code = String(rel[target.codeField] ?? "");
    // `status` resolves against a lookup whose code IS its name (see RELATION above), so
    // there is no second half to add and `codeName` would render "PENDING — Pending".
    if (!opts.display || target.codeField === target.nameField) return code;
    return codeName(code, String(rel[target.nameField] ?? ""), opts.mode ?? DEFAULT_LABEL_MODE);
  }

  const v = row[col.key];
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);

  if (col.type === "amount") {
    const d = v as { toFixed?: (n: number) => string };
    if (typeof d.toFixed !== "function") return String(v);
    // On screen: the product's currency format. `money` reads the Decimal structurally, so
    // the exact value reaches the formatter without a float round-trip.
    if (opts.display) return money(d as Parameters<typeof money>[0]);
    // In the export: two fixed decimal places. Decimal.toString() drops trailing zeros —
    // 99000.00 comes back as "99000" — and a column where some rows carry cents and others
    // don't reads as though the data itself is inconsistent.
    return d.toFixed(2);
  }

  return String(v);
}

/**
 * The cell's tooltip — always the FULL `Code — Name`, whatever the cell itself shows.
 *
 * The client's rule (c) on dimension fields: "On hover, display the full Code – Name." So
 * this is not "the half the cell left out" — a reader on Codes Only who hovers wants the
 * name, and a reader whose column ellipsised wants the rest of it, and one string answers
 * both. It returns null only when there is nothing more to say than the cell already does.
 */
export function nameOf(slug: DatasetSlug, row: Record<string, unknown>, col: BrowseColumn): string | null {
  if (!col.relation) return null;
  const rel = row[col.relation] as Record<string, unknown> | null;
  if (!rel) return null;

  const field = datasetDef(slug).fields.find((f) => f.name === col.key);
  const target = RELATION[field!.resolvesTo!];
  if (target.codeField === target.nameField) return null;

  return codeName(String(rel[target.codeField] ?? ""), String(rel[target.nameField] ?? "")) || null;
}

// ===================== the query =====================

export interface BrowseQuery {
  slug: DatasetSlug;
  versionId: string;
  /** Free text over the code columns. */
  q?: string;
  sort?: string;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export const PAGE_SIZE = 50;
/** The export's ceiling, matching the audit log's. */
export const EXPORT_LIMIT = 50_000;

/**
 * Sorting, in SQL rather than in `lib/sort.ts`.
 *
 * The visible rules stay the same — the district should not notice a different engine —
 * so blanks sink to the bottom in both directions, via NULLS LAST. What cannot be carried
 * over is `lib/sort.ts`'s numeric-aware collation: Postgres would need a custom collation
 * to put "Fund 2" before "Fund 10". Codes in a chart of accounts are fixed-width and
 * zero-padded, so plain ordering agrees with natural ordering for the data this actually
 * sorts.
 */
/** The orderBy clause for one column, respecting how its model actually names its code. */
function orderByColumn(slug: DatasetSlug, key: string, dir: "asc" | "desc") {
  const field = datasetDef(slug).fields.find((f) => f.name === key);

  if (field?.type === "code" && field.resolvesTo) {
    const target = RELATION[field.resolvesTo];
    // NOT `code`: M1 named these before there was a convention, so School has
    // schoolNumber and Grant has grantId. Reading the code field from RELATION rather
    // than assuming it is what keeps this honest.
    return { [target.rel]: { [target.codeField]: dir } };
  }

  // `nulls: "last"` is only accepted on a NULLABLE column — Prisma rejects the object
  // form outright on a required one. Prisma 7's client exposes no DMMF to ask, so
  // requiredness stands in for nullability: across all six datasets, exactly the
  // `optional` scalars are nullable, while `required` and `calculated` are not.
  //
  // That correspondence is asserted by verify:browse, which sorts every column of every
  // dataset — so a field that becomes nullable without its requiredness changing fails
  // loudly rather than at 2am on a district's ledger.
  if (field?.requiredness === "optional") {
    // Blanks sink to the bottom in BOTH directions, matching lib/sort.ts. Postgres would
    // otherwise put NULLs first on a descending sort and bury the rows the district
    // actually wants under a wall of dashes.
    return { [key]: { sort: dir, nulls: "last" } };
  }

  return { [key]: dir };
}

function orderByOf(slug: DatasetSlug, sort: string | undefined, dir: "asc" | "desc") {
  const cols = browseColumns(slug);
  const col = cols.find((c) => c.key === sort);

  // Default: the grain, in order — the closest thing to "how the file was written".
  if (!col) return datasetDef(slug).grain.map((g) => orderByColumn(slug, g, "asc"));

  return [orderByColumn(slug, col.key, dir)];
}

function whereOf(slug: DatasetSlug, versionId: string, q: string | undefined) {
  const where: Record<string, unknown> = { versionId };
  if (!q?.trim()) return where;

  // Search the codes, because that is what a district knows a row by. Amounts are not
  // searched: "5000" would match a budget, an actual and an encumbrance, and the district
  // meant the fund.
  const term = q.trim();
  const cols = browseColumns(slug).filter((c) => c.type === "code");
  const or: Record<string, unknown>[] = [];

  for (const c of cols) {
    const field = datasetDef(slug).fields.find((f) => f.name === c.key)!;
    const target = RELATION[field.resolvesTo!];
    or.push({ [c.relation!]: { [target.codeField]: { contains: term, mode: "insensitive" } } });
    or.push({ [c.relation!]: { [target.nameField]: { contains: term, mode: "insensitive" } } });
  }

  where.OR = or;
  return where;
}

export interface BrowseResult {
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pageCount: number;
  columns: BrowseColumn[];
}

export async function browse(db: TenantDb, query: BrowseQuery): Promise<BrowseResult> {
  const model = datasetDef(query.slug).model;
  const pageSize = query.pageSize ?? PAGE_SIZE;
  const page = Math.max(1, query.page ?? 1);
  const where = whereOf(query.slug, query.versionId, query.q);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = (db as any)[model];
  const [total, rows] = await Promise.all([
    delegate.count({ where }),
    delegate.findMany({
      where,
      include: browseInclude(query.slug),
      orderBy: orderByOf(query.slug, query.sort, query.dir ?? "asc"),
      // The whole point: the database returns one page, not 50,000 rows for the browser
      // to throw away.
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return { rows, total, page: Math.min(page, pageCount), pageCount, columns: browseColumns(query.slug) };
}

/** The same rows the page shows, unpaginated, for the export. */
export async function browseAll(
  db: TenantDb,
  query: Omit<BrowseQuery, "page" | "pageSize">,
): Promise<Record<string, unknown>[]> {
  const model = datasetDef(query.slug).model;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (db as any)[model].findMany({
    where: whereOf(query.slug, query.versionId, query.q),
    include: browseInclude(query.slug),
    orderBy: orderByOf(query.slug, query.sort, query.dir ?? "asc"),
    take: EXPORT_LIMIT,
  });
}
