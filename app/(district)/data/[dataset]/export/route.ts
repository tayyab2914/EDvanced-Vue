import { getTenantDb } from "@/lib/auth/dal";
import { datasetBySlug } from "@/lib/datasets/kinds";
import { browseAll, browseColumns, cellOf, EXPORT_LIMIT } from "@/lib/datasets/browse";
import { csvEscape } from "@/lib/csv";
import type { DatasetKind } from "@/lib/enums";

/**
 * Server-side CSV export of committed periodic data.
 *
 * Modelled on the audit log's export route, NOT master-data's. Master-data exports from
 * rows already in the browser, which works because those tables load everything up front.
 * Expenditure Detail cannot, so the file is built here.
 *
 * Two rules carried over from the audit route, and both matter:
 *   - filters come from searchParams, so the file matches the screen exactly;
 *   - the tenant scope comes from the SESSION and never from the query string.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ dataset: string }> },
) {
  const { dataset } = await params;
  const meta = datasetBySlug(dataset);
  if (!meta) return new Response("Not found", { status: 404 });

  // getTenantDb resolves the district from the session — a caller cannot ask for another
  // district's rows by editing the URL.
  const { db } = await getTenantDb();

  const sp = new URL(req.url).searchParams;
  const fiscalYear = sp.get("fy") ?? "";
  const rawPeriod = sp.get("period");
  const period = rawPeriod === null || rawPeriod === "" ? null : Number(rawPeriod);

  const version = await db.datasetVersion.findFirst({
    where: {
      dataset: meta.kind as DatasetKind,
      fiscalYear,
      period,
      isCurrent: true,
    },
  });
  if (!version) return new Response("No data for that period", { status: 404 });

  const rows = await browseAll(db, {
    slug: meta.slug,
    versionId: version.id,
    q: sp.get("q") || undefined,
    sort: sp.get("sort") || undefined,
    dir: sp.get("dir") === "desc" ? "desc" : "asc",
  });

  const columns = browseColumns(meta.slug);
  const lines = [columns.map((c) => csvEscape(c.label)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => csvEscape(cellOf(meta.slug, row, c))).join(","));
  }
  // Deliberately no UTF-8 BOM, matching lib/csv-export.ts: Excel would like one, but it
  // corrupts the first header on re-import, and these files round-trip.
  const csv = lines.join("\n");

  const suffix = period === null ? fiscalYear : `${fiscalYear}-p${period}`;
  const truncated = rows.length >= EXPORT_LIMIT;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${meta.slug}-${suffix}.csv"`,
      // Silent truncation reads as "you have all of it". Say so in a header the client
      // can surface rather than pretending 50,000 rows was the whole file.
      ...(truncated ? { "X-Export-Truncated": String(EXPORT_LIMIT) } : {}),
    },
  });
}
