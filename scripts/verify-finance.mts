import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../lib/generated/prisma/client";
import { makeTenantExtension } from "@/lib/tenant-scope";
import type { TenantDb } from "@/lib/tenant-db";
import {
  buildMatcher,
  matches,
  isRevenueTransfer,
  isExpenseTransfer,
  loadActivityCodes,
  NO_CODES,
  type ActivityCodes,
} from "@/lib/finance/transfers";
import { activityTotals, netOperatingSurplus, endingCash } from "@/lib/finance/engine";
import { computeFundBalance, computeUnassigned, reservePercent } from "@/lib/finance/fund-balance";
import { DATASET_DEFS } from "@/lib/datasets/registry";
import { parseFile } from "@/lib/import/parse/rows";
import { stageRows } from "@/lib/import/stage";
import { validateBatch } from "@/lib/validation/import/engine";
import { commitBatch } from "@/lib/import/commit";

/**
 * Checks the Financial Activity Engine against the workbook's own arithmetic.
 *
 * Commits real data (a transaction cannot test what reads across transactions), tagged to
 * an impossible fiscal year, and cleans up in a finally.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  }),
});
const tenantDb = (districtId: string) =>
  prisma.$extends(makeTenantExtension(districtId)) as unknown as TenantDb;

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const scoped = <T,>(rows: T[]): any => rows as any;
const D = Prisma.Decimal;
const USER = "verify-finance-script";
const FY = "2098-99";
const PERIOD = 2;

async function main() {
  // ===== the matcher, no database =====
  console.log("\nCode matching");
  const m = buildMatcher([
    { codeFrom: "3600", codeTo: null },
    { codeFrom: "9700", codeTo: "9799" },
  ]);
  assert(matches(m, "3600"), "an exact code matches");
  assert(!matches(m, "3601"), "a neighbouring code does not");
  assert(matches(m, "9700") && matches(m, "9750") && matches(m, "9799"), "a range matches, inclusive at both ends");
  assert(!matches(m, "9699") && !matches(m, "9800"), "and stops at its ends");
  // The reason ranges compare numerically: "97000" is lexically inside "9700".."9799".
  assert(!matches(m, "97000"), "a longer code is not inside the range — ranges are numeric, not string");
  assert(matches(m, "09700"), "a leading zero doesn't hide a code from its range");
  assert(matches(m, " 3600 "), "surrounding space is tolerated");
  assert(!matches(m, "ABC"), "a non-numeric code matches nothing it wasn't listed in");

  const named = buildMatcher([{ codeFrom: "TRF-IN", codeTo: null }]);
  assert(matches(named, "TRF-IN"), "a non-numeric code can still match exactly");

  // A range whose ends aren't numbers is meaningless — don't silently match nothing.
  const bad = buildMatcher([{ codeFrom: "X1", codeTo: "X9" }]);
  assert(matches(bad, "X1"), "a nonsense range degrades to its low code rather than vanishing");

  const reversed = buildMatcher([{ codeFrom: "9799", codeTo: "9700" }]);
  assert(matches(reversed, "9750"), "a range entered backwards still works");

  console.log("\nClassification");
  const codes: ActivityCodes = {
    transfersIn: buildMatcher([{ codeFrom: "3600", codeTo: null }]),
    transfersOut: buildMatcher([{ codeFrom: "9700", codeTo: "9799" }]),
    otherFinancing: buildMatcher([{ codeFrom: "3700", codeTo: null }]),
    configured: true,
  };
  assert(isRevenueTransfer(codes, "3600"), "a transfer-in revenue object is a revenue transfer");
  assert(isRevenueTransfer(codes, "3700"), "so is other financing");
  assert(!isRevenueTransfer(codes, "3310"), "ordinary state revenue is not");
  assert(isExpenseTransfer(codes, "9710"), "a transfer-out object is an expense transfer");
  assert(!isExpenseTransfer(codes, "0100"), "salaries are not");
  assert(!NO_CODES.configured, "an unconfigured classification says so");
  assert(!isRevenueTransfer(NO_CODES, "3600"), "and matches nothing");

  // ===== against the database =====
  const district = await prisma.district.findFirst({ orderBy: { createdAt: "asc" } });
  if (!district) {
    console.log("No district found — run `npm run seed:demo` first.");
    process.exit(1);
  }
  console.log(`\nDistrict: ${district.name}`);
  const db = tenantDb(district.id);

  await cleanup(district.id);
  const made = await seedMasterData(db);

  try {
    // ---- Ending Cash: the workbook's own example ----
    console.log("\nEnding Cash (workbook §3.1)");
    await commit(db, "cash-position", "CASH_POSITION", PERIOD, [
      ["FIN-F1", "72000000", "48500000", "44200000"],
    ], ["Fund Code", "Beginning Cash Balance", "Cash Receipts MTD", "Cash Disbursements MTD"]);

    const cash = await endingCash(db, { fiscalYear: FY, period: PERIOD });
    assert(cash.found, "cash position is found");
    assert(
      cash.total.equals(new D("76300000")),
      `$72.0M + $48.5M − $44.2M = $76.3M (got ${cash.total.dividedBy(1_000_000).toFixed(1)}M)`,
    );

    // ---- opening balance + activity ----
    console.log("\nFund balance");
    await commit(db, "opening-fund-balance", "OPENING_FUND_BALANCE", null, [
      ["FIN-F1", "0", "0", "0", "0", "10000000", "0", "0", "0", "0", "10000000", "2098-07-01", "Final", ""],
    ], [
      "Fund Code", "Prior Year Nonspendable", "Prior Year Restricted", "Prior Year Committed",
      "Prior Year Assigned", "Prior Year Unassigned", "Beginning Nonspendable",
      "Beginning Restricted", "Beginning Committed", "Beginning Assigned",
      "Beginning Unassigned", "Effective Date", "Status", "Notes",
    ]);

    // Revenue: 5M operating (3310) + 1M transfer in (3600) + 0.5M other financing (3700)
    await commit(db, "revenue-detail", "REVENUE_DETAIL", PERIOD, [
      ["FIN-F1", "FIN-R-OP", "FIN-P1", "", "5000000", "0", "5000000"],
      ["FIN-F1", "FIN-R-TIN", "FIN-P1", "", "1000000", "0", "1000000"],
      ["FIN-F1", "FIN-R-OFS", "FIN-P1", "", "500000", "0", "500000"],
    ], [
      "Fund Code", "Revenue Source / Object Code", "Project / Grant",
      "School / Cost Center", "Budget", "Actual MTD", "Actual YTD",
    ]);

    // Expenditure: 3M operating (0100) + 0.4M transfer out (9710)
    await commit(db, "expenditure-detail", "EXPENDITURE_DETAIL", PERIOD, [
      ["FIN-F1", "FIN-FN1", "FIN-O-OP", "", "FIN-P1", "9000000", "0", "3000000", "0"],
      ["FIN-F1", "FIN-FN1", "FIN-O-TOUT", "", "FIN-P1", "1000000", "0", "400000", "0"],
    ], [
      "Fund Code", "Function Code", "Object Code", "Cost Center", "Project / Grant",
      "Budget", "Actual MTD", "Actual YTD", "Encumbrances",
    ]);

    const live = await loadActivityCodes(prisma);
    const scope = { fiscalYear: FY, period: PERIOD, fundId: made.fundId };

    const totals = await activityTotals(db, scope, live);
    assert(totals.totalRevenueYtd.equals(new D("6500000")), "total revenue YTD is $6.5M");
    assert(totals.transfersInYtd.equals(new D("1000000")), "transfers in are isolated: $1.0M");
    assert(totals.otherFinancingYtd.equals(new D("500000")), "other financing is isolated: $0.5M");
    assert(totals.operatingRevenueYtd.equals(new D("5000000")), "operating revenue is the remainder: $5.0M");
    assert(totals.totalExpenditureYtd.equals(new D("3400000")), "total expenditure YTD is $3.4M");
    assert(totals.transfersOutYtd.equals(new D("400000")), "transfers out are isolated: $0.4M");
    assert(totals.operatingExpenditureYtd.equals(new D("3000000")), "operating expenditure is the remainder: $3.0M");

    // The figure that genuinely needs the classification.
    assert(
      netOperatingSurplus(totals).equals(new D("2000000")),
      "net operating surplus EXCLUDES transfers: 5.0 − 3.0 = $2.0M",
    );

    const fb = await computeFundBalance(db, scope, live);
    assert(fb.beginning.equals(new D("10000000")), "beginning fund balance is $10.0M");
    // 10.0 + 6.5 − 3.4 = 13.1
    assert(
      fb.total.equals(new D("13100000")),
      `fund balance = 10.0 + 6.5 − 3.4 = $13.1M (got ${fb.total.dividedBy(1_000_000).toFixed(1)}M)`,
    );
    assert(fb.source === "SYSTEM_CALCULATED", "and it is system calculated");
    assert(!fb.missingOpeningBalance, "the opening balance was found");

    // ---- the claim that the classification cancels out ----
    console.log("\nThe balance does not depend on the classification");
    const unclassified = await computeFundBalance(db, scope, NO_CODES);
    assert(
      unclassified.total.equals(fb.total),
      "the same balance with NO transfer codes configured — the split cancels out algebraically",
    );
    // And the workbook's own formula, written out longhand, agrees.
    const longhand = fb.beginning
      .plus(totals.operatingRevenueYtd)
      .plus(totals.transfersInYtd)
      .minus(totals.operatingExpenditureYtd)
      .minus(totals.transfersOutYtd)
      .plus(totals.otherFinancingYtd);
    assert(
      longhand.equals(fb.total),
      "Beginning + Rev + TIn − Exp − TOut + OFS equals Beginning + AllRev − AllExp",
    );
    // ...whereas the figure that DOES need it changes completely.
    const blindTotals = await activityTotals(db, scope, NO_CODES);
    assert(
      !netOperatingSurplus(blindTotals).equals(netOperatingSurplus(totals)),
      "but net operating surplus IS wrong without the codes — $6.5M − $3.4M reads transfers as earnings",
    );

    // ---- missing opening balance ----
    console.log("\nAn incomplete year says so");
    const otherFund = await computeFundBalance(db, { ...scope, fundId: made.fund2Id }, live);
    assert(
      otherFund.missingOpeningBalance,
      "a fund with no opening balance is flagged — without a starting point the 'balance' is only the year's net change",
    );

    // ---- reserve % ----
    console.log("\nReserve percentage");
    await commit(db, "expenditure-budget", "EXPENDITURE_BUDGET", null, [
      ["FIN-F1", "FIN-FN1", "FIN-O-OP", "", "", "100000000"],
    ], [
      "Fund Code", "Function Code", "Object Code", "Cost Center Code", "Project Code", "Budget Amount",
    ]);

    const unassigned = await computeUnassigned(db, scope, live);
    // 10.0 beginning unassigned + 6.5 − 3.4 = 13.1
    assert(unassigned.total.equals(new D("13100000")), "unassigned = beginning unassigned + net change");

    const reserve = await reservePercent(db, scope, live);
    assert(reserve.budget.equals(new D("100000000")), "budgeted expenditure is $100M");
    assert(
      reserve.percent !== null && reserve.percent.toFixed(2) === "13.10",
      `reserve is 13.1% of the budget (got ${reserve.percent?.toFixed(2)}%)`,
    );

    const noBudget = await reservePercent(db, { ...scope, fundId: made.fund2Id }, live);
    assert(
      noBudget.percent === null,
      "a fund with no budget returns null, not 0% — 'we can't work this out' is not 'your reserve is zero'",
    );

    // ---- override ----
    console.log("\nManual override");
    await db.fundBalanceOverride.createMany({
      data: scoped([
        {
          versionId: (await db.datasetVersion.findFirst({
            where: { fiscalYear: FY, dataset: "REVENUE_DETAIL", isCurrent: true },
          }))!.id,
          fiscalYear: FY,
          period: PERIOD,
          fundId: made.fundId,
          field: "TOTAL",
          value: "12000000",
          reason: "Auditor reclassified a receipt in November.",
          overriddenByUserId: USER,
        },
      ]),
    });

    const overridden = await computeFundBalance(db, scope, live);
    assert(overridden.total.equals(new D("12000000")), "an override wins over the computed figure");
    assert(overridden.source === "OVERRIDDEN", "and is labelled as such");
    assert(
      overridden.computed.equals(new D("13100000")),
      "the computed value is still carried, so the UI can show both",
    );
    assert(
      overridden.override?.reason === "Auditor reclassified a receipt in November.",
      "the reason travels with it — the first thing an auditor asks",
    );

    const allFunds = await computeFundBalance(db, { fiscalYear: FY, period: PERIOD }, live);
    assert(
      allFunds.source === "SYSTEM_CALCULATED",
      "an all-funds total ignores per-fund overrides — a district corrects a fund, not a total",
    );
  } finally {
    await cleanup(district.id);
    await teardownMasterData();
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
}

// ===================== fixtures =====================

async function seedMasterData(db: TenantDb) {
  await db.fund.createMany({
    data: scoped([
      { code: "FIN-F1", name: "General" },
      { code: "FIN-F2", name: "Capital" },
    ]),
  });
  await db.revenueSource.createMany({
    data: scoped([
      { code: "FIN-R-OP", name: "State Revenue" },
      { code: "FIN-R-TIN", name: "Transfer In" },
      { code: "FIN-R-OFS", name: "Other Financing" },
    ]),
  });
  await db.accountFunction.createMany({ data: scoped([{ code: "FIN-FN1", name: "Instruction" }]) });
  await db.accountObject.createMany({
    data: scoped([
      { code: "FIN-O-OP", name: "Salaries" },
      { code: "FIN-O-TOUT", name: "Transfer Out" },
    ]),
  });
  await db.project.createMany({ data: scoped([{ projectNumber: "FIN-P1", name: "Project" }]) });
  await prisma.status.upsert({
    where: { name: "Final" },
    create: { name: "Final" },
    update: {},
  });

  // The classification, by code — exactly what Gary will send.
  await prisma.financialActivityCode.createMany({
    data: [
      { activityClass: "TRANSFERS_IN", codeFrom: "FIN-R-TIN", codeTo: null },
      { activityClass: "OTHER_FINANCING_SOURCES", codeFrom: "FIN-R-OFS", codeTo: null },
      { activityClass: "TRANSFERS_OUT", codeFrom: "FIN-O-TOUT", codeTo: null },
    ],
  });

  const fund = await db.fund.findFirst({ where: { code: "FIN-F1" } });
  const fund2 = await db.fund.findFirst({ where: { code: "FIN-F2" } });
  return { fundId: fund!.id, fund2Id: fund2!.id };
}

/** Everything this script seeds is prefixed FIN-, so cleanup can find it by prefix. */
async function teardownMasterData() {
  await prisma.financialActivityCode.deleteMany({ where: { codeFrom: { startsWith: "FIN-" } } });
  await prisma.project.deleteMany({ where: { projectNumber: { startsWith: "FIN-" } } });
  await prisma.accountObject.deleteMany({ where: { code: { startsWith: "FIN-" } } });
  await prisma.accountFunction.deleteMany({ where: { code: { startsWith: "FIN-" } } });
  await prisma.revenueSource.deleteMany({ where: { code: { startsWith: "FIN-" } } });
  await prisma.fund.deleteMany({ where: { code: { startsWith: "FIN-" } } });
}

