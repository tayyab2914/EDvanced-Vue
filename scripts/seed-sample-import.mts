import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { makeTenantExtension } from "@/lib/tenant-scope";
import type { TenantDb } from "@/lib/tenant-db";
import { DATASET_DEFS } from "@/lib/datasets/registry";
import { DATASETS, type DatasetSlug } from "@/lib/datasets/kinds";
import { parseFile } from "@/lib/import/parse/rows";
import { stageRows } from "@/lib/import/stage";
import { validateBatch } from "@/lib/validation/import/engine";
import { commitBatch } from "@/lib/import/commit";
import { structureFindings } from "@/lib/validation/import/layers/structure";
import { loadActivityCodes } from "@/lib/finance/transfers";
import { computeFundBalance, reservePercent } from "@/lib/finance/fund-balance";
import { activityTotals, netOperatingSurplus, endingCash } from "@/lib/finance/engine";
import { evaluateAlerts } from "@/lib/alerts/engine";
import { csvEscape } from "@/lib/csv";

/**
 * Loads the sample data into the demo district, end to end, through the real pipeline.
 *
 * This is the demo the milestone plan describes as its manual acceptance test, automated:
 * master data, then the annual files, then two months — parsed, validated, committed, and
 * then read back through the finance engine and the alert catalogue.
 *
 * It is idempotent: run it twice and the second run replaces the first.
 *
 * Run: npm run sample:load
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL }),
});
const tenantDb = (districtId: string) =>
  prisma.$extends(makeTenantExtension(districtId)) as unknown as TenantDb;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const scoped = <T,>(rows: T[]): any => rows as any;

const DIR = join(process.cwd(), "public", "sample-data");
const FY = "2026-27";
const USER = "sample-data-loader";

const money = (v: { toFixed: (n: number) => string }) =>
  Number(v.toFixed(2)).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

async function main() {
  const district = await prisma.district.findFirst({ orderBy: { createdAt: "asc" } });
  if (!district) {
    console.log("No district found — run `npm run seed:demo` first.");
    process.exit(1);
  }
  const db = tenantDb(district.id);
  console.log(`\nLoading sample data into ${district.name}\n`);

  await clearPeriodicData(db);
  await loadMasterData(db);
  await classifyTransfers();

  console.log("\nAnnual");
  await importFile(db, district.id, "01-revenue-budget-FY2026-27.csv", "revenue-budget", null);
  await importFile(db, district.id, "02-expenditure-budget-FY2026-27.csv", "expenditure-budget", null);
  await importFile(db, district.id, "03-opening-fund-balance-FY2026-27.csv", "opening-fund-balance", null);

  console.log("\nMonthly");
  for (const [p, label] of [[1, "P1-July"], [2, "P2-August"]] as const) {
    await importFile(db, district.id, `04-revenue-detail-FY2026-27-${label}.csv`, "revenue-detail", p);
    await importFile(db, district.id, `05-expenditure-detail-FY2026-27-${label}.csv`, "expenditure-detail", p);
    await importFile(db, district.id, `06-cash-position-FY2026-27-${label}.csv`, "cash-position", p);
  }

  // ---- read it back through the engines ----
  const codes = await loadActivityCodes(prisma);
  const fund = await db.fund.findFirst({ where: { code: "1000" } });
  const scope = { fiscalYear: FY, period: 2, fundId: fund!.id };

  const [fb, reserve, totals, cash] = await Promise.all([
    computeFundBalance(db, scope, codes),
    reservePercent(db, scope, codes),
    activityTotals(db, scope, codes),
    endingCash(db, scope),
  ]);

  console.log("\nGeneral Fund, August (FY2026-27)");
  console.log(`  Ending cash            ${money(cash.total)}`);
  console.log(`  Revenue YTD            ${money(totals.totalRevenueYtd)}`);
  console.log(`    of which transfers   ${money(totals.transfersInYtd.plus(totals.otherFinancingYtd))}`);
  console.log(`  Expenditure YTD        ${money(totals.totalExpenditureYtd)}`);
  console.log(`    of which transfers   ${money(totals.transfersOutYtd)}`);
  console.log(`  Net operating surplus  ${money(netOperatingSurplus(totals))}`);
  console.log(`  Beginning fund balance ${money(fb.beginning)}`);
  console.log(`  Fund balance           ${money(fb.total)}`);
  console.log(
    `  Unassigned reserve     ${reserve.percent ? `${reserve.percent.toFixed(1)}%` : "—"} of ${money(reserve.budget)}`,
  );

  const report = await evaluateAlerts(db, { districtId: district.id, ...scope }, codes);
  console.log(
    `\nAlerts: ${report.criticalCount} critical, ${report.warningCount} warning · reserve reads "${report.reserveStatus ?? "—"}"`,
  );
  for (const a of report.alerts) {
    console.log(`  [${a.severity === "CRITICAL" ? "!!" : " !"}] ${a.title} — ${a.message}`);
  }
  if (report.alerts.length === 0) console.log("  (none)");

  if (!codes.configured) {
    console.log(
      "\n  ℹ No activity codes classified yet. The fund balance above is correct regardless —" +
        "\n    the classification cancels out of it — but net operating surplus is counting" +
        "\n    transfers as earnings. Classify 3600 / 3730 / 9700 under Platform → Activity codes.",
    );
  }

  console.log("\nDone. Sign in and look at Data → Versions.\n");
}

// ===================== master data =====================

/**
 * Imports the master-data CSVs directly rather than through the M1 Server Action, which
 * needs a request. Same files, same columns — this is a loader, not a second importer.
 */
