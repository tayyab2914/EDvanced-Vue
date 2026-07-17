import * as z from "zod";
import {
  DATASET_DEFS,
  acceptedHeaders,
  datasetDef,
  templateHeaders,
  toClientDef,
  type DatasetDef,
} from "@/lib/datasets/registry";
import { DATASETS, DATASET_SLUGS } from "@/lib/datasets/kinds";
import { isAmount, isDate, normalizeAmount } from "@/lib/datasets/fields";

/**
 * Checks the dataset registry — the single source of truth the parser, the validator,
 * the blank template and the browse columns all read.
 *
 * Most of what follows is structural: a formula naming a field that does not exist, or a
 * schema key that drifted from its field, would not fail loudly at runtime. It would
 * quietly miscalculate a district's money.
 */
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

const defs = Object.values(DATASET_DEFS);
const fieldNames = (d: DatasetDef) => new Set(d.fields.map((f) => f.name));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const schemaKeys = (d: DatasetDef) => Object.keys((d.schema as z.ZodObject<any>).shape);

// ---- coverage ----
console.log("\nCoverage");
assert(defs.length === 6, `six datasets defined (got ${defs.length})`);
assert(
  DATASET_SLUGS.every((s) => DATASET_DEFS[s] !== undefined),
  "every slug in kinds.ts has a definition here",
);
assert(
  defs.every((d) => DATASET_DEFS[d.slug] === d),
  "every definition is filed under its own slug",
);

// kinds.ts and registry.ts describe the same six importers from two angles. If they
// disagree, the upload dropdown and the parser are reading different rulebooks.
assert(
  defs.every((d) => DATASETS[d.slug].periodType === d.periodType),
  "period type agrees with kinds.ts",
);
assert(
  defs.every((d) => DATASETS[d.slug].budgetType === d.budgetType),
  "budget type agrees with kinds.ts",
);
assert(
  defs.every((d) => DATASETS[d.slug].label === d.title),
  "title agrees with kinds.ts",
);

// ---- fields ----
console.log("\nFields");
assert(
  defs.every((d) => d.fields.length > 0),
  "every dataset declares at least one field",
);
assert(
  defs.every((d) => new Set(d.fields.map((f) => f.name)).size === d.fields.length),
  "no dataset repeats a field name",
);
assert(
  defs.every((d) => d.fields.every((f) => (f.type === "code") === (f.resolvesTo !== undefined))),
  "resolvesTo is set on exactly the `code` fields, and only those",
);
assert(
  defs.every((d) => d.fields.every((f) => f.label.trim().length > 0)),
  "every field has a label — the header the importer matches on",
);

// Two fields accepting the same header makes matching ambiguous, and the importer would
// silently pick whichever came first.
let headerClash: string | null = null;
for (const d of defs) {
  const seen = new Map<string, string>();
  for (const f of d.fields) {
    for (const h of acceptedHeaders(f)) {
      const norm = h.trim().toLowerCase();
      const prior = seen.get(norm);
      if (prior && prior !== f.name) headerClash = `${d.slug}: "${h}" -> ${prior} and ${f.name}`;
      seen.set(norm, f.name);
    }
  }
}
assert(headerClash === null, `no two fields accept the same header${headerClash ? ` (${headerClash})` : ""}`);

// ---- formulas ----
console.log("\nCalculated fields");
assert(
  defs.every((d) => d.fields.every((f) => (f.requiredness === "calculated") === (f.formula !== undefined))),
  "formula is set on exactly the `calculated` fields, and only those",
);

// The check that matters: a typo'd operand is a silent miscalculation, not a crash.
let badOperand: string | null = null;
for (const d of defs) {
  const names = fieldNames(d);
  for (const f of d.fields) {
    if (!f.formula) continue;
    for (const op of [...f.formula.plus, ...(f.formula.minus ?? [])]) {
      if (!names.has(op)) badOperand = `${d.slug}.${f.name} references "${op}"`;
      if (op === f.name) badOperand = `${d.slug}.${f.name} references itself`;
    }
  }
}
assert(badOperand === null, `every formula operand is a real field on the same dataset${badOperand ? ` (${badOperand})` : ""}`);

assert(
  defs.every((d) => d.fields.every((f) => !f.formula || f.formula.plus.length > 0)),
  "no formula is empty",
);

