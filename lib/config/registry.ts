// Platform-managed global lookup lists (Tier 1). Each entry maps a URL slug to its
// Prisma model delegate and labels. These are NOT district-scoped — Platform Admins
// manage one shared set for the whole platform.

export type ConfigKind =
  | "fund-types"
  | "revenue-types"
  | "object-types"
  | "function-types"
  | "statuses";

export interface ConfigDef {
  kind: ConfigKind;
  model: "fundType" | "revenueType" | "objectType" | "functionType" | "status";
  title: string;
  singular: string;
  description: string;
}

export interface ConfigRow {
  id: string;
  name: string;
  active: boolean;
}

export const CONFIG_RESOURCES: Record<ConfigKind, ConfigDef> = {
  "fund-types": {
    kind: "fund-types",
    model: "fundType",
    title: "Fund Types",
    singular: "Fund Type",
    description:
      "Fund classifications districts assign to their funds. Shared across all districts for consistent reporting.",
  },
  "revenue-types": {
    kind: "revenue-types",
    model: "revenueType",
    title: "Revenue Types",
    singular: "Revenue Type",
    description:
      "Revenue categories districts assign to revenues and grants. Shared across all districts.",
  },
  "object-types": {
    kind: "object-types",
    model: "objectType",
    title: "Object Types",
    singular: "Object Type",
    description:
      "Object categories districts assign to their objects. Shared across all districts.",
  },
  "function-types": {
    kind: "function-types",
    model: "functionType",
    title: "Function Types",
    singular: "Function Type",
    description:
      "Function categories districts assign to their functions. Shared across all districts.",
  },
  statuses: {
    kind: "statuses",
    model: "status",
    title: "Statuses",
    singular: "Status",
    description: "Shared status values managed at the platform level.",
  },
};

export const CONFIG_KINDS = Object.keys(CONFIG_RESOURCES) as ConfigKind[];
