import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Florida "Red Book" (Financial and Program Cost Accounting and Reporting for
 * Florida Schools) standard chart-of-accounts starter set.
 *
 * ⚠️ REPRESENTATIVE STARTER SET — the exact code lists must be finalized with the
 * client against their template in Milestone 2 (validation consumes them). These
 * are copied into each new district on onboarding (`isStandard = true`); districts
 * may then add or edit their own rows.
 */

export interface RefItem {
  code: string;
  name: string;
}

export interface FundItem extends RefItem {
  fundTypeCode: string;
  sortOrder: number;
}

// GASB / Red Book fund classifications.
export const FUND_TYPES: RefItem[] = [
  { code: "GEN", name: "General" },
  { code: "SR", name: "Special Revenue" },
  { code: "DS", name: "Debt Service" },
  { code: "CP", name: "Capital Projects" },
  { code: "PERM", name: "Permanent" },
  { code: "ENT", name: "Enterprise" },
  { code: "IS", name: "Internal Service" },
  { code: "TA", name: "Trust & Agency" },
];

export const FUNDS: FundItem[] = [
  { code: "100", name: "General Fund", fundTypeCode: "GEN", sortOrder: 10 },
  { code: "410", name: "Special Revenue – Food Service", fundTypeCode: "SR", sortOrder: 20 },
  { code: "420", name: "Special Revenue – Federal Programs", fundTypeCode: "SR", sortOrder: 30 },
  { code: "430", name: "Special Revenue – Miscellaneous", fundTypeCode: "SR", sortOrder: 40 },
  { code: "210", name: "Debt Service – SBE/COBI Bonds", fundTypeCode: "DS", sortOrder: 50 },
  { code: "310", name: "Capital Projects – CO&DS", fundTypeCode: "CP", sortOrder: 60 },
  { code: "340", name: "Capital Projects – PECO", fundTypeCode: "CP", sortOrder: 70 },
  { code: "370", name: "Capital Projects – Local Capital Improvement (1.5 Mill)", fundTypeCode: "CP", sortOrder: 80 },
  { code: "710", name: "Internal Service Fund", fundTypeCode: "IS", sortOrder: 90 },
  { code: "810", name: "Trust & Agency Fund", fundTypeCode: "TA", sortOrder: 100 },
  { code: "910", name: "Enterprise Fund", fundTypeCode: "ENT", sortOrder: 110 },
];

export const REVENUE_SOURCES: RefItem[] = [
  { code: "3100", name: "Federal Direct" },
  { code: "3200", name: "Federal Through State & Local" },
  { code: "3300", name: "State Sources" },
  { code: "3310", name: "Florida Education Finance Program (FEFP)" },
  { code: "3360", name: "Voluntary Prekindergarten Program" },
  { code: "3400", name: "Local Sources" },
  { code: "3410", name: "District School Taxes (Ad Valorem)" },
  { code: "3430", name: "Interest / Investment Income" },
  { code: "3440", name: "Local Grants & Gifts" },
];

export const FUNCTIONS: RefItem[] = [
  { code: "5000", name: "Instruction" },
  { code: "6100", name: "Pupil Personnel Services" },
  { code: "6200", name: "Instructional Media Services" },
  { code: "6300", name: "Instruction & Curriculum Development Services" },
  { code: "6400", name: "Instructional Staff Training Services" },
  { code: "7100", name: "Board" },
  { code: "7200", name: "General Administration" },
  { code: "7300", name: "School Administration" },
  { code: "7500", name: "Fiscal Services" },
  { code: "7600", name: "Food Services" },
  { code: "7700", name: "Central Services" },
  { code: "7800", name: "Pupil Transportation Services" },
  { code: "7900", name: "Operation of Plant" },
  { code: "8100", name: "Maintenance of Plant" },
  { code: "9000", name: "Community Services" },
];

export const OBJECTS: RefItem[] = [
  { code: "100", name: "Salaries" },
  { code: "120", name: "Classroom Teachers" },
  { code: "200", name: "Employee Benefits" },
  { code: "210", name: "Retirement Contributions" },
  { code: "230", name: "Group Insurance" },
  { code: "300", name: "Purchased Services" },
  { code: "400", name: "Energy Services" },
  { code: "500", name: "Materials & Supplies" },
  { code: "510", name: "Supplies" },
  { code: "520", name: "Textbooks" },
  { code: "600", name: "Capital Outlay" },
  { code: "640", name: "Furniture, Fixtures & Equipment" },
  { code: "700", name: "Other Expenses" },
];

// General-purpose statuses for grants / capital projects. Confirm exact vocabulary with client.
export const STATUSES: RefItem[] = [
  { code: "ACTIVE", name: "Active" },
  { code: "PENDING", name: "Pending" },
  { code: "ON_HOLD", name: "On Hold" },
  { code: "COMPLETED", name: "Completed" },
  { code: "CLOSED", name: "Closed" },
  { code: "CANCELLED", name: "Cancelled" },
];

/**
 * Copies the standard reference set into a district. Call inside a transaction
 * during district onboarding, BEFORE any user can log in to that district.
 */
export async function seedDistrictReferenceData(
  tx: Prisma.TransactionClient,
  districtId: string,
): Promise<void> {
  await tx.fundType.createMany({
    data: FUND_TYPES.map((t) => ({ ...t, districtId, isStandard: true })),
  });

  // Funds reference fund types — resolve the just-created ids by code.
  const createdFundTypes = await tx.fundType.findMany({
    where: { districtId },
    select: { id: true, code: true },
  });
  const fundTypeIdByCode = new Map(createdFundTypes.map((t) => [t.code, t.id]));

  await tx.fund.createMany({
    data: FUNDS.map((f) => ({
      districtId,
      code: f.code,
      name: f.name,
      fundTypeId: fundTypeIdByCode.get(f.fundTypeCode) ?? null,
      sortOrder: f.sortOrder,
      isStandard: true,
    })),
  });

  await tx.revenueSource.createMany({
    data: REVENUE_SOURCES.map((r) => ({ ...r, districtId, isStandard: true })),
  });
  await tx.accountFunction.createMany({
    data: FUNCTIONS.map((r) => ({ ...r, districtId, isStandard: true })),
  });
  await tx.accountObject.createMany({
    data: OBJECTS.map((r) => ({ ...r, districtId, isStandard: true })),
  });
  await tx.status.createMany({
    data: STATUSES.map((r) => ({ ...r, districtId, isStandard: true })),
  });
}