// The four the workbook specifies, spelled out — if one of these changes, it should be
// because the client changed it.
const avail = DATASET_DEFS["expenditure-detail"].fields.find((f) => f.name === "availableBudget");
assert(
  JSON.stringify(avail?.formula) ===
    JSON.stringify({ plus: ["budget"], minus: ["actualYtd", "encumbrances"] }),
  "Available Budget = Budget − Actual YTD − Encumbrances",
);
const ending = DATASET_DEFS["cash-position"].fields.find((f) => f.name === "endingCash");
assert(
  JSON.stringify(ending?.formula) ===
    JSON.stringify({ plus: ["beginningCash", "receiptsMtd"], minus: ["disbursementsMtd"] }),
  "Ending Cash = Beginning Cash + Receipts − Disbursements",
);
const pyTotal = DATASET_DEFS["opening-fund-balance"].fields.find((f) => f.name === "pyTotal");
assert(
  pyTotal?.formula?.plus.length === 5 && !pyTotal.formula.minus,
  "Prior Year Total is the sum of its five components",
);
const begTotal = DATASET_DEFS["opening-fund-balance"].fields.find((f) => f.name === "begTotal");
assert(
  begTotal?.formula?.plus.length === 5 && !begTotal.formula.minus,
  "Beginning Total is the sum of its five components",
);

// ---- grain ----
console.log("\nGrain");
assert(
  defs.every((d) => d.grain.length > 0),
  "every dataset declares a grain",
);
let badGrain: string | null = null;
for (const d of defs) {
  const names = fieldNames(d);
  for (const g of d.grain) if (!names.has(g)) badGrain = `${d.slug} -> "${g}"`;
}
assert(badGrain === null, `every grain field exists on its dataset${badGrain ? ` (${badGrain})` : ""}`);
assert(
  defs.every((d) => d.grain.every((g) => d.fields.find((f) => f.name === g)?.type === "code")),
  "grain is built from code fields only — amounts never identify a row",
);
assert(
  DATASET_DEFS["cash-position"].grain.join() === "fundId",
  "cash position is one row per fund",
);
assert(
  DATASET_DEFS["opening-fund-balance"].grain.join() === "fundId",
  "opening fund balance is one row per fund",
);

// ---- schema <-> fields ----
console.log("\nSchema agrees with fields");
let schemaDrift: string | null = null;
for (const d of defs) {
  const names = fieldNames(d);
  const keys = new Set(schemaKeys(d));
  for (const k of keys) if (!names.has(k)) schemaDrift = `${d.slug}: schema key "${k}" is not a field`;
  for (const n of names) if (!keys.has(n)) schemaDrift = `${d.slug}: field "${n}" has no schema key`;
}
assert(schemaDrift === null, `every field has a schema key and vice versa${schemaDrift ? ` (${schemaDrift})` : ""}`);

// ---- template round-trip ----
console.log("\nBlank template round-trips");
assert(
  defs.every((d) => templateHeaders(d).length === d.fields.length),
  "the template names every field, including calculated ones",
);
// Emitting a header the importer cannot match back would make the template a trap.
let unmatched: string | null = null;
for (const d of defs) {
  for (const h of templateHeaders(d)) {
    const hits = d.fields.filter((f) =>
      acceptedHeaders(f).some((a) => a.trim().toLowerCase() === h.trim().toLowerCase()),
    );
    if (hits.length !== 1) unmatched = `${d.slug}: "${h}" matched ${hits.length} fields`;
  }
}
assert(unmatched === null, `every template header matches exactly one field${unmatched ? ` (${unmatched})` : ""}`);

// The client's workbook labels this column two different ways across two sheets; both
// must land on the same field.
const rd = DATASET_DEFS["revenue-detail"].fields.find((f) => f.name === "revenueSourceId")!;
assert(
  acceptedHeaders(rd).includes("Revenue Object / Source Code") &&
    acceptedHeaders(rd).includes("Revenue Source / Object Code"),
  "both of the workbook's own revenue-source headers are accepted",
);

// ---- client boundary ----
console.log("\nClient boundary");
const client = toClientDef(DATASET_DEFS["revenue-detail"]);
assert(!("schema" in client), "toClientDef drops the Zod schema");
assert(!("model" in client), "toClientDef drops the Prisma model name");
assert(!("grain" in client), "toClientDef drops the grain");
assert(
  JSON.parse(JSON.stringify(client)).fields.length === client.fields.length,
  "the client def survives JSON — it crosses the RSC boundary intact",
);

// ---- amount normalisation ----
console.log("\nAmount normalisation");
assert(normalizeAmount("1234.56") === "1234.56", "a bare number is unchanged");
assert(normalizeAmount("$1,234.56") === "1234.56", "strips currency and thousands separators");
assert(normalizeAmount("  1,234.56  ") === "1234.56", "trims");
assert(normalizeAmount("(1,234.56)") === "-1234.56", "accounting parentheses mean negative");
assert(normalizeAmount("1234.56-") === "-1234.56", "a trailing minus means negative");
assert(normalizeAmount("-1234.56") === "-1234.56", "a leading minus survives");
assert(normalizeAmount("0") === "0", "zero is zero");
assert(normalizeAmount("") === "", "empty stays empty");

