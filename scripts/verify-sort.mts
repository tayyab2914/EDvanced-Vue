import { nextSort, sortRows, type SortState } from "@/lib/sort";

/** Checks the table-sorting rules in lib/sort.ts (drives every sortable column in the app). */
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

type Row = { id: string; name: string; n: number | null; when: Date | null };
const get = (r: Row, key: string) =>
  key === "name" ? r.name : key === "n" ? r.n : key === "when" ? r.when : null;

const order = (rows: Row[], s: SortState) =>
  sortRows(rows, get, s).map((r) => r.id).join(",");

console.log("\n[1] Ascending / descending");
const names: Row[] = [
  { id: "b", name: "Beta", n: 2, when: null },
  { id: "a", name: "alpha", n: 1, when: null },
  { id: "c", name: "Gamma", n: 3, when: null },
];
assert(order(names, { key: "name", dir: "asc" }) === "a,b,c", "asc sorts A→Z");
assert(order(names, { key: "name", dir: "desc" }) === "c,b,a", "desc sorts Z→A");
assert(
  order(names, { key: "name", dir: "asc" }) === "a,b,c",
  "sorting is case-insensitive ('alpha' before 'Beta', not after)",
);

console.log("\n[2] Numbers sort as numbers, not as text");
const nums: Row[] = [
  { id: "ten", name: "x", n: 10, when: null },
  { id: "nine", name: "x", n: 9, when: null },
  { id: "hundred", name: "x", n: 100, when: null },
];
assert(
  order(nums, { key: "n", dir: "asc" }) === "nine,ten,hundred",
  "9 < 10 < 100 (a text sort would give 10, 100, 9)",
);

console.log("\n[3] Codes sort naturally");
const codes: Row[] = [
  { id: "c10", name: "Fund 10", n: null, when: null },
  { id: "c2", name: "Fund 2", n: null, when: null },
  { id: "c1", name: "Fund 1", n: null, when: null },
];
assert(
  order(codes, { key: "name", dir: "asc" }) === "c1,c2,c10",
  "'Fund 2' before 'Fund 10' (numeric collation)",
);

console.log("\n[4] Dates sort chronologically");
const dates: Row[] = [
  { id: "new", name: "x", n: null, when: new Date("2026-06-01") },
  { id: "old", name: "x", n: null, when: new Date("2024-01-15") },
  { id: "mid", name: "x", n: null, when: new Date("2025-03-20") },
];
assert(order(dates, { key: "when", dir: "asc" }) === "old,mid,new", "oldest first on asc");
assert(order(dates, { key: "when", dir: "desc" }) === "new,mid,old", "newest first on desc");

console.log("\n[5] Blanks always sink — in BOTH directions");
const blanks: Row[] = [
  { id: "empty", name: "x", n: null, when: null },
  { id: "two", name: "x", n: 2, when: null },
  { id: "one", name: "x", n: 1, when: null },
];
assert(
  order(blanks, { key: "n", dir: "asc" }) === "one,two,empty",
  "blank rows sit at the bottom ascending",
);
assert(
  order(blanks, { key: "n", dir: "desc" }) === "two,one,empty",
  "blank rows STILL sit at the bottom descending (not flipped to the top)",
);

console.log("\n[6] Ties keep the server's order (stable sort)");
const ties: Row[] = [
  { id: "first", name: "same", n: null, when: null },
  { id: "second", name: "same", n: null, when: null },
  { id: "third", name: "same", n: null, when: null },
];
assert(
  order(ties, { key: "name", dir: "asc" }) === "first,second,third" &&
    order(ties, { key: "name", dir: "desc" }) === "first,second,third",
  "equal values are not reshuffled",
);

console.log("\n[7] The input array is never mutated");
const original: Row[] = [
  { id: "b", name: "B", n: null, when: null },
  { id: "a", name: "A", n: null, when: null },
];
sortRows(original, get, { key: "name", dir: "asc" });
assert(original.map((r) => r.id).join(",") === "b,a", "sortRows returns a copy");

console.log("\n[8] Click behaviour: new column → asc, same column → flip");
assert(nextSort(null, "name").dir === "asc", "first click on a column sorts ascending");
assert(
  nextSort({ key: "name", dir: "asc" }, "name").dir === "desc",
  "clicking the active column flips asc → desc",
);
assert(
  nextSort({ key: "name", dir: "desc" }, "name").dir === "asc",
  "clicking again flips desc → asc",
);
assert(
  nextSort({ key: "name", dir: "desc" }, "email").key === "email" &&
    nextSort({ key: "name", dir: "desc" }, "email").dir === "asc",
  "switching to a different column starts ascending again",
);

console.log("\n[9] No sort selected leaves the order alone");
assert(
  sortRows(names, get, null).map((r) => r.id).join(",") === "b,a,c",
  "a null sort is the server's order, untouched",
);

console.log(`\n──────── ${passed} passed, ${failed} failed ────────\n`);
process.exit(failed === 0 ? 0 : 1);
