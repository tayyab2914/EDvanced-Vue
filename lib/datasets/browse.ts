import type { TenantDb } from "@/lib/tenant-db";
import type { DatasetSlug } from "@/lib/datasets/kinds";
import { datasetDef } from "@/lib/datasets/registry";
import type { ResolveTarget } from "@/lib/datasets/fields";
import { money } from "@/lib/dashboard/format";
import { codeName, DEFAULT_LABEL_MODE, type LabelMode } from "@/lib/text";

/** The URL prefix a column filter travels under: `?f_fundId=1000`. */
export const FILTER_PREFIX = "f_";

/** Pulls the `f_*` params out of a query string into the shape `browse` takes. */
export function filtersFromParams(sp: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (k.startsWith(FILTER_PREFIX) && v) out[k.slice(FILTER_PREFIX.length)] = v;
  }
  return out;
}

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
  {
    /** The RELATION FIELD on the detail row — what `include` and `where` traverse. */
    rel: string;
    /**
     * The Prisma DELEGATE the lookup itself lives on — what `db[...]` indexes.
     *
     * Not the same string as `rel`, and assuming it was is a silent break rather than a type
     * error: a detail row's `function` relation points at AccountFunction, and a cost centre
     * is a School. Only `browseFilters` reads the lookup table directly, which is why this
     * distinction had nowhere to surface before.
     */
    model: string;
    codeField: string;
    nameField: string;
  }
