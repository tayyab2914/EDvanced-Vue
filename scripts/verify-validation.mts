import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { makeTenantExtension } from "@/lib/tenant-scope";
import type { TenantDb } from "@/lib/tenant-db";
import { DATASET_DEFS } from "@/lib/datasets/registry";
import { parseFile } from "@/lib/import/parse/rows";
import { stageRows } from "@/lib/import/stage";
import { validateBatch } from "@/lib/validation/import/engine";
import { RULE } from "@/lib/validation/import/findings";
import { structureFindings } from "@/lib/validation/import/layers/structure";
import { matchHeaders } from "@/lib/import/parse/headers";
import { evaluate, TOLERANCE } from "@/lib/validation/import/layers/calculation";
import { Prisma } from "@/lib/generated/prisma/client";

/**
 * Checks the validation engine against a fixture with one planted defect per layer.
 *
 * Asserts on RULE ids, never on message prose: the wording will be edited, and a test
 * that breaks on a copy edit is a test people delete.
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

const ROLLBACK = "__verify_rollback__";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const scoped = <T,>(rows: T[]): any => rows as any;

// Codes are prefixed where they would collide with the seeded sample data — a test that
// only passes on an empty database is a test that fails the first time anyone demos.
const EXP = DATASET_DEFS["expenditure-detail"];

/**
 * Expenditure Detail, with a defect planted per layer. Row numbers are file rows, so the
 * header is 1 and the first defect lands on 2.
 */
const HEADERS = [
  "Fund Code",
  "Function Code",
  "Object Code",
  "Cost Center",
  "Project / Grant",
  "Budget",
  "Actual MTD",
  "Actual YTD",
  "Encumbrances",
  "Available Budget",
];

/**
 * Every row carries a DISTINCT grain except the one intentional duplicate.
 *
 * That is not fussiness. The grain here is fund + function + object + cost centre +
 * project, so two rows that merely happen to share those five ARE duplicates, and an
 * earlier draft of this fixture accidentally made the calculation row a duplicate of the
 * clean row — planting a second defect nobody meant and making the duplicate assertion
 * find the wrong finding. Vary the cost centre, keep the defects one per row.
 */
const FIXTURE = [
  //  fund    func    obj     cc      proj      budget  mtd     ytd     encumb  available
  ["0101", "VLD-5000", "VLD-0100", "0001", "PROJ-A", "1000", "100", "400", "100", "500"], // 2  clean
  ["9999", "VLD-5000", "VLD-0100", "0002", "PROJ-A", "1000", "100", "400", "100", "500"], // 3  referential: unknown fund
  ["0101", "VLD-5000", "VLD-0100", "0003", "PROJ-A", "abc", "100", "400", "100", "500"], // 4  types: budget not a number
  ["0101", "VLD-5000", "VLD-0100", "0004", "PROJ-A", "1000", "100", "400", "100", "999"], // 5  calculation: available wrong
  ["0101", "VLD-5000", "VLD-0100", "0005", "NOPE", "1000", "100", "400", "100", "500"], // 6  referential: unknown project
  ["0101", "VLD-5000", "VLD-0100", "0006", "PROJ-B", "1000", "100", "1500", "0", "-500"], // 7  business rule: over budget
  ["0101", "VLD-5000", "VLD-0100", "0007", "PROJ-A", "1000", "100", "400", "100", "500"], // 8  clean
  ["0101", "VLD-5000", "VLD-0100", "0007", "PROJ-A", "1000", "100", "400", "100", "500"], // 9  duplicate of row 8
  ["101", "VLD-5000", "VLD-0100", "0008", "PROJ-A", "1000", "100", "400", "100", "500"], // 10 leading zero eaten
];

const csv = () => [HEADERS, ...FIXTURE].map((r) => r.join(",")).join("\n");