async function loadMasterData(db: TenantDb): Promise<void> {
  console.log("Master data");
  const read = (f: string) =>
    readFileSync(join(DIR, "master-data", f), "utf8")
      .split("\n")
      .slice(1)
      .filter((l) => l.trim())
      .map((l) => l.split(","));

  const [fundTypes, revTypes, fnTypes, objTypes, ccTypes, statuses] = await Promise.all([
    prisma.fundType.findMany(),
    prisma.revenueType.findMany(),
    prisma.functionType.findMany(),
    prisma.objectType.findMany(),
    prisma.costCenterType.findMany(),
    prisma.status.findMany(),
  ]);
  const byName = <T extends { name: string; id: string }>(rows: T[], n: string) =>
    rows.find((r) => r.name.toLowerCase() === n.trim().toLowerCase())?.id ?? null;

  const upsert = async (label: string, n: number) => console.log(`  ${label.padEnd(18)} ${n}`);

  const funds = read("01-funds.csv");
  for (const [code, name, type] of funds) {
    await db.fund.deleteMany({ where: { code } });
    await db.fund.createMany({ data: scoped([{ code, name, fundTypeId: byName(fundTypes, type) }]) });
  }
  await upsert("funds", funds.length);

  const sources = read("02-revenue-sources.csv");
  for (const [code, name, type] of sources) {
    await db.revenueSource.deleteMany({ where: { code } });
    await db.revenueSource.createMany({
      data: scoped([{ code, name, revenueTypeId: byName(revTypes, type) }]),
    });
  }
  await upsert("revenue sources", sources.length);

  const fns = read("03-functions.csv");
  for (const [code, name, type] of fns) {
    await db.accountFunction.deleteMany({ where: { code } });
    await db.accountFunction.createMany({
      data: scoped([{ code, name, functionTypeId: byName(fnTypes, type) }]),
    });
  }
  await upsert("functions", fns.length);

  const objs = read("04-objects.csv");
  for (const [code, name, type] of objs) {
    await db.accountObject.deleteMany({ where: { code } });
    await db.accountObject.createMany({
      data: scoped([{ code, name, objectTypeId: byName(objTypes, type) }]),
    });
  }
  await upsert("objects", objs.length);

  const ccs = read("05-cost-centers.csv");
  for (const [num, name, category, type] of ccs) {
    const typeId = byName(ccTypes, type);
    await db.school.deleteMany({ where: { schoolNumber: num } });
    await db.school.createMany({
      data: scoped([
        { schoolNumber: num, name, category: category.trim().toUpperCase(), typeId },
      ]),
    });
  }
  await upsert("cost centers", ccs.length);

  const grants = read("06-grants.csv");
  for (const [gid, name, revType, award, status, period, manager, desc, cfda] of grants) {
    await db.grant.deleteMany({ where: { grantId: gid } });
    await db.grant.createMany({
      data: scoped([
        {
          grantId: gid,
          name,
          revenueTypeId: byName(revTypes, revType),
          awardAmount: award,
          status: status.trim().toUpperCase().replace(/ /g, "_"),
          grantPeriod: period,
          grantManager: manager,
          description: desc,
          cfdaNumber: cfda,
        },
      ]),
    });
  }
  await upsert("grants", grants.length);

  const projects = read("07-capital-projects.csv");
  for (const [pid, name, desc, status, type] of projects) {
    await db.capitalProject.deleteMany({ where: { projectId: pid } });
    await db.capitalProject.createMany({
      data: scoped([
        {
          projectId: pid,
          name,
          description: desc,
          status: status.trim().toUpperCase().replace(/ /g, "_"),
          projectType: type.trim().toUpperCase().replace(/ /g, "_"),
        },
      ]),
    });
  }
  await upsert("capital projects", projects.length);

  void statuses;
  void csvEscape;
}

