import type { TenantDb } from "@/lib/tenant-db";
import type { DatasetSlug } from "@/lib/datasets/kinds";
import { datasetDef } from "@/lib/datasets/registry";
import type { ResolveTarget } from "@/lib/datasets/fields";

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

/** Reads one cell for display, from a row loaded with `browseInclude`. */
export function cellOf(slug: DatasetSlug, row: Record<string, unknown>, col: BrowseColumn): string {
  const def = datasetDef(slug);
  const field = def.fields.find((f) => f.name === col.key);

  if (col.relation) {
    const rel = row[col.relation] as Record<string, unknown> | null;
    if (!rel) return "";
    const target = RELATION[field!.resolvesTo!];
    return String(rel[target.codeField] ?? "");
  }

  const v = row[col.key];
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);

  if (col.type === "amount") {
    // Decimal.toString() drops trailing zeros — $99,000.00 comes back as "99000". In a
    // finance ledger cents are not decoration: a column where some rows show cents and
    // others don't reads as though the data is inconsistent.
    //
    // Plain digits, not a currency format: this same function feeds the CSV export, and
    // master-data's round-trip rule is that numbers export bare (1000, not $1,000) so the
    // file can be edited and imported straight back.
    const d = v as { toFixed?: (n: number) => string };
    return typeof d.toFixed === "function" ? d.toFixed(2) : String(v);
  }

  return String(v);
}

/** The name beside a code, for the row's title attribute — context without a wider table. */
export function nameOf(slug: DatasetSlug, row: Record<string, unknown>, col: BrowseColumn): string | null {
  if (!col.relation) return null;
  const rel = row[col.relation] as Record<string, unknown> | null;
  return rel ? String(rel.name ?? "") || null : null;
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
