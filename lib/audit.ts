import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";

export interface AuditEntry {
  action: string;
  districtId?: string | null;
  actorUserId?: string | null;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Appends an entry to the audit trail. Captures IP / user-agent from the request
 * when available. Never throws into the caller — a failed audit write must not
 * break the user action, but it is logged for investigation.
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  let ipAddress: string | undefined;
  let userAgent: string | undefined;
  try {
    const h = await headers();
    userAgent = h.get("user-agent") ?? undefined;
    ipAddress = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
  } catch {
    // Called outside a request scope (e.g. a script) — no request metadata.
  }

  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        districtId: entry.districtId ?? null,
        actorUserId: entry.actorUserId ?? null,
        entityType: entry.entityType,
        entityId: entry.entityId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        metadata: (entry.metadata as any) ?? undefined,
        ipAddress,
        userAgent,
      },
    });
  } catch (err) {
    console.error("[audit] failed to write audit log:", err);
  }
}

export interface AuditRowData {
  id: string;
  action: string;
  entityType: string | null;
  actorLabel: string;
  districtLabel: string | null;
  createdAt: Date;
}

/** Reads recent audit entries and resolves actor/district labels. Scope to a district by id. */
export async function getRecentAuditRows(opts: {
  districtId?: string;
  take?: number;
}): Promise<AuditRowData[]> {
  const logs = await prisma.auditLog.findMany({
    where: opts.districtId ? { districtId: opts.districtId } : undefined,
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 200,
    select: {
      id: true,
      action: true,
      entityType: true,
      actorUserId: true,
      districtId: true,
      metadata: true,
      createdAt: true,
    },
  });

  const actorIds = [
    ...new Set(logs.map((l) => l.actorUserId).filter(Boolean) as string[]),
  ];
  const districtIds = [
    ...new Set(logs.map((l) => l.districtId).filter(Boolean) as string[]),
  ];
  const [actors, districts] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, email: true },
    }),
    prisma.district.findMany({
      where: { id: { in: districtIds } },
      select: { id: true, name: true },
    }),
  ]);
  const actorMap = new Map(actors.map((a) => [a.id, a.email]));
  const districtMap = new Map(districts.map((d) => [d.id, d.name]));

  return logs.map((l) => {
    const meta = (l.metadata ?? {}) as { email?: string };
    return {
      id: l.id,
      action: l.action,
      entityType: l.entityType,
      actorLabel: l.actorUserId
        ? (actorMap.get(l.actorUserId) ?? "—")
        : (meta.email ?? "system"),
      districtLabel: l.districtId
        ? (districtMap.get(l.districtId) ?? "—")
        : null,
      createdAt: l.createdAt,
    };
  });
}
