/**
 * ONE display convention for every name a district types.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 *
 * Master data is typed by people and imported from files that were typed by other people.
 * The same fund arrives as `general fund`, `GENERAL FUND`, and `General Fund` depending on
 * which district uploaded it and which of their spreadsheets it came from — and every one of
 * those was rendered verbatim, so a single dashboard could show `GENERAL FUND` in the fund
 * selector, `Purchased services` in a table, and `TRANSPORTATION` in a chart legend.
 *
 * The client's ask was to standardise the *display*, not the stored value: "if a user imports
 * general fund, GENERAL FUND, or General Fund, the dashboard should consistently display it
 * using a predefined format … Title Case for names and labels. Reserve ALL CAPS only for
 * abbreviations and codes such as FEFP, IDEA, ESSER, FTE, 1000."
 *
 * So this normalises on the READ path, not the write path. The district's own text stays in
 * the database exactly as they entered it, which matters for three reasons: their import file
 * remains reconcilable against what we stored, the master-data screens keep showing them
 * their own words while they edit them, and existing rows are fixed without a migration.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS NOT A ONE-LINE `s.replace` THAT CAPITALISES EVERY `\w\S*`
 *
 * The naive one-liner gets the easy half right and mangles the half a finance officer
 * actually notices: `FEFP` becomes `Fefp`, `ESSER II` becomes `Esser Ii`, `Salaries and
 * Benefits` becomes `Salaries And Benefits`, and `K-12` becomes `K-12` only by luck.
 *
 * Every rule below exists because one of those is wrong on a real chart of accounts.
 */

/**
 * Words that stay lowercase INSIDE a name.
 *
 * Never when they open or close it — "Of Special Revenue" is wrong and so is "Transfers
 * In → in". The first and last word of a name is always capitalised, which is the rule every
 * style guide agrees on and the only one a reader notices being broken.
 *
 * Prepositions are here regardless of length, which is Chicago rather than AP. The choice is
 * not cosmetic: a chart of accounts carries `AV MATERIALS UNDER $1000` two rows from `CAPITAL
 * AV MAT OVER $1000`, and AP's four-letter cutoff would set one as `Under` and the other as
 * `over` in the same table. A rule that splits a matched pair of account names is the wrong
 * rule whichever way round it does it.
 */
const MINOR = new Set([
  // Articles and conjunctions
  "a", "an", "and", "as", "but", "nor", "or", "the",
  // Prepositions, long and short alike
  "about", "across", "after", "against", "along", "among", "around", "at", "before", "behind",
  "below", "beneath", "beside", "between", "beyond", "by", "down", "during", "for", "from",
  "in", "inside", "into", "near", "of", "off", "on", "onto", "outside", "over", "past", "per",
  "since", "than", "through", "throughout", "to", "toward", "under", "until", "up", "upon",
  "v", "versus", "via", "vs", "with", "within", "without",
]);

/**
 * Abbreviations and codes that stay upper-case — the client's carve-out.
 *
 * Needed because an ALL-CAPS import gives us nothing to infer from: in `FEFP TRANSPORTATION`
 * both tokens look identical to a case-folder, and only a dictionary knows the first is an
 * acronym and the second is a word. Heavily weighted to school finance because that is what
 * this application's chart of accounts is made of.
 *
 * A missing entry degrades gracefully — an unknown acronym title-cases instead of staying
 * upper. Add to the list rather than reaching for a cleverer rule.
 *
 * THE CLEVERER RULE THAT WAS TRIED AND REMOVED: "a token with no vowel in it is an
 * abbreviation, so leave it upper". It needs no dictionary and it is wrong on the data this
 * application actually holds. Florida's Red Book squeezes account names into 25 characters by
 * dropping vowels, so a real chart of accounts is full of TCHR, TCHRS, BD, FD, GRT, SCH and
 * WRKFCE — truncated words, not initialisms. The heuristic turned `SALARIES - CLASSROOM TCHR`
 * into `Salaries - Classroom TCHR`, shouting one word in the middle of a title-cased name, and
 * it could not tell those from the genuine initialisms beside them. A dictionary can.
 */
