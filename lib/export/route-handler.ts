import "server-only";
import { getTenantDb, userCan } from "@/lib/auth/dal";
import { resolveScope } from "@/lib/dashboard/scope";
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

  const scope = await resolveScope(db, districtId, {
    fy: url.searchParams.get("fy") ?? undefined,
    period: url.searchParams.get("period") ?? undefined,
    fund: url.searchParams.get("fund") ?? undefined,
  });

  if (scope.empty) {
    return new Response("This district has no committed data to export.", { status: 404 });
  }

  const sheets = await buildDashboardSheets(db, districtId, scope, kind);
  const scopeLabel = `${scope.fiscalYear}-p${scope.period}${scope.fund ? `-${scope.fund.code}` : ""}`;

  await writeAudit({
    action: "DASHBOARD_EXPORTED",
    actorUserId: user.id,
    districtId,
    entityType: "Dashboard export",
    entityId: kind,
    metadata: { kind, format, fiscalYear: scope.fiscalYear, period: scope.period, fundId: scope.fundId },
  });

  if (format === "csv") {
    return new Response(sheetsToCsv(sheets), {
      headers: downloadHeaders(exportFilename(kind, scopeLabel, "csv"), "csv"),
    });
  }

  const buffer = await buildWorkbook({
    title: TITLES[kind],
    district: user.districtName ?? "District",
    scope: `${scope.label}${scope.fund ? ` · ${scope.fund.name}` : " · All funds"}`,
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
