import { titleCase, displayName, codeName } from "@/lib/text";

/**
 * Checks the display convention in lib/text.ts — the one that decides how every fund,
 * cost-centre, function, object, source and project name is written on every dashboard.
 *
 * The client's requirement: "if a user imports general fund, GENERAL FUND, or General Fund,
 * the dashboard should consistently display it using a predefined format … Title Case for
 * names and labels. Reserve ALL CAPS only for abbreviations and codes such as FEFP, IDEA,
 * ESSER, FTE, 1000."
 *
 * Every case below is a real shape from a chart of accounts, which is why the acronym and
 * code rules are here at all: a plain word-capitaliser passes section [1] and fails [3].
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
function eq(got: string, want: string, why: string) {
  assert(got === want, `${why} → ${JSON.stringify(got)}${got === want ? "" : ` (wanted ${JSON.stringify(want)})`}`);
}

console.log("\n[1] The requirement: one output whatever the district typed");
for (const input of ["general fund", "GENERAL FUND", "General Fund", "  General   Fund  ", "gEnErAl FuND"]) {
  eq(titleCase(input), "General Fund", JSON.stringify(input));
}
eq(titleCase("PURCHASED SERVICES"), "Purchased Services", "the client's second example");
eq(titleCase("capital projects"), "Capital Projects", "the client's third example");

console.log("\n[2] Idempotent — safe to apply at more than one layer");
eq(titleCase(titleCase("GENERAL FUND")), "General Fund", "formatting a formatted name");
eq(titleCase(titleCase("FEFP — STATE")), "FEFP — State", "…including one holding an acronym");

console.log("\n[3] ALL CAPS reserved for abbreviations and codes");
eq(titleCase("FEFP"), "FEFP", "FEFP survives");
eq(titleCase("IDEA PART B ENTITLEMENT"), "IDEA Part B Entitlement", "IDEA is not a word here");
eq(titleCase("ESSER II"), "ESSER II", "a roman numeral stays a roman numeral");
eq(titleCase("TITLE I, PART A"), "Title I, Part A", "single letters are not minor words");
eq(titleCase("fte allocation"), "FTE Allocation", "an acronym typed in lowercase is still an acronym");
eq(titleCase("R&D REIMBURSEMENT"), "R&D Reimbursement", "an ampersand-joined abbreviation");

console.log("\n[3b] Red Book truncations are words, not acronyms — see the note in lib/text.ts");
eq(titleCase("SALARIES - CLASSROOM TCHR"), "Salaries - Classroom Tchr", "a vowel-dropped word is not shouted");
eq(titleCase("SALARIES - OTR SUP PERS"), "Salaries - Otr Sup Pers", "PERS here is personnel, not a retirement system");
eq(titleCase("CLASS SIZE REDUCT-OPER FD"), "Class Size Reduct-Oper Fd", "…and neither is FD an initialism");
eq(titleCase("BASIC FEFP"), "Basic FEFP", "while a genuine initialism beside them survives");
eq(titleCase("PL 83-690 NAT FOREST FUND"), "PL 83-690 Nat Forest Fund", "a statutory reference survives too");
eq(titleCase("MISC SRF - OTHER"), "Misc SRF - Other", "and a fund shorthand");
eq(titleCase("COPS"), "COPS", "a fund named for certificates of participation, not for police");
eq(titleCase("LCIF"), "LCIF", "the local capital improvement fund");
eq(titleCase("PBX LINES"), "PBX Lines", "an equipment initialism");
eq(titleCase("CO & DS W/H FOR ADM EXP"), "CO & DS W/H for ADM Exp", "an abbreviation spelt with a space inside it");
eq(titleCase(titleCase("CO & DS W/H FOR ADM EXP")), "CO & DS W/H for ADM Exp", "…which is still idempotent");
eq(titleCase("Reserve for ESSER Carryforward"), "Reserve for ESSER Carryforward", "caps inside mixed case are deliberate");

console.log("\n[4] Codes are never re-cased");
eq(titleCase("1000"), "1000", "a numeric code");
eq(titleCase("K-12"), "K-12", "a grade span");
eq(titleCase("9-12 INSTRUCTION"), "9-12 Instruction", "digits beside words");
eq(titleCase("fy2026 carryforward"), "FY2026 Carryforward", "a short letter run beside digits is an abbreviation");
eq(titleCase("3RD GRADE READING"), "3rd Grade Reading", "an ordinal suffix goes lowercase");

console.log("\n[5] Minor words — lowercase inside, never at either end");
eq(titleCase("SALARIES AND BENEFITS"), "Salaries and Benefits", "'and' in the middle");
eq(titleCase("TRANSFERS IN"), "Transfers In", "'in' closing the name is capitalised");
eq(titleCase("OF SPECIAL REVENUE"), "Of Special Revenue", "…and so is one opening it");
eq(titleCase("OUT-OF-DISTRICT TUITION"), "Out-of-District Tuition", "hyphenated compounds keep the rule");
eq(titleCase("REVENUE FROM LOCAL SOURCES"), "Revenue from Local Sources", "'from'");
eq(titleCase("INTEREST ON INVESTMENTS"), "Interest on Investments", "'on'");
// The pair that decided the rule — see the note on MINOR in lib/text.ts.
eq(titleCase("CAPITAL AV MAT OVER $1000"), "Capital AV Mat over $1000", "'over' on one account row…");
eq(titleCase("AV MATERIALS UNDER $1000"), "AV Materials under $1000", "…and 'under' on the next one match");

console.log("\n[6] Separators are preserved, and cased on both sides");
eq(titleCase("FOOD SERVICE — SCHOOL LUNCH"), "Food Service — School Lunch", "an em dash");
eq(titleCase("SALARIES/BENEFITS"), "Salaries/Benefits", "a slash");
eq(titleCase("MAINTENANCE (NON-INSTRUCTIONAL)"), "Maintenance (Non-Instructional)", "parentheses");
eq(titleCase("CO&DS WITHHELD"), "CO&DS Withheld", "an ampersand inside an abbreviation");
eq(titleCase("TEACHERS' SALARIES"), "Teachers' Salaries", "a possessive");

console.log("\n[7] Names that are not ordinary words");
eq(titleCase("O'BRIEN ELEMENTARY"), "O'Brien Elementary", "an Irish prefix");
eq(titleCase("MCKINLEY MIDDLE SCHOOL"), "McKinley Middle School", "a Mc- surname from an ALL-CAPS import");
eq(titleCase("eSchool Program"), "eSchool Program", "deliberate internal capitals are left alone");
eq(titleCase("PREK PROGRAMS"), "PreK Programs", "an exception with its own canonical form");

console.log("\n[8] Rows the breakdowns build for themselves still read right");
eq(titleCase("Other (3)"), "Other (3)", "the folded-tail row");
eq(titleCase("Unknown Source"), "Unknown Source", "a placeholder");
eq(titleCase("No Cost Center Type"), "No Cost Center Type", "…and the longest one");

console.log("\n[9] displayName is null-safe and falls back rather than blanking a cell");
eq(displayName(null, "Unknown Source"), "Unknown Source", "null takes the fallback");
eq(displayName(undefined, "No Project"), "No Project", "undefined takes the fallback");
eq(displayName("   ", "No Project"), "No Project", "so does a name that is only whitespace");
eq(displayName(null), "", "with no fallback given, the empty string");
eq(displayName("GENERAL FUND"), "General Fund", "and a real name is formatted");

console.log("\n[10] codeName — the label written out longhand in fourteen places before");
eq(codeName("1000", "GENERAL FUND"), "1000 — General Fund", "code and name");
eq(codeName(null, "GENERAL FUND"), "General Fund", "a dimension with no code");
eq(codeName("", "general fund"), "General Fund", "an empty code is no code");
eq(codeName("3xx", "OTHER SERVICES"), "3xx — Other Services", "the CODE keeps the district's own casing");
eq(codeName("1000", ""), "1000", "a code whose name is missing still names itself");
eq(codeName("0021", "lincoln elementary"), "0021 — Lincoln Elementary", "a cost centre");

console.log(`\n──────── ${passed} passed, ${failed} failed ────────\n`);
process.exit(failed === 0 ? 0 : 1);