const ACRONYMS = new Set([
  // Funding programmes and federal grants
  "FEFP", "IDEA", "ESSER", "ESSA", "ESEA", "NCLB", "ARP", "ARRA", "CARES", "CRRSA", "GEER",
  "TANF", "WIA", "WIOA", "NSLP", "SNAP", "USDA", "FEMA", "PECO", "CO&DS", "SAI", "EIA", "SIG",
  // Statutory references, debt instruments and fund shorthands from Red Book account names
  // ("GO", for general-obligation bonds, is deliberately absent: no fund in the data needs it
  // and it would turn any project named "Go …" into "GO …".)
  "PL", "SRF", "DS", "R&D", "COP", "COPS", "LCIF",
  // Equipment and services, where an initialism is the only way the row is ever written
  "AV", "PBX", "GPS", "VOIP", "LAN", "WAN", "CCTV",
  // Students and programmes
  "FTE", "FTES", "ELL", "ESOL", "ESL", "ESE", "IEP", "VPK", "GED", "CTE", "ROTC", "JROTC",
  "STEM", "STEAM", "AP", "IB", "SAT", "ACT", "PE", "PPE", "ADA", "ADM", "SRO", "SAC", "SIP",
  "MOE", "LEA", "SEA",
  // Agencies and standards
  "DOE", "FDOE", "SBE", "GAAP", "GASB", "OPEB", "TRIM", "MSTU", "CIP", "COVID",
  // Payroll and benefits. NOT "PERS" — on a Florida chart of accounts `SALARIES - OTR SUP
  // PERS` is personnel, not a retirement system, and the state system there is FRS.
  "FICA", "FRS", "SUTA", "FUTA", "HSA", "FSA",
  // Operations and administration
  "HVAC", "IT", "HR", "EMS", "PTO", "PTA", "RFP", "RFQ", "MOU", "TV",
  // Periods, the ones that reach a label
  "YTD", "MTD", "FY",
  // Roman numerals, for "Title I", "ESSER II", "Part III"
  "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII",
]);

/** Names whose canonical form is neither Title Case nor ALL CAPS. */
const EXCEPTIONS = new Map([
  ["prek", "PreK"],
  ["prekindergarten", "PreKindergarten"],
  ["mcgraw", "McGraw"],
]);

/**
 * Letters, digits and the marks that live inside a word. Everything else separates.
 *
 * An ampersand counts as inside a word only when letters sit tight against both sides, which
 * is what keeps `CO&DS` one abbreviation while `Salaries & Benefits` stays three words.
 */