/** Uploads, validates and commits one fixture. */
async function commit(
  db: TenantDb,
  slug: keyof typeof DATASET_DEFS,
  kind: string,
  period: number | null,
  rows: string[][],
  headers: string[],
): Promise<void> {
  const def = DATASET_DEFS[slug];
  const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
  const parsed = await parseFile(def, "f.csv", Buffer.from(csv, "utf8"));

  const batch = await db.importBatch.create({
    data: scoped([
      {
        dataset: kind,
        fiscalYear: FY,
        periodType: period === null ? "ANNUAL" : "MONTHLY",
        period,
        budgetType: def.budgetType ?? null,
        fileName: "f.csv",
        fileSize: 1,
        uploadedByUserId: USER,
      },
    ])[0],
  });
  await stageRows(db, batch.id, parsed.rows);
  const summary = await validateBatch(db, batch.id);
  if (!summary.canProceed) {
    const f = await db.validationFinding.findMany({ where: { batchId: batch.id, severity: "ERROR" } });
    throw new Error(`fixture "${slug}" failed validation: ${f.map((x) => x.message).join(" | ")}`);
  }
  if (summary.warningCount > 0) {
    await db.importBatch.updateMany({ where: { id: batch.id }, data: { warningsAckedAt: new Date() } });
  }
  await commitBatch(db, { batchId: batch.id, action: "INITIAL", userId: USER });
}

async function cleanup(districtId: string): Promise<void> {
  const db = tenantDb(districtId);
  const versions = await db.datasetVersion.findMany({ where: { fiscalYear: FY }, select: { id: true } });
  const ids = versions.map((v) => v.id);
  await db.fundBalanceOverride.deleteMany({ where: { fiscalYear: FY } });
  await db.revenueActual.deleteMany({ where: { versionId: { in: ids } } });
  await db.expenditureActual.deleteMany({ where: { versionId: { in: ids } } });
  await db.cashPosition.deleteMany({ where: { versionId: { in: ids } } });
  await db.openingFundBalance.deleteMany({ where: { versionId: { in: ids } } });
  await db.budgetLine.deleteMany({ where: { versionId: { in: ids } } });
  await db.datasetVersion.deleteMany({ where: { fiscalYear: FY } });
  await db.importBatch.deleteMany({ where: { fiscalYear: FY } });
}

main()
  .catch((e) => {
    console.error("\nVERIFY ERROR:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    if (failed > 0) process.exitCode = 1;
  });
