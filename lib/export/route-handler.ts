import "server-only";
import { getTenantDb, userCan } from "@/lib/auth/dal";
import { resolveScope } from "@/lib/dashboard/scope";
import { ALL_FILTER_PARAMS } from "@/lib/dashboard/filter-params";
import { scopeDescription } from "@/lib/dashboard/options";
import { buildDashboardSheets, sheetsToCsv, type DashboardKind } from "@/lib/export/dashboard-export";
import { buildWorkbook, downloadHeaders, exportFilename } from "@/lib/export/workbook";
import { writeAudit } from "@/lib/audit";

/**
 * One handler behind all five dashboard export routes.
 *
 * Two things it does that the existing audit-log export does not, both deliberate:
 *
 *   1. It CHECKS `export_data`. The audit export checks only that the user reached the
 *      page, which is fine there and would not be here — an export route is reachable
 *      directly by URL.
 *   2. It never `redirect()`s. A redirect from a Route Handler answers a download link
 *      with an HTML page, so a district clicking Export gets their dashboard's markup in a
 *      file called `revenues.xlsx`. Refusals return a status code instead.
 */
export async function handleDashboardExport(
  request: Request,
  kind: DashboardKind,
): Promise<Response> {
  const { db, user, districtId } = await getTenantDb();

  if (!userCan(user, "export_data") || !userCan(user, "view_dashboards")) {
    return new Response("You do not have permission to export this data.", { status: 403 });
  }

  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";

  /**
   * Every scope parameter the dashboards use, read straight off the URL.
   *
   * Enumerated from `FILTER_PARAMS` rather than listed by hand: this route and the page
   * must resolve the SAME slice, and a hand-written list is how an export quietly stops
   * honouring a filter the screen added — the download then disagrees with the dashboard
   * it was taken from, which is the one thing an export must never do.
   */
  const params: Record<string, string | undefined> = {};
  for (const key of ALL_FILTER_PARAMS) {
    params[key] = url.searchParams.get(key) ?? undefined;
  }

  const scope = await resolveScope(db, districtId, params);

  if (scope.empty) {
    return new Response("This district has no committed data to export.", { status: 404 });
  }

  const sheets = await buildDashboardSheets(db, districtId, scope, kind);
  const scopeLabel = `${scope.fiscalYear}-p${scope.period}${scope.fund ? `-${scope.fund.code}` : ""}${
    !scope.fund && scope.filters.active ? "-filtered" : ""
  }`;

  await writeAudit({
    action: "DASHBOARD_EXPORTED",
    actorUserId: user.id,
    districtId,
    entityType: "Dashboard export",
    entityId: kind,
    // The whole slice, not just the fund: an auditor asking "what did this person
    // download" needs the filter that produced it, and a multi-fund export is no longer
    // describable by one id.
    metadata: {
      kind,
      format,
      fiscalYear: scope.fiscalYear,
      period: scope.period,
      filters: scope.filters.chips.map((c) => `${c.dimension}: ${c.values.join(", ")}`),
    },
  });

  if (format === "csv") {
    return new Response(sheetsToCsv(sheets), {
      headers: downloadHeaders(exportFilename(kind, scopeLabel, "csv"), "csv"),
    });
  }

  const buffer = await buildWorkbook({
    title: TITLES[kind],
    district: user.districtName ?? "District",
    // The workbook's header line names the slice in full, so a file that leaves someone's
    // inbox still says what it is scoped to.
    scope: `${scope.label} · ${scopeDescription(scope)}`,
    sheets,
  });

  return new Response(new Uint8Array(buffer), {
    headers: downloadHeaders(exportFilename(kind, scopeLabel, "xlsx"), "xlsx"),
  });
}

const TITLES: Record<DashboardKind, string> = {
  dashboard: "Executive Dashboard",
  revenues: "Revenue Dashboard",
  expenditures: "Expenditures Dashboard",
  "fund-balance": "Fund Balance",
  cash: "Cash Position",
};
