import { parseCsvRows } from "@/lib/csv";
import { csvFilename, toCsv } from "@/lib/csv-export";
import {
  masterExportHeaders,
  masterExportRow,
  type RelLabels,
} from "@/lib/master-data/export";
import { RESOURCES, MASTER_KINDS } from "@/lib/master-data/registry";
import { CONFIG_KINDS, CONFIG_RESOURCES } from "@/lib/config/registry";
import { toClientDef } from "@/lib/master-data/registry";

/**
 * The point of these files is the round-trip: export → edit in Excel → import back. So the
 * checks below assert the export lines up with what the IMPORTERS actually parse, rather than
 * just that a CSV came out.
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

const norm = (s: string) => s.trim().toLowerCase();

console.log("\n[1] CSV survives a write → read round-trip");
{
  const headers = ["Code", "Name", "Notes"];
  const rows = [
    ["1000", "General Fund", "plain"],
    ["2000", "Food, Nutrition", 'has a comma'],
    ["3000", 'The "Big" Fund', "has quotes"],
    ["4000", "Line one\nline two", "has a newline"],
    ["5000", "", "blank name cell"],
  ];
  const back = parseCsvRows(toCsv(headers, rows));
  assert(
    JSON.stringify(back.headers) === JSON.stringify(headers),
    "headers survive exactly",
  );
  assert(
    JSON.stringify(back.rows) === JSON.stringify(rows),
    "commas, quotes, newlines and blanks all survive",
  );
}

console.log("\n[2] No BOM (a BOM would corrupt the first header on re-import)");
{
  const csv = toCsv(["Code", "Name"], [["1", "x"]]);
  assert(!csv.startsWith("﻿"), "the CSV does not start with a byte-order mark");
  assert(
    parseCsvRows(csv).headers[0] === "Code",
    "the first header parses back as 'Code', not '\\uFEFFCode'",
  );
}

console.log("\n[3] Master data: every REQUIRED import column is present in the export");
for (const kind of MASTER_KINDS) {
  const def = RESOURCES[kind];
  const headers = masterExportHeaders(toClientDef(def)).map(norm);
  // importMasterData rejects the file outright if a required column is missing.
  const missing = def.fields
    .filter((f) => f.required)
    .map((f) => f.label)
    .filter((label) => !headers.includes(norm(label)));
  assert(
    missing.length === 0,
    `${def.title}: export carries every required column${
      missing.length ? ` (missing ${missing.join(", ")})` : ""
    }`,
  );
}

console.log("\n[4] Master data: numbers export plain, selects export as their label");
{
  const def = toClientDef(RESOURCES["grants"]);
  const revenueField = def.fields.find((f) => f.name === "revenueTypeId")!;
  const statusField = def.fields.find((f) => f.name === "status")!;
  const relLabels: RelLabels = {
    revenueTypeId: new Map([["rt_1", "Federal"]]),
  };
  const row = {
    grantId: "G-100",
    name: "Title I",
    revenueTypeId: "rt_1",
    awardAmount: "1000000",
    status: "ACTIVE",
    active: true,
  };
  const headers = masterExportHeaders(def);
  const cells = masterExportRow(row, def, relLabels);
  const at = (label: string) => cells[headers.indexOf(label)];

  assert(
    at("Award Amount") === "1000000",
    `award amount exports plain ("${at("Award Amount")}"), NOT currency-formatted`,
  );
  assert(
    at(revenueField.label) === "Federal",
    "a type column exports the type's NAME (what the importer resolves by), not its id",
  );
  assert(
    at(statusField.label) === "Active",
    "a fixed-option column exports the option LABEL (what the importer resolves by)",
  );
  assert(cells[cells.length - 1] === "Active", "the trailing Status column reflects `active`");
}

console.log("\n[5] Master data: blanks export empty, not the on-screen “—” placeholder");
{
  const def = toClientDef(RESOURCES["grants"]);
  const headers = masterExportHeaders(def);
  const cells = masterExportRow(
    { grantId: "G-1", name: "Bare", active: false },
    def,
    {},
  );
  assert(
    !cells.includes("—"),
    "no em-dash placeholders leak into the file (they would re-import as junk)",
  );
  assert(
    cells[headers.indexOf("Award Amount")] === "",
    "a missing number is an empty cell",
  );
  assert(cells[cells.length - 1] === "Inactive", "an inactive row says Inactive");
}

console.log("\n[6] Configuration: export columns match what importConfigItems parses");
for (const kind of CONFIG_KINDS) {
  const def = CONFIG_RESOURCES[kind];
  const headers = [
    "Code",
    "Name",
    ...(def.categoryField ? [def.categoryField.label] : []),
    "Status",
  ].map(norm);
  // The importer needs Name always, and the Category column for lists that have one.
  const needs = ["name", ...(def.categoryField ? [norm(def.categoryField.label)] : [])];
  const missing = needs.filter((n) => !headers.includes(n));
  assert(
    missing.length === 0,
    `${def.title}: export carries Name${def.categoryField ? ` + ${def.categoryField.label}` : ""}`,
  );
}

console.log("\n[7] Filenames");
{
  const d = new Date(2026, 6, 14); // 14 Jul 2026 (local)
  assert(
    csvFilename("Fund Types", d) === "fund-types-2026-07-14.csv",
    `"Fund Types" → ${csvFilename("Fund Types", d)}`,
  );
  assert(
    csvFilename("Cost Centers", d) === "cost-centers-2026-07-14.csv",
    `"Cost Centers" → ${csvFilename("Cost Centers", d)}`,
  );
}

console.log(`\n──────── ${passed} passed, ${failed} failed ────────\n`);
process.exit(failed === 0 ? 0 : 1);
