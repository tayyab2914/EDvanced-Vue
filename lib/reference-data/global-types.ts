import type { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * Platform-managed global lookup lists (Tier 1), owned by EDvanced Vue.
 *
 * These are the standardization / roll-up categories shared by every district so
 * cross-district reporting groups consistently. Platform Admins maintain them in the
 * Platform Console; `seedGlobalTypes` installs the initial set idempotently.
 *
 * Fund Types / Statuses use the prior standard sets; the Type lists come from the
 * client. Function Types is intentionally short — the client finalizes the full list
 * in-app (that is the point of these being editable).
 */

export const FUND_TYPE_NAMES = [
  "General",
  "Special Revenue",
  "Debt Service",
  "Capital Projects",
  "Permanent",
  "Enterprise",
  "Internal Service",
  "Trust & Agency",
];

export const REVENUE_TYPE_NAMES = [
  "Federal Direct",
  "Federal Through State and Local",
  "Revenues from State Sources",
  "Revenues from Local Sources",
  "Other Financing Sources",
  "Transfers",
  "Face Value of Long-term Debt and Sale of Capital Assets",
];

export const OBJECT_TYPE_NAMES = [
  "Salaries",
  "Employee Benefits",
  "Purchased Services",
  "Energy Services",
  "Materials and Supplies",
  "Capital Outlay",
  "Other",
];

export const FUNCTION_TYPE_NAMES = [
  "Instruction",
  "Student and Instructional Support Services",
  "Instructional Media Services",
];

export const STATUS_NAMES = [
  "Active",
  "Pending",
  "On Hold",
  "Completed",
  "Closed",
  "Cancelled",
];

/**
 * Cost Center Types differ from the lists above: each belongs to a Cost Center Category,
 * so the Type dropdown in Master Data stays filtered by the Category the user picked.
 * `code` matches the value these types had while they were hardcoded.
 */
export const COST_CENTER_TYPE_SEED: {
  code: string;
  name: string;
  category: string;
}[] = [
  { code: "ELEMENTARY", name: "Elementary", category: "SCHOOL" },
  { code: "MIDDLE", name: "Middle", category: "SCHOOL" },
  { code: "HIGH", name: "High", category: "SCHOOL" },
  { code: "K8", name: "K-8", category: "SCHOOL" },
  { code: "PREK8", name: "PreK-8", category: "SCHOOL" },
  { code: "ALTERNATIVE", name: "Alternative", category: "SCHOOL" },
  { code: "CHARTER", name: "Charter", category: "SCHOOL" },
  { code: "OTHER_SCHOOL", name: "Other School", category: "SCHOOL" },
  { code: "CENTRAL_OFFICE", name: "Central Office Department", category: "DEPARTMENT" },
  { code: "SCHOOL_BASED", name: "School-Based Department", category: "DEPARTMENT" },
  { code: "OTHER_DEPARTMENT", name: "Other Department", category: "DEPARTMENT" },
  { code: "TRANSPORTATION", name: "Transportation", category: "OPERATIONS" },
  { code: "MAINTENANCE", name: "Maintenance", category: "OPERATIONS" },
  { code: "FACILITIES", name: "Facilities", category: "OPERATIONS" },
  { code: "FOOD_SERVICES", name: "Food Services", category: "OPERATIONS" },
  { code: "WAREHOUSE", name: "Warehouse", category: "OPERATIONS" },
  { code: "FLEET", name: "Fleet", category: "OPERATIONS" },
  { code: "CAPITAL_CONSTRUCTION", name: "Capital / Construction", category: "OPERATIONS" },
  { code: "OTHER_OPERATIONS", name: "Other Operations", category: "OPERATIONS" },
  { code: "DISTRICTWIDE", name: "Districtwide", category: "OTHER" },
  { code: "NON_SCHOOL_SITE", name: "Non-School Site", category: "OTHER" },
  { code: "OTHER", name: "Other", category: "OTHER" },
];

/**
 * Idempotently seeds the global lookup lists. Safe to re-run: existing rows (matched
 * by unique name) are left untouched, so Platform-Admin edits are never overwritten.
 */
export async function seedGlobalTypes(db: PrismaClient): Promise<void> {
  const seedList = async (
    delegate: {
      upsert: (args: {
        where: { name: string };
        update: Record<string, never>;
        create: { name: string; sortOrder: number };
      }) => Promise<unknown>;
    },
    names: string[],
  ) => {
    for (let i = 0; i < names.length; i++) {
      await delegate.upsert({
        where: { name: names[i] },
        update: {},
        create: { name: names[i], sortOrder: (i + 1) * 10 },
      });
    }
  };

  await seedList(db.fundType, FUND_TYPE_NAMES);
  await seedList(db.revenueType, REVENUE_TYPE_NAMES);
  await seedList(db.objectType, OBJECT_TYPE_NAMES);
  await seedList(db.functionType, FUNCTION_TYPE_NAMES);
  await seedList(db.status, STATUS_NAMES);

  for (let i = 0; i < COST_CENTER_TYPE_SEED.length; i++) {
    const t = COST_CENTER_TYPE_SEED[i];
    await db.costCenterType.upsert({
      where: { name: t.name },
      update: {},
      create: { ...t, sortOrder: (i + 1) * 10 },
    });
  }
}
