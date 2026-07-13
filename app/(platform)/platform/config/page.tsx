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
    orderBy: Array<
      { code: { sort: "asc"; nulls: "last" } } | { name: "asc" }
    >;
    select: Record<string, true>;
  }): Promise<ConfigRow[]>;
}

export default async function ConfigPage() {
  await requireRole(Role.PLATFORM_ADMIN);

  // One server render loads every list in parallel; the client then switches
  // tabs, edits, cancels, and searches with no further server round-trips.
  const results = await Promise.all(
    CONFIG_KINDS.map((k) => {
      const def = CONFIG_RESOURCES[k];
      return (prisma as unknown as Record<string, LookupReadDelegate>)[
        def.model
      ].findMany({
        // Code ascending; rows without a code fall to the bottom, ordered by name.
        orderBy: [{ code: { sort: "asc", nulls: "last" } }, { name: "asc" }],
        select: {
          id: true,
          code: true,
          name: true,
          active: true,
          ...(def.categoryField ? { category: true } : {}),
        },
      });
    }),
  );

  const lists = Object.fromEntries(
    CONFIG_KINDS.map((k, i) => [k, results[i]]),
  ) as Record<ConfigKind, ConfigRow[]>;

  return <ConfigManager lists={lists} />;
}