/**
 * Classifies the sample's transfer codes.
 *
 * PLATFORM-level, not the district's — this list is shared by every district, and in
 * production it is Gary's to fill in from the Red Book. It is seeded here only because the
 * sample is a demo, and a demo where Net Operating Surplus counts transfers as earnings
 * teaches the wrong thing about the feature.
 *
 * The codes are the sample's own (3600 / 3730 / 9700). Idempotent.
 */
async function classifyTransfers(): Promise<void> {
  const codes: [string, string][] = [
    ["TRANSFERS_IN", "3600"],
    ["OTHER_FINANCING_SOURCES", "3730"],
    ["TRANSFERS_OUT", "9700"],
  ];
  for (const [activityClass, codeFrom] of codes) {
    const existing = await prisma.financialActivityCode.findFirst({
      where: { activityClass: activityClass as never, codeFrom, codeTo: null },
    });
    if (existing) continue;
    await prisma.financialActivityCode.create({
      data: {
        activityClass: activityClass as never,
        codeFrom,
        codeTo: null,
        note: "Seeded with the sample data — replace with the district's real Red Book codes.",
      },
    });
  }
  console.log(`  ${"activity codes".padEnd(18)} ${codes.length} (platform-level)`);
}

// ===================== the pipeline =====================

async function importFile(
  db: TenantDb,
  districtId: string,
  file: string,
  slug: DatasetSlug,
  period: number | null,
): Promise<void> {
  const def = DATASET_DEFS[slug];
  const meta = DATASETS[slug];
  const buf = readFileSync(join(DIR, file));
  const parsed = await parseFile(def, file, buf);

  const batch = await db.importBatch.create({
    data: scoped([
      {
        dataset: meta.kind,
        fiscalYear: FY,
        periodType: meta.periodType,
        period,
        budgetType: meta.budgetType ?? null,
        fileName: file,
        fileSize: buf.byteLength,
        uploadedByUserId: USER,
      },
    ])[0],
  });

  await stageRows(db, batch.id, parsed.rows);

  const structural = structureFindings(def, parsed.headers);
  if (structural.length > 0) {
    await db.validationFinding.createMany({
      data: scoped(structural.map((f) => ({ ...f, batchId: batch.id }))),
    });
  }

  const summary = await validateBatch(db, batch.id);

  if (!summary.canProceed) {
    const errs = await db.validationFinding.findMany({
      where: { batchId: batch.id, severity: "ERROR" },
      take: 3,
    });
    console.log(`  ✗ ${meta.label.padEnd(22)} ${summary.errorCount} errors`);
    for (const e of errs) console.log(`      row ${e.rowNumber ?? "—"}: ${e.message}`);
    throw new Error(`${file} failed validation`);
  }

  // Warnings are acknowledged — that is the demo: a real state, accepted knowingly.
  if (summary.warningCount > 0) {
    await db.importBatch.updateMany({
      where: { id: batch.id },
      data: { warningsAckedAt: new Date() },
    });
  }

  // Idempotent: a second run replaces what the first committed.
  const existing = await db.datasetVersion.findFirst({
    where: { dataset: meta.kind, fiscalYear: FY, period, isCurrent: true },
  });
  const result = await commitBatch(db, {
    batchId: batch.id,
    action: existing ? "REPLACED" : "INITIAL",
    userId: USER,
  });

  console.log(
    `  ✓ ${meta.label.padEnd(22)} v${result.version} · ${result.rowCount} rows` +
      (summary.warningCount > 0 ? ` · ${summary.warningCount} warning${summary.warningCount === 1 ? "" : "s"} acknowledged` : ""),
  );
}

async function clearPeriodicData(db: TenantDb): Promise<void> {
  const versions = await db.datasetVersion.findMany({
    where: { fiscalYear: FY },
    select: { id: true },
  });
  const ids = versions.map((v) => v.id);
  if (ids.length === 0) return;

  await db.fundBalanceOverride.deleteMany({ where: { fiscalYear: FY } });
  await db.revenueActual.deleteMany({ where: { versionId: { in: ids } } });
  await db.expenditureActual.deleteMany({ where: { versionId: { in: ids } } });
  await db.cashPosition.deleteMany({ where: { versionId: { in: ids } } });
  await db.openingFundBalance.deleteMany({ where: { versionId: { in: ids } } });
  await db.budgetLine.deleteMany({ where: { versionId: { in: ids } } });
  await db.datasetVersion.deleteMany({ where: { fiscalYear: FY } });
  await db.importBatch.deleteMany({ where: { fiscalYear: FY } });
  console.log(`Cleared ${ids.length} existing version(s) for FY${FY}\n`);
}

main()
  .catch((e) => {
    console.error("\nERROR:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
