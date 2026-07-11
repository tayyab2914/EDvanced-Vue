import { requirePermission } from "@/lib/auth/dal";
import { getAuditRows, auditRowsToCsv } from "@/lib/audit";

export async function GET(req: Request) {
  const me = await requirePermission("view_audit");
  if (!me.districtId) return new Response("Not found", { status: 404 });

  const sp = new URL(req.url).searchParams;
  const rows = await getAuditRows({
    districtId: me.districtId, // hard-scoped to the caller's district
    q: sp.get("q") || undefined,
    days: sp.get("days") ? Number(sp.get("days")) : 30,
    actorUserId: sp.get("user") || undefined,
    action: sp.get("action") || undefined,
    take: 10_000,
  });
  return new Response(auditRowsToCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="audit-log.csv"',
    },
  });
}
