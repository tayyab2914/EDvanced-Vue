// A district's financial policies — the thresholds that decide when a number is worth
// worrying about.
//
// Declared once, here, and everything else reads them: the form is generated from this,
// the validator's business rules consult it, and the alert catalogue evaluates against
// it. Four hand-built forms would be four places to fix a typo, and the alert engine
// would end up with its own copy of "over budget" that drifted by the third month.
//
// Every default comes from the client's workbook, so a district that never opens this
// screen still behaves sensibly on day one.
//
// Pure and client-safe: no Prisma, no server-only. The form needs these labels.

export type SettingType = "percent" | "money" | "days" | "toggle";

export interface Setting {
  key: string;
  label: string;
  type: SettingType;
  /** The workbook's value. */
  default: number | boolean;
  /** One line, in the district's language, explaining what tripping this means. */
  help: string;
  min?: number;
  max?: number;
}

export type PolicyGroupKey = "revenue" | "expenditure" | "cash" | "fundBalance";

export interface PolicyGroup {
  key: PolicyGroupKey;
  title: string;
  description: string;
  settings: Setting[];
}

const pct = (
  key: string,
  label: string,
  def: number,
  help: string,
  max = 1000,
): Setting => ({ key, label, type: "percent", default: def, help, min: 0, max });

const toggle = (key: string, label: string, def: boolean, help: string): Setting => ({
  key,
  label,
  type: "toggle",
  default: def,
  help,
});

export const POLICY_GROUPS: PolicyGroup[] = [
  {
    key: "revenue",
    title: "Revenue",
    description:
      "How far collections can drift from budget before the platform says something.",
    settings: [
      pct(
        "varianceWarning",
        "Revenue variance — warning",
        5,
        "Actual revenue is off budget by this much, in either direction.",
      ),
      pct(
        "varianceCritical",
        "Revenue variance — critical",
        10,
        "Actual revenue is off budget by this much.",
      ),
      pct(
        "forecastVarianceWarning",
        "Forecast variance — warning",
        3,
        "Projected year-end revenue is off budget by this much.",
      ),
      pct(
        "forecastVarianceCritical",
        "Forecast variance — critical",
        5,
        "Projected year-end revenue is off budget by this much.",
      ),
      pct(
        "significantChange",
        "Significant month-over-month change",
        15,
        "Revenue moves by more than this against last month.",
      ),
      toggle(
        "flagOverCollected",
        "Flag lines collected above budget on import",
        true,
        "Over-collection is a real state, not an error — this only surfaces it as a warning you can acknowledge.",
      ),
    ],
  },
  {
    key: "expenditure",
    title: "Expenditure",
    description: "The point at which spending against a budget becomes a concern.",
    settings: [
      pct(
        "utilizationWarning",
        "Budget utilization — warning",
        80,
        "Budget is this much used, counting actual plus encumbrances.",
      ),
      pct(
        "utilizationCritical",
        "Budget utilization — critical",
        95,
        "Budget is this much used.",
      ),
      pct(
        "budgetExceeded",
        "Budget exceeded",
        100,
        "Spending has passed the budget. Rarely worth moving.",
      ),
      pct(
        "momIncreaseWarning",
        "Month-over-month increase — warning",
        15,
        "Spending jumped by this much against last month.",
      ),
      pct(
        "momIncreaseCritical",
        "Month-over-month increase — critical",
        25,
        "Spending jumped by this much against last month.",
      ),
      pct(
        "forecastVarianceWarning",
        "Forecast variance — warning",
        3,
        "Projected year-end spend is off budget by this much.",
      ),
      pct(
        "forecastVarianceCritical",
        "Forecast variance — critical",
        5,
        "Projected year-end spend is off budget by this much.",
      ),
      // The workbook's three "negative-budget checks", switchable per district.
      toggle(
        "flagNegativeAvailable",
        "Flag negative available budget",
        true,
        "Budget minus spend minus encumbrances has gone below zero.",
      ),
      toggle(
        "flagActualOverBudget",
        "Flag spend above budget",
        true,
        "A line has spent more than it was given.",
      ),
      toggle(
        "flagEncumbrancesOverAvailable",
        "Flag encumbrances above available budget",
        true,
        "Commitments exceed what is left after spend.",
      ),
    ],
  },
  {
    key: "cash",
    title: "Cash",
    description: "How low cash, or days of cash, can fall before a warning shows.",
    settings: [
      {
        key: "daysCashWarning",
        label: "Days cash on hand — warning",
        type: "days",
        default: 60,
        help: "Fewer than this many days of cash on hand.",
        min: 0,
        max: 999,
      },
      {
        key: "daysCashCritical",
        label: "Days cash on hand — critical",
        type: "days",
        default: 45,
        help: "Fewer than this many days of cash on hand.",
        min: 0,
        max: 999,
      },
      {
        key: "forecastCashWarning",
        label: "Forecast cash — warning",
        type: "money",
        default: 15_000_000,
        help: "Projected cash dips below this figure.",
        min: 0,
      },
      {
        key: "forecastCashCritical",
        label: "Forecast cash — critical",
        type: "money",
        default: 10_000_000,
        help: "Projected cash dips below this figure.",
        min: 0,
      },
      pct(
        "decreaseWarning",
        "Cash decrease — warning",
        10,
        "Cash fell by this much against last month.",
      ),
      pct(
        "decreaseCritical",
        "Cash decrease — critical",
        20,
        "Cash fell by this much against last month.",
      ),
    ],
  },
  {
    key: "fundBalance",
    title: "Fund balance",
    description:
      "The reserve level you aim to protect — unassigned fund balance as a share of the general fund budget.",
    settings: [
      pct(
        "target",
        "Target unassigned fund balance",
        5,
        "The reserve level the district aims to hold.",
        100,
      ),
      pct("warning", "Warning threshold", 4, "Reserve has slipped below this.", 100),
      pct("critical", "Critical threshold", 3, "Reserve has slipped below this.", 100),
      pct(
        "forecastWarning",
        "Forecast warning",
        4,
        "Projected year-end reserve below this.",
        100,
      ),
      pct(
        "forecastCritical",
        "Forecast critical",
        3,
        "Projected year-end reserve below this.",
        100,
      ),
    ],
  },
];

