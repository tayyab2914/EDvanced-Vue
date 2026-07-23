import { handleDashboardExport } from "@/lib/export/route-handler";

/** Excel (default) or CSV of this dashboard, at the scope in the query string. */
export async function GET(request: Request) {
  return handleDashboardExport(request, "cash");
}
