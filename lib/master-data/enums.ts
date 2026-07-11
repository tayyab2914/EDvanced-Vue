// Fixed dropdown vocabularies for Grants and Capital Projects. `value` matches the
// Prisma enum member; `label` is what the UI shows.

export interface EnumOption {
  value: string;
  label: string;
}

export const GRANT_STATUS: EnumOption[] = [
  { value: "PENDING", label: "Pending" },
  { value: "ACTIVE", label: "Active" },
  { value: "ON_HOLD", label: "On Hold" },
  { value: "CLOSE", label: "Close" },
  { value: "CANCELLED", label: "Cancelled" },
];

export const PROJECT_STATUS: EnumOption[] = [
  { value: "PLANNING", label: "Planning" },
  { value: "DESIGN", label: "Design" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "ON_HOLD", label: "On Hold" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CLOSED", label: "Closed" },
];

export const PROJECT_TYPE: EnumOption[] = [
  { value: "NEW_CONSTRUCTION", label: "New Construction" },
  { value: "RENOVATION", label: "Renovation" },
  { value: "ADDITION", label: "Addition" },
  { value: "MAINTENANCE", label: "Maintenance" },
  { value: "TECHNOLOGY", label: "Technology" },
  { value: "SAFETY_SECURITY", label: "Safety & Security" },
  { value: "OTHER", label: "Other" },
];

export const values = (opts: EnumOption[]): [string, ...string[]] =>
  opts.map((o) => o.value) as [string, ...string[]];
