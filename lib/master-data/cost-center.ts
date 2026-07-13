import type { EnumOption } from "@/lib/master-data/enums";

// Cost Center Category is a fixed radio choice. Type is a platform-managed lookup
// (CostCenterType) whose rows each belong to one of these categories — see
// lib/reference-data/global-types.ts for the seeded set.

export const COST_CENTER_CATEGORIES: EnumOption[] = [
  { value: "SCHOOL", label: "School" },
  { value: "DEPARTMENT", label: "Department" },
  { value: "OPERATIONS", label: "Operations" },
  { value: "OTHER", label: "Other" },
];

export const COST_CENTER_CATEGORY_VALUES = COST_CENTER_CATEGORIES.map(
  (c) => c.value,
);
