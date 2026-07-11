import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/db";
import { ConfigManager } from "@/components/config/config-manager";
import {
  CONFIG_KINDS,
  CONFIG_RESOURCES,
  type ConfigKind,
  type ConfigRow,
} from "@/lib/config/registry";
import { Role } from "@/lib/enums";

interface LookupReadDelegate {
  findMany(args: {
    orderBy: Array<{ sortOrder: "asc" } | { name: "asc" }>;
    select: { id: true; name: true; active: true };
  }): Promise<ConfigRow[]>;
}

export default async function ConfigPage() {
  await requireRole(Role.PLATFORM_ADMIN);

  // One server render loads every list in parallel; the client then switches
  // tabs, edits, cancels, and searches with no further server round-trips.
  const results = await Promise.all(
    CONFIG_KINDS.map((k) =>
      (prisma as unknown as Record<string, LookupReadDelegate>)[
        CONFIG_RESOURCES[k].model
      ].findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, active: true },
      }),
    ),
  );

  const lists = Object.fromEntries(
    CONFIG_KINDS.map((k, i) => [k, results[i]]),
  ) as Record<ConfigKind, ConfigRow[]>;

  return <ConfigManager lists={lists} />;
}