async function main() {
  const district = await prisma.district.findFirst({ orderBy: { createdAt: "asc" } });
  if (!district) {
    console.log("No district found — run `npm run seed:demo` first.");
    process.exit(1);
  }
  console.log(`\nDistrict: ${district.name}`);
  const db = tenantDb(district.id);

  // ---- structure, which runs at upload ----
  console.log("\nStructure (runs at upload, not in the engine)");
  const missing = matchHeaders(EXP, ["Fund Code", "Function Code", "YTD Spend"]);
  const sf = structureFindings(EXP, missing);
  assert(
    sf.some((f) => f.rule === RULE.MISSING_REQUIRED_COLUMN && f.column === "Object Code"),
    "a missing required column is an Error naming the column",
  );
  assert(
    sf.every((f) => f.rule !== RULE.MISSING_REQUIRED_COLUMN || f.severity === "ERROR"),
    "missing required columns are Errors",
  );
  assert(
    sf.some((f) => f.rule === RULE.UNKNOWN_COLUMN && f.column === "YTD Spend"),
    "an unrecognised column is reported",
  );
  assert(
    sf.find((f) => f.rule === RULE.UNKNOWN_COLUMN)?.severity === "WARNING",
    "but only as a Warning — extra columns are the district's business",
  );
  // Cost centre is *recommended* on the annual Expenditure Budget and merely *optional*
  // on the monthly detail — that difference is the workbook's, not ours.
  const BUD = DATASET_DEFS["expenditure-budget"];
  const withoutCc = matchHeaders(BUD, ["Fund Code", "Function Code", "Object Code", "Budget Amount"]);
  const ccFindings = structureFindings(BUD, withoutCc);
  assert(
    ccFindings.some((f) => f.rule === RULE.MISSING_RECOMMENDED_COLUMN && f.severity === "WARNING"),
    "a missing recommended column warns rather than blocks",
  );
  assert(
    structureFindings(EXP, matchHeaders(EXP, HEADERS.filter((h) => h !== "Cost Center"))).length === 0,
    "but a missing OPTIONAL column says nothing at all",
  );

  // ---- the engine ----
  try {
    // Prisma's interactive transactions default to a 5s budget. This one seeds master
    // data, parses, stages and validates against a HOSTED database, so latency alone
    // outruns that. Only the test needs the room — in the app, validateBatch is called
    // from a request and is not wrapped in a transaction at all.
    await db.$transaction(
      async (tx) => {
        const t = tx as TenantDb;

      await t.fund.createMany({ data: scoped([{ code: "0101", name: "General" }]) });
      await t.accountFunction.createMany({ data: scoped([{ code: "VLD-5000", name: "Instruction" }]) });
      await t.accountObject.createMany({ data: scoped([{ code: "VLD-0100", name: "Salaries" }]) });
      // One per fixture row, so each row's grain is distinct.
      await t.school.createMany({
        data: scoped(
          Array.from({ length: 8 }, (_, i) => ({
            schoolNumber: `000${i + 1}`,
            name: `Cost Center ${i + 1}`,
          })),
        ),
      });
      await t.capitalProject.createMany({
        data: scoped([
          { projectId: "PROJ-A", name: "Roof" },
          { projectId: "PROJ-B", name: "HVAC" },
        ]),
      });

      const parsed = await parseFile(EXP, "exp.csv", Buffer.from(csv(), "utf8"));
      const batch = await t.importBatch.create({
        data: scoped([
          {
            dataset: "EXPENDITURE_DETAIL",
            fiscalYear: "2026-27",
            periodType: "MONTHLY",
            period: 2,
            budgetType: "CURRENT",
            fileName: "exp.csv",
            fileSize: 1,
            uploadedByUserId: "verify-script",
          },
        ])[0],
      });
      await stageRows(t, batch.id, parsed.rows);

      const summary = await validateBatch(t, batch.id);
      const findings = await t.validationFinding.findMany({
        where: { batchId: batch.id },
        orderBy: [{ rowNumber: "asc" }],
      });
      const has = (rule: string, row?: number) =>
        findings.some((f) => f.rule === rule && (row === undefined || f.rowNumber === row));

      console.log("\nOne finding per planted defect");
      assert(has(RULE.UNKNOWN_CODE, 3), "row 3: unknown fund is caught (referential)");
      assert(has(RULE.INVALID_VALUE, 4), "row 4: a non-numeric budget is caught (types)");
      assert(has(RULE.CALC_MISMATCH, 5), "row 5: a wrong Available Budget is caught (calculation)");
      assert(has(RULE.UNKNOWN_CODE, 6), "row 6: an unknown project is caught (referential)");
      assert(has(RULE.SPEND_OVER_BUDGET, 7), "row 7: spend over budget is caught (business rules)");
      assert(has(RULE.DUPLICATE_ROW, 9), "row 9: a duplicate of row 8 is caught (duplicates)");
      assert(has(RULE.RECOVERED_LEADING_ZERO, 10), "row 10: the eaten leading zero is recovered and flagged");

      console.log("\nThe clean rows stay clean");
      assert(!findings.some((f) => f.rowNumber === 2), "row 2 produces nothing");
      assert(!findings.some((f) => f.rowNumber === 8), "row 8 produces nothing — it is the ORIGINAL, not the duplicate");

      console.log("\nSeverity is assigned correctly");
      const sev = (rule: string) => findings.find((f) => f.rule === rule)?.severity;
      assert(sev(RULE.UNKNOWN_CODE) === "ERROR", "an unknown code blocks");
      assert(sev(RULE.INVALID_VALUE) === "ERROR", "a bad type blocks");
      assert(sev(RULE.CALC_MISMATCH) === "ERROR", "a calculation mismatch blocks");
      assert(sev(RULE.DUPLICATE_ROW) === "ERROR", "a duplicate blocks — we cannot know which row is the truth");
      // The two-tier split: a valid-but-noteworthy state must never block.
      assert(sev(RULE.SPEND_OVER_BUDGET) === "WARNING", "over budget only warns — it is a real state, not an error");
      assert(sev(RULE.RECOVERED_LEADING_ZERO) === "WARNING", "a recovered zero only warns — we accepted the row");

      console.log("\nEvery finding is actionable");
      const rowFindings = findings.filter((f) => f.rowNumber !== null);
      // A duplicate is the exception, and correctly so: the whole ROW repeats, so there
      // is no one column to blame. It names the grain in `value` instead.
      assert(
        rowFindings
          .filter((f) => f.rule !== RULE.DUPLICATE_ROW)
          .every((f) => f.column !== null && f.column !== ""),
        "each names a column — except a duplicate, which is the whole row",
      );
      const dup = findings.find((f) => f.rule === RULE.DUPLICATE_ROW);
      assert(
        !!dup?.value && dup.value.includes("/"),
        "a duplicate names the grain that repeated, in the district's own codes",
      );
      assert(!!dup?.message.includes("row 8"), "and points at the row it duplicates");
      assert(rowFindings.every((f) => f.message.trim().length > 0), "each carries a plain-English message");
      assert(
        findings.filter((f) => f.rule === RULE.UNKNOWN_CODE).every((f) => f.value && f.value.length > 0),
        "each quotes the district's own offending value back",
      );
      const unknownFund = findings.find((f) => f.rule === RULE.UNKNOWN_CODE && f.rowNumber === 3);
      assert(unknownFund?.value === "9999", "the value is what the district actually wrote");
      assert(unknownFund?.column === "Fund Code", "the column is the LABEL they used, not our field name");

      console.log("\nOne typo makes one finding");
      // Row 4's budget is unreadable, so it is dropped before calculation and business
      // rules. Without that, one typo would produce a cascade and bury itself.
      assert(
        findings.filter((f) => f.rowNumber === 4).length === 1,
        `row 4 produces exactly 1 finding, not a cascade (got ${findings.filter((f) => f.rowNumber === 4).length})`,
      );

      console.log("\nSummary");
      assert(summary.rowsParsed === 9, `counted all 9 rows (got ${summary.rowsParsed})`);
      assert(summary.errorCount > 0 && summary.warningCount > 0, "reports both errors and warnings");
      assert(!summary.canProceed, "errors block the import");
      const b = await t.importBatch.findFirst({ where: { id: batch.id } });
      assert(b?.status === "FAILED", "the batch records that it cannot proceed");
      assert(b?.errorCount === summary.errorCount, "the batch carries the error count for the list view");

      console.log("\nResolved rows are stored for commit");
      const staged = await t.importStagingRow.findMany({
        where: { batchId: batch.id, rowNumber: 2 },
      });
      const resolved = staged[0]?.resolved as Record<string, string> | null;
      assert(resolved !== null, "a valid row keeps its resolved form");
      assert(
        typeof resolved?.fundId === "string" && resolved.fundId.length > 20,
        "codes have become ids — commit does not re-resolve",
      );
      assert(resolved?.availableBudget === "500.00", "calculated fields are computed and stored");
      assert(
        typeof resolved?.capitalProjectId === "string",
        "the single Project / Grant column resolved into a project id",
      );

      console.log("\nRe-validating replaces, never accumulates");
      const second = await validateBatch(t, batch.id);
      const after = await t.validationFinding.count({ where: { batchId: batch.id } });
      assert(after === findings.length, `same finding count on a second run (${after} vs ${findings.length})`);
      assert(second.errorCount === summary.errorCount, "and the same error count");

      // Structure findings are written once, at upload, and cannot be recreated here —
      // the headers are gone by the time rows are staged. A re-validate must keep them,
      // and must keep counting them.
      console.log("\nStructure findings survive a re-validate");
      await t.validationFinding.createMany({
        data: scoped([
          {
            batchId: batch.id,
            severity: "WARNING",
            layer: "structure",
            rule: RULE.UNKNOWN_COLUMN,
            column: "YTD Spend",
            message: "We don't recognise the column \"YTD Spend\" and have ignored it.",
          },
        ]),
      });
      const third = await validateBatch(t, batch.id);
      const structural = await t.validationFinding.count({
        where: { batchId: batch.id, layer: "structure" },
      });
      assert(structural === 1, "the structure finding is still there after re-validating");
      assert(
        third.warningCount === second.warningCount + 1,
        `and is counted (${third.warningCount} vs ${second.warningCount})`,
      );

        throw new Error(ROLLBACK);
      },
      { timeout: 120_000, maxWait: 20_000 },
    );
  } catch (e) {
    if ((e as Error).message !== ROLLBACK) throw e;
  }

  // ---- the tolerance, checked directly ----
  console.log("\nCalculation tolerance");
  const D = Prisma.Decimal;
  assert(TOLERANCE.equals(new D("0.01")), "tolerance is one cent");
  const val = { budget: "1000", actualYtd: "400", encumbrances: "100" };
  assert(
    evaluate({ plus: ["budget"], minus: ["actualYtd", "encumbrances"] }, val).toFixed(2) === "500.00",
    "Available Budget = Budget − Actual YTD − Encumbrances",
  );
  assert(
    evaluate({ plus: ["a", "b"] }, { a: "0.1", b: "0.2" }).toFixed(2) === "0.30",
    "0.1 + 0.2 is exactly 0.30 — Decimal, never float",
  );
  assert(
    evaluate({ plus: ["a"], minus: ["b"] }, { a: "100", b: undefined }).toFixed(2) === "100.00",
    "an absent operand counts as zero",
  );

  console.log("\nRollback");
  const leaked = await prisma.importBatch.count({ where: { uploadedByUserId: "verify-script" } });
  assert(leaked === 0, `no verify rows persisted (found ${leaked})`);

  console.log(`\n${passed} passed, ${failed} failed\n`);
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
