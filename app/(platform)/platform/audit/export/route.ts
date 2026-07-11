import { requireRole } from "@/lib/auth/dal";
import { getAuditRows, auditRowsToCsv } from "@/lib/audit";
import { Role } from "@/lib/enums";

export async function GET(req: Request) {
  await requireRole(Role.PLATFORM_ADMIN);
  const sp = new URL(req.url).searchParams;
  const rows = await getAuditRows({
    districtId: sp.get("district") || undefined,
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