> = {
  fund: { rel: "fund", model: "fund", codeField: "code", nameField: "name" },
  revenueSource: { rel: "revenueSource", model: "revenueSource", codeField: "code", nameField: "name" },
  function: { rel: "function", model: "accountFunction", codeField: "code", nameField: "name" },
  object: { rel: "object", model: "accountObject", codeField: "code", nameField: "name" },
  costCenter: { rel: "costCenter", model: "school", codeField: "schoolNumber", nameField: "name" },
  project: { rel: "project", model: "project", codeField: "projectNumber", nameField: "name" },
  status: { rel: "status", model: "status", codeField: "name", nameField: "name" },
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
  /**
   * Exact-match narrowing, keyed by column and valued by the district's own CODE.
   *
   * Distinct from `q` and not a nicer spelling of it. Search is a fuzzy sweep across every
   * dimension at once — useful for finding a row, useless for validating a figure, because
   * "1000" also matches object 1000 and the totals underneath it then sum a set nobody
   * asked for. A filter names the column, so `fundId=1000` is the General Fund and nothing
   * else, and the totals row beneath it is a number a district can tie back to its ledger.
   *
   * Codes rather than ids so the URL a district bookmarks or sends to a colleague still
   * reads as their chart of accounts, and so it survives a re-import that reissues ids.
   */
  filters?: Record<string, string>;
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

function whereOf(
  slug: DatasetSlug,
  versionId: string,
  q: string | undefined,
  filters?: Record<string, string>,
) {
  const where: Record<string, unknown> = { versionId };
  const cols = browseColumns(slug).filter((c) => c.type === "code");

  // The filters first: each names one column, so they AND with each other and with the
  // search below. An unknown key or a blank value is dropped rather than matched against —
  // a stale URL should show the district everything, never nothing.
  for (const [key, value] of Object.entries(filters ?? {})) {
    if (!value) continue;
    const col = cols.find((c) => c.key === key);
    if (!col) continue;
    const field = datasetDef(slug).fields.find((f) => f.name === col.key)!;
    const target = RELATION[field.resolvesTo!];
    where[col.relation!] = { [target.codeField]: value };
  }

  if (!q?.trim()) return where;

  // Search the codes, because that is what a district knows a row by. Amounts are not
  // searched: "5000" would match a budget, an actual and an encumbrance, and the district
  // meant the fund.
  const term = q.trim();
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

// ===================== totals =====================

/** The money columns of a dataset — everything a totals row can meaningfully add up. */
export function amountColumns(slug: DatasetSlug): BrowseColumn[] {
  return browseColumns(slug).filter((c) => c.type === "amount");
}

/**
 * The SUM of every amount column over the WHOLE filtered set — not the page on screen.
 *
 * This is the figure that made the browse screen unusable for checking anything. A district
 * validating a dashboard number against the file behind it could sort and search its way to
 * the right fifty rows and then had to export to add them up, because the only totals in the
 * product were on the dashboards themselves — which is the number they were trying to check.
 * Summing the visible page instead would be worse than nothing: fifty rows of a
 * ten-thousand-row fund, labelled "Total".
 *
 * One `aggregate` on the same `where` the rows came from, so the two cannot disagree.
 */
export async function browseTotals(
  db: TenantDb,
  query: Omit<BrowseQuery, "page" | "pageSize" | "sort" | "dir">,
): Promise<Record<string, string>> {
  const cols = amountColumns(query.slug);
  if (cols.length === 0) return {};

  const model = datasetDef(query.slug).model;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agg = await (db as any)[model].aggregate({
    where: whereOf(query.slug, query.versionId, query.q, query.filters),
    _sum: Object.fromEntries(cols.map((c) => [c.key, true])),
  });

  const sums = (agg?._sum ?? {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const c of cols) {
    const v = sums[c.key] as { toFixed?: (n: number) => string } | null | undefined;
    // Null when the filtered set is empty — a district that filtered to nothing should read
    // a dash, not "$0.00", which is a claim about money that does not exist.
    out[c.key] = v && typeof v.toFixed === "function" ? money(v as Parameters<typeof money>[0]) : "";
  }
  return out;
}

// ===================== filter options =====================

export interface BrowseFilterOption {
  /** The district's own code — what travels in the URL. */
  value: string;
  label: string;
}

export interface BrowseFilterDef {
  key: string;
  label: string;
  options: BrowseFilterOption[];
}

/**
 * The values each dimension column actually TAKES in this version, for the filter dropdowns.
 *
 * Derived from the rows rather than from the master-data tables on purpose. A district's
 * chart of accounts carries every code it has ever used; one month's file uses a fraction of
 * them, and a dropdown offering four hundred projects of which nine appear is a list the
 * district has to search rather than a filter it can use. Every option here returns rows.
 *
 * Two rounds of queries, both parallel within themselves: one `groupBy` per dimension column
 * to learn which ids occur, then one read per distinct lookup table to name them.
 */
export async function browseFilters(
  db: TenantDb,
  slug: DatasetSlug,
  versionId: string,
  mode: LabelMode = DEFAULT_LABEL_MODE,
): Promise<BrowseFilterDef[]> {
  const cols = browseColumns(slug).filter((c) => c.type === "code");
  if (cols.length === 0) return [];

  const model = datasetDef(slug).model;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = (db as any)[model];

  const groups = await Promise.all(
    cols.map((c) => delegate.groupBy({ by: [c.key], where: { versionId } })),
  );

  // Which lookup table each column reads, and every id this version referenced in it.
  const targets = new Map<ResolveTarget, Set<string>>();
  const idsByColumn = new Map<string, string[]>();

  cols.forEach((c, i) => {
    const field = datasetDef(slug).fields.find((f) => f.name === c.key)!;
    const target = field.resolvesTo!;
    const ids = (groups[i] as Record<string, unknown>[])
      .map((g) => g[c.key])
      .filter((v): v is string => typeof v === "string" && v.length > 0);

    idsByColumn.set(c.key, ids);
    const seen = targets.get(target) ?? new Set<string>();
    ids.forEach((id) => seen.add(id));
    targets.set(target, seen);
  });

  const targetList = [...targets.entries()];
  const resolved = await Promise.all(
    targetList.map(([target, ids]) => {
      const r = RELATION[target];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (db as any)[r.model].findMany({
        where: { id: { in: [...ids] } },
        select: { id: true, [r.codeField]: true, [r.nameField]: true },
      });
    }),
  );

  const namesByTarget = new Map<ResolveTarget, Map<string, BrowseFilterOption>>();
  targetList.forEach(([target], i) => {
    const r = RELATION[target];
    const map = new Map<string, BrowseFilterOption>();
    for (const row of resolved[i] as Record<string, unknown>[]) {
      const code = String(row[r.codeField] ?? "");
      if (!code) continue;
      const name = String(row[r.nameField] ?? "");
      map.set(String(row.id), {
        value: code,
        label: r.codeField === r.nameField ? code : codeName(code, name, mode),
      });
    }
    namesByTarget.set(target, map);
  });

  return cols.map((c) => {
    const field = datasetDef(slug).fields.find((f) => f.name === c.key)!;
    const lookup = namesByTarget.get(field.resolvesTo!) ?? new Map<string, BrowseFilterOption>();
    const options = (idsByColumn.get(c.key) ?? [])
      .map((id) => lookup.get(id))
      .filter((o): o is BrowseFilterOption => Boolean(o))
      // Codes in a chart of accounts are zero-padded, so plain ordering IS natural
      // ordering — the same argument `orderByColumn` above makes about sorting.
      .sort((a, b) => a.value.localeCompare(b.value));

    return { key: c.key, label: c.label, options };
  });
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
  const where = whereOf(query.slug, query.versionId, query.q, query.filters);

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
    where: whereOf(query.slug, query.versionId, query.q, query.filters),
    include: browseInclude(query.slug),
    orderBy: orderByOf(query.slug, query.sort, query.dir ?? "asc"),
    take: EXPORT_LIMIT,
  });
}