const WORD = /[\p{L}\p{N}](?:[\p{L}\p{N}'’]|&(?=[\p{L}\p{N}]))*/gu;

/**
 * Abbreviations that are spelt with a space inside them, fixed after the word pass.
 *
 * `CO & DS` — capital outlay and debt service, a Florida revenue line — is three tokens, and
 * `CO` cannot go in the dictionary above without turning every `Co-Curricular` into
 * `CO-Curricular`. Repairing the phrase afterwards keeps the token rules honest, and matching
 * case-insensitively keeps the whole function idempotent.
 */
const PHRASES: [RegExp, string][] = [[/\bco (& |and )ds\b/giu, "CO $1DS"]];

/**
 * Capitalisation that was deliberate rather than sloppy.
 *
 * `eSchool` / `iReady` — a short lowercase prefix, then one capital, then the word.
 * `McKinley` / `DeSoto` / `LaGrange` — two capitalised parts run together.
 *
 * Deliberately narrow. The first version of this rule preserved any token holding a
 * lowercase-then-uppercase pair, which meant `gEnErAl FuND` — a real thing a person types
 * into a spreadsheet at 5pm — was mistaken for intent and passed through untouched.
 */
const DELIBERATE = /^(?:\p{Ll}{1,2}\p{Lu}\p{Ll}+|\p{Lu}\p{Ll}+\p{Lu}\p{Ll}+)$/u;

/**
 * Formats one word, given what surrounds it.
 *
 * `terminal` — the word opens or closes the whole name, so a minor word is capitalised.
 * `inferAcronyms` — the source string mixes cases, so an ALL-CAPS word in it was deliberate.
 */
function word(raw: string, terminal: boolean, inferAcronyms: boolean): string {
  const upper = raw.toUpperCase();
  const lower = raw.toLowerCase();

  const exception = EXCEPTIONS.get(lower);
  if (exception) return exception;

  // ---- anything carrying a digit is a code, and codes are left alone ----
  //
  // `1000`, `K-12`, `9-12`, `FY2026`, `PK3` all mean something exactly as typed, and the one
  // transformation that helps is lower-casing an ordinal suffix. Short letter runs beside
  // digits are abbreviations (`fy2026` → `FY2026`); longer ones are words somebody typed
  // deliberately (`Grade3`), so those stay as they are.
  if (/\p{N}/u.test(raw)) {
    const ordinal = /^(\p{N}+)(st|nd|rd|th)$/iu.exec(raw);
    if (ordinal) return `${ordinal[1]}${ordinal[2].toLowerCase()}`;
    const letters = raw.replace(/\P{L}/gu, "");
    return letters.length > 0 && letters.length <= 3 ? upper : raw;
  }

  if (ACRONYMS.has(upper)) return upper;

  // The source told us this one was already deliberate: an ALL-CAPS word inside a string
  // that also contains lowercase — "Title I ESSER Reserve" — was typed that way on purpose.
  if (inferAcronyms && raw.length >= 2 && raw === upper) return upper;

  // Deliberate internal capitals — eSchool, iReady, McKinley, DeSoto. Preserved verbatim,
  // and the escape hatch for anything the rules above would flatten.
  if (DELIBERATE.test(raw)) return raw;

  if (!terminal && MINOR.has(lower)) return lower;

  // O'Brien, D'Angelo — and McKinley from an ALL-CAPS source.
  const irish = /^([odl])['’](\p{L}.*)$/iu.exec(raw);
  if (irish) return `${irish[1].toUpperCase()}${raw[1]}${cap(irish[2])}`;

  const mc = /^mc(\p{L}{2,})$/iu.exec(raw);
  if (mc) return `Mc${cap(mc[1])}`;

  return cap(raw);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Repeats are free.
 *
 * Every dashboard formats the same forty fund and cost-centre names dozens of times over —
 * once per table row, chart label, filter option and chip. Bounded because the keys are
 * district data rather than a fixed set, and a cache that grows with imports is a leak.
 */
const cache = new Map<string, string>();
const CACHE_MAX = 2000;

/**
 * `GENERAL FUND` → `General Fund`. `fefp — state` → `FEFP — State`. `1000` → `1000`.
 *
 * Idempotent: formatting an already-formatted name returns it unchanged, which is what makes
 * it safe to apply at more than one layer without the layers fighting.
 */
export function titleCase(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";

  const hit = cache.get(trimmed);
  if (hit !== undefined) return hit;

  const words = [...trimmed.matchAll(WORD)];
  if (words.length === 0) return trimmed;

  // Mixed case in the source means an ALL-CAPS word in it was a deliberate acronym. An
  // all-upper or all-lower source says nothing, so only the dictionary applies there.
  const inferAcronyms = /\p{Ll}/u.test(trimmed) && /\p{Lu}/u.test(trimmed);

  const first = words[0];
  const last = words[words.length - 1];

  let out = "";
  let at = 0;
  for (const m of words) {
    const start = m.index;
    out += trimmed.slice(at, start);
    out += word(m[0], m === first || m === last, inferAcronyms);
    at = start + m[0].length;
  }
  out += trimmed.slice(at);

  for (const [pattern, replacement] of PHRASES) out = out.replace(pattern, replacement);

  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(trimmed, out);
  return out;
}

/**
 * The display form of a master-data name, null-safe.
 *
 * `fallback` is returned for a missing or blank name — pass the same placeholder the column
 * uses elsewhere ("Unknown Source", "No Project") rather than letting a blank cell appear.
 */
export function displayName(raw: string | null | undefined, fallback = ""): string {
  if (raw === null || raw === undefined) return fallback;
  const formatted = titleCase(raw);
  return formatted || fallback;
}

/**
 * `1000 — General Fund`, or just the name when the dimension has no code.
 *
 * Codes are shown with their names resolved everywhere (§5.19), and this was written out
 * longhand in fourteen places — every one of them free to drift into a hyphen, a colon, or a
 * code shown without its name. The code itself is NEVER re-cased: it is the district's key
 * into their own chart of accounts, and `3xx` is not `3XX`.
 */
export function codeName(code: string | null | undefined, name: string | null | undefined): string {
  const label = displayName(name);
  const c = code?.trim() ?? "";
  if (!c) return label;
  return label ? `${c} — ${label}` : c;
}