assert(isAmount("1234.56"), "accepts a decimal");
assert(isAmount("$1,234.56"), "accepts a formatted decimal");
assert(isAmount("(1,234.56)"), "accepts an accounting negative");
assert(isAmount("0"), "accepts zero");
assert(!isAmount("abc"), "rejects text");
assert(!isAmount(""), "rejects empty");
assert(!isAmount("1.2.3"), "rejects a malformed number");
assert(!isAmount("12%"), "rejects a percentage");

// ---- dates, and the Excel serial trap ----
console.log("\nDates");
assert(isDate("2026-07-01"), "accepts ISO");
assert(isDate("07/01/2026"), "accepts US format");
assert(isDate("July 1, 2026"), "accepts a written date");
assert(!isDate(""), "rejects empty");
assert(!isDate("not a date"), "rejects text");

// The spec's own example. Date.parse("46234") does NOT fail — JS reads a bare number as
// a year, so without an explicit guard an unconverted serial validates cleanly and lands
// as a date 44,000 years out.
assert(!Number.isNaN(Date.parse("46234")), "(Date.parse alone accepts the serial 46234 — this is the trap)");
assert(!isDate("46234"), "rejects the unconverted Excel serial 46234");
assert(!isDate("1"), "rejects a bare digit");
assert(!isDate("2026"), "rejects a bare year");
assert(!isDate("0001-01-01"), "rejects a year below 1900");
assert(!isDate("46234-01-01"), "rejects an absurd year");

// ---- schemas actually run ----
console.log("\nSchemas accept good rows and reject bad ones");
const goodRevenue = {
  fundId: "0101",
  revenueSourceId: "3310",
  projectOrGrant: "TITLE-I",
  costCenterId: "",
  budget: "$1,000,000.00",
  actualMtd: "80,000",
  actualYtd: "(500)",
};
const okRevenue = DATASET_DEFS["revenue-detail"].schema.safeParse(goodRevenue);
assert(okRevenue.success, "revenue detail accepts a well-formed row");
assert(okRevenue.success && okRevenue.data.budget === "1000000.00", "currency formatting is normalised away");
assert(okRevenue.success && okRevenue.data.actualYtd === "-500", "an accounting negative is normalised");
assert(
  okRevenue.success && okRevenue.data.costCenterId === undefined,
  "a blank optional code becomes undefined, not an empty string",
);

// Leading zeros must survive the schema untouched — the resolver needs the original to
// match against master data.
assert(okRevenue.success && okRevenue.data.fundId === "0101", "a leading zero survives validation");

const badRevenue = DATASET_DEFS["revenue-detail"].schema.safeParse({
  ...goodRevenue,
  fundId: "",
  actualMtd: "not a number",
});
assert(!badRevenue.success, "revenue detail rejects a row missing its fund");
const issues = badRevenue.success ? [] : badRevenue.error.issues.map((i) => String(i.path[0]));
assert(issues.includes("fundId"), "the missing fund is attributed to fundId");
assert(issues.includes("actualMtd"), "the bad amount is attributed to actualMtd");

const ofb = DATASET_DEFS["opening-fund-balance"].schema.safeParse({
  fundId: "0101",
  pyNonspendable: "0",
  pyRestricted: "0",
  pyCommitted: "0",
  pyAssigned: "0",
  pyUnassigned: "1000",
  begNonspendable: "",
  begRestricted: "",
  begCommitted: "",
  begAssigned: "",
  begUnassigned: "1000",
  effectiveDate: "2026-07-01",
  statusId: "FINAL",
  notes: "",
});
assert(ofb.success, "opening fund balance accepts a row with only its required components");

const badDate = DATASET_DEFS["opening-fund-balance"].schema.safeParse({
  fundId: "0101",
  pyNonspendable: "0",
  pyRestricted: "0",
  pyCommitted: "0",
  pyAssigned: "0",
  pyUnassigned: "0",
  begUnassigned: "0",
  effectiveDate: "46234", // an unconverted Excel serial — the parser should have handled it
  statusId: "FINAL",
});
assert(!badDate.success, "an unconverted Excel serial date is rejected, not silently accepted");

assert(datasetDef("cash-position").model === "cashPosition", "datasetDef resolves by slug");

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
