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
}
