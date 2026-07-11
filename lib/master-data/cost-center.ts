import type { EnumOption } from "@/lib/master-data/enums";

// Cost Center Category is a fixed radio choice; Type depends on the chosen Category.

export const COST_CENTER_CATEGORIES: EnumOption[] = [
  { value: "SCHOOL", label: "School" },
  { value: "DEPARTMENT", label: "Department" },
  { value: "OPERATIONS", label: "Operations" },
  { value: "OTHER", label: "Other" },
];

export const COST_CENTER_TYPES_BY_CATEGORY: Record<string, EnumOption[]> = {
  SCHOOL: [
    { value: "ELEMENTARY", label: "Elementary" },
    { value: "MIDDLE", label: "Middle" },
    { value: "HIGH", label: "High" },
    { value: "K8", label: "K-8" },
    { value: "PREK8", label: "PreK-8" },
    { value: "ALTERNATIVE", label: "Alternative" },
    { value: "CHARTER", label: "Charter" },
    { value: "OTHER_SCHOOL", label: "Other School" },
  ],
  DEPARTMENT: [
    { value: "CENTRAL_OFFICE", label: "Central Office Department" },
    { value: "SCHOOL_BASED", label: "School-Based Department" },
    { value: "OTHER_DEPARTMENT", label: "Other Department" },
  ],
  OPERATIONS: [
    { value: "TRANSPORTATION", label: "Transportation" },
    { value: "MAINTENANCE", label: "Maintenance" },
    { value: "FACILITIES", label: "Facilities" },
    { value: "FOOD_SERVICES", label: "Food Services" },
    { value: "WAREHOUSE", label: "Warehouse" },
    { value: "FLEET", label: "Fleet" },
    { value: "CAPITAL_CONSTRUCTION", label: "Capital / Construction" },
    { value: "OTHER_OPERATIONS", label: "Other Operations" },
  ],
  OTHER: [
    { value: "DISTRICTWIDE", label: "Districtwide" },
    { value: "NON_SCHOOL_SITE", label: "Non-School Site" },
    { value: "OTHER", label: "Other" },
  ],
};

// Flat list of every Type (for column display + CSV import label resolution).
export const ALL_COST_CENTER_TYPES: EnumOption[] = Object.values(
  COST_CENTER_TYPES_BY_CATEGORY,
).flat();

export const COST_CENTER_CATEGORY_VALUES = COST_CENTER_CATEGORIES.map(
  (c) => c.value,
);

export function isValidCostCenterType(
  category: string,
  type: string,
): boolean {
  return (COST_CENTER_TYPES_BY_CATEGORY[category] ?? []).some(
    (t) => t.value === type,
  );
}
