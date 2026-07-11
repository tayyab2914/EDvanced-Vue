import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { csvEscape } from "@/lib/csv";
import type { Prisma } from "@/lib/generated/prisma/client";

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

export interface AuditFilters {
  districtId?: string; // hard scope (district pages always pass this)
  q?: string; // search on action / entity
  days?: number; // last N days (0 / undefined = all time)
  actorUserId?: string;
  action?: string;
  take?: number;
}

function auditWhere(f: AuditFilters): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};
  if (f.districtId) where.districtId = f.districtId;
  if (f.days && f.days > 0) {
    where.createdAt = { gte: new Date(Date.now() - f.days * 86_400_000) };
  }
  if (f.actorUserId) where.actorUserId = f.actorUserId;
  if (f.action) where.action = f.action;
  if (f.q) {
    where.OR = [
      { action: { contains: f.q, mode: "insensitive" } },
      { entityType: { contains: f.q, mode: "insensitive" } },
    ];
  }
  return where;
}

/** Reads audit entries matching the filters and resolves actor/district labels. */
export async function getAuditRows(f: AuditFilters): Promise<AuditRowData[]> {
  const logs = await prisma.auditLog.findMany({
    where: auditWhere(f),
    orderBy: { createdAt: "desc" },
    take: f.take ?? 200,
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
      select: { id: true, name: true, email: true },
    }),
    prisma.district.findMany({
      where: { id: { in: districtIds } },
      select: { id: true, name: true },
    }),
  ]);
  const actorMap = new Map(actors.map((a) => [a.id, a.name || a.email]));
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

/** Thin wrapper kept for the dashboard's recent-activity list. */
export function getRecentAuditRows(opts: {
  districtId?: string;
  take?: number;
}): Promise<AuditRowData[]> {
  return getAuditRows(opts);
}

export interface AuditFilterOptions {
  actions: string[];
  actors: { id: string; label: string }[];
  districts: { id: string; name: string }[];
}

/** Distinct actions / actors (and districts, platform-only) for the filter dropdowns. */
export async function getAuditFilterOptions(opts: {
  districtId?: string;
  platform: boolean;
}): Promise<AuditFilterOptions> {
  const scope: Prisma.AuditLogWhereInput = opts.districtId
    ? { districtId: opts.districtId }
    : {};

  const [actionRows, actorRows, districts] = await Promise.all([
    prisma.auditLog.findMany({
      where: scope,
      select: { action: true },
      distinct: ["action"],
      orderBy: { action: "asc" },
    }),
    prisma.auditLog.findMany({
      where: { ...scope, actorUserId: { not: null } },
      select: { actorUserId: true },
      distinct: ["actorUserId"],
    }),
    opts.platform
      ? prisma.district.findMany({
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const actorIds = actorRows.map((r) => r.actorUserId!).filter(Boolean);
  const actorUsers = await prisma.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  return {
    actions: actionRows.map((a) => a.action),
    actors: actorUsers.map((u) => ({
      id: u.id,
      label: `${u.name} (${u.email})`,
    })),
    districts,
  };
}

/** Serializes audit rows to CSV (opens in Excel). */
export function auditRowsToCsv(rows: AuditRowData[]): string {
  const header = ["When", "Action", "District", "Actor", "Entity"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.createdAt.toISOString(),
        r.action,
        r.districtLabel ?? "",
        r.actorLabel,
        r.entityType ?? "",
      ]
        .map((v) => csvEscape(String(v)))
        .join(","),
    );
  }
  return lines.join("\n");
}