/** Every setting, flat, keyed "group.setting" — the alert catalogue's vocabulary. */
export const ALL_SETTINGS: { group: PolicyGroupKey; setting: Setting }[] =
  POLICY_GROUPS.flatMap((g) => g.settings.map((s) => ({ group: g.key, setting: s })));

export type PolicyValues = Record<PolicyGroupKey, Record<string, number | boolean>>;

/** The workbook's defaults, as a whole policy. */
export function defaultPolicy(): PolicyValues {
  const out = {} as PolicyValues;
  for (const g of POLICY_GROUPS) {
    out[g.key] = Object.fromEntries(g.settings.map((s) => [s.key, s.default]));
  }
  return out;
}

/**
 * Fills a stored policy out with defaults.
 *
 * Never throws and never returns a hole: a setting the district has not saved, or one
 * added to the registry after they last saved, falls back to the workbook. The alert
 * engine can therefore read any key without guarding, which is what keeps 27 alert
 * definitions readable.
 */
export function resolvePolicy(stored: Partial<Record<PolicyGroupKey, unknown>> | null): PolicyValues {
  const out = defaultPolicy();
  if (!stored) return out;

  for (const g of POLICY_GROUPS) {
    const saved = stored[g.key];
    if (!saved || typeof saved !== "object") continue;
    const rec = saved as Record<string, unknown>;
    for (const s of g.settings) {
      const v = rec[s.key];
      if (s.type === "toggle") {
        if (typeof v === "boolean") out[g.key][s.key] = v;
      } else if (typeof v === "number" && Number.isFinite(v)) {
        out[g.key][s.key] = v;
      }
    }
  }
  return out;
}

/**
 * Validates one group's submitted values.
 *
 * Returns per-field messages in the same shape as every other form in the product, so the
 * caller merges them in without translating.
 */
export function validateGroup(
  key: PolicyGroupKey,
  input: Record<string, unknown>,
): { values: Record<string, number | boolean>; errors: Record<string, string[]> } {
  const group = POLICY_GROUPS.find((g) => g.key === key)!;
  const values: Record<string, number | boolean> = {};
  const errors: Record<string, string[]> = {};

  for (const s of group.settings) {
    const raw = input[s.key];

    if (s.type === "toggle") {
      values[s.key] = raw === true || raw === "on" || raw === "true";
      continue;
    }

    const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
    if (!Number.isFinite(n)) {
      errors[s.key] = [`${s.label} must be a number.`];
      continue;
    }
    if (s.min !== undefined && n < s.min) {
      errors[s.key] = [`${s.label} can't be below ${s.min}.`];
      continue;
    }
    if (s.max !== undefined && n > s.max) {
      errors[s.key] = [`${s.label} can't be above ${s.max}.`];
      continue;
    }
    values[s.key] = n;
  }

  // A critical threshold that fires before its warning is not a validation nicety — it
  // means the district gets a red alert with no amber one first, which is exactly the
  // failure they configured thresholds to avoid.
  for (const [warn, crit, direction] of ORDERING[key] ?? []) {
    const w = values[warn];
    const c = values[crit];
    if (typeof w !== "number" || typeof c !== "number") continue;
    const wrong = direction === "rising" ? c < w : c > w;
    if (wrong) {
      const label = group.settings.find((s) => s.key === crit)!.label;
      errors[crit] = [
        direction === "rising"
          ? `${label} should be at or above the warning threshold, or the warning never fires first.`
          : `${label} should be at or below the warning threshold, or the warning never fires first.`,
      ];
    }
  }

  return { values, errors };
}

/**
 * Which pairs must stay in order, and which way.
 *
 * "rising" — the number grows toward trouble (utilisation, variance): critical >= warning.
 * "falling" — the number shrinks toward trouble (days of cash, reserve): critical <= warning.
 */
const ORDERING: Partial<Record<PolicyGroupKey, [string, string, "rising" | "falling"][]>> = {
  revenue: [
    ["varianceWarning", "varianceCritical", "rising"],
    ["forecastVarianceWarning", "forecastVarianceCritical", "rising"],
  ],
  expenditure: [
    ["utilizationWarning", "utilizationCritical", "rising"],
    ["momIncreaseWarning", "momIncreaseCritical", "rising"],
    ["forecastVarianceWarning", "forecastVarianceCritical", "rising"],
  ],
  cash: [
    ["daysCashWarning", "daysCashCritical", "falling"],
    ["forecastCashWarning", "forecastCashCritical", "falling"],
    ["decreaseWarning", "decreaseCritical", "rising"],
  ],
  fundBalance: [
    ["warning", "critical", "falling"],
    ["forecastWarning", "forecastCritical", "falling"],
  ],
};
