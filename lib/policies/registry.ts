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
  /** The labelled sub-section this setting sits under on the form. */
  section?: string;
  /**
   * Kept in the policy and read by the engine, but never shown on the form. The form still
   * round-trips its stored value through a hidden input so a save doesn't drop it.
   */
  hidden?: boolean;
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
  section: string,
  max = 1000,
): Setting => ({ key, label, type: "percent", default: def, help, section, min: 0, max });

const toggle = (
  key: string,
  label: string,
  def: boolean,
  help: string,
  section: string,
): Setting => ({ key, label, type: "toggle", default: def, help, section });

export const POLICY_GROUPS: PolicyGroup[] = [
  {
    key: "revenue",
    title: "Revenues",
    description: "Define when revenue activity should generate alerts.",
    settings: [
      pct(
        "varianceWarning",
        "Revenue Variance — Warning",
        5,
        "Actual revenue is off budget by this amount.",
        "Current Performance",
      ),
      pct(
        "varianceCritical",
        "Revenue Variance — Critical",
        10,
        "Actual revenue is off budget by this amount.",
        "Current Performance",
      ),
      pct(
        "forecastVarianceWarning",
        "Forecast Variance — Warning",
        3,
        "Projected year-end revenue is off budget by this amount.",
        "Forecast Performance",
      ),
      pct(
        "forecastVarianceCritical",
        "Forecast Variance — Critical",
        5,
        "Projected year-end revenue is off budget by this amount.",
        "Forecast Performance",
      ),
      pct(
        "significantChange",
        "Month-over-Month Revenue Change",
        15,
        "Revenue changes by more than this from the previous month.",
        "Trend Monitoring",
      ),
      toggle(
        "flagOverCollected",
        "Flag lines collected above budget on import",
        true,
        "Over-collection is a real state, not an error — this only surfaces it as a warning you can acknowledge.",
        "Import Validation",
      ),
    ],
  },
  {
    key: "expenditure",
    title: "Expenditures",
    description: "Define when spending activity should generate alerts.",
    settings: [
      pct(
        "utilizationWarning",
        "Budget Utilization — Warning",
        80,
        "Budget is this much used (Actual + Encumbrances).",
        "Current Performance",
      ),
      pct(
        "utilizationCritical",
        "Budget Utilization — Critical",
        95,
        "Budget is this much used (Actual + Encumbrances).",
        "Current Performance",
      ),
      // Powers the "budget exceeded" alert. The redesigned form omits it, but the value is
      // still read by the alert engine, so it stays in the policy as a hidden setting.
      {
        key: "budgetExceeded",
        label: "Budget exceeded",
        type: "percent",
        default: 100,
        help: "Spending has passed the budget. Rarely worth moving.",
        hidden: true,
        min: 0,
        max: 1000,
      },
      pct(
        "momIncreaseWarning",
        "Month-over-Month Increase — Warning",
        15,
        "Spending changed by more than this from the previous month.",
        "Spending Trends",
      ),
      pct(
        "momIncreaseCritical",
        "Month-over-Month Increase — Critical",
        25,
        "Spending changed by more than this from the previous month.",
        "Spending Trends",
      ),
      pct(
        "forecastVarianceWarning",
        "Forecast Variance — Warning",
        3,
        "Projected year-end expenditures are off budget by this amount.",
        "Forecast Performance",
      ),
      pct(
        "forecastVarianceCritical",
        "Forecast Variance — Critical",
        5,
        "Projected year-end expenditures are off budget by this amount.",
        "Forecast Performance",
      ),
      // The workbook's three "negative-budget checks", switchable per district.
      toggle(
        "flagNegativeAvailable",
        "Flag Budget Overcommitted",
        true,
        "Actual expenditures and encumbrances exceed the remaining available budget.",
        "Import Validation",
      ),
      toggle(
        "flagActualOverBudget",
        "Flag Spend Above Budget",
        true,
        "Actual expenditures exceed the current budget.",
        "Import Validation",
      ),
      toggle(
        "flagEncumbrancesOverAvailable",
        "Flag Encumbrances Above Available Budget",
        true,
        "Encumbrances exceed the remaining available budget.",
        "Import Validation",
      ),
      toggle(
        "ignoreSalaryObjectsMom",
        "Ignore salary objects for month-over-month variance",
        false,
        "Exclude salary objects when computing month-over-month spending change.",
        "Import Validation",
      ),
    ],
  },
  {
    key: "cash",
    title: "Cash Policies",
    description: "Define when cash and liquidity should generate alerts.",
    settings: [
      {
        key: "daysCashWarning",
        label: "Days Cash on Hand — Warning",
        type: "days",
        default: 60,
        help: "Alert when available cash falls below this number of operating days.",
        section: "Current Position",
        min: 0,
        max: 999,
      },
      {
        key: "daysCashCritical",
        label: "Days Cash on Hand — Critical",
        type: "days",
        default: 45,
        help: "Alert when available cash falls below this number of operating days.",
        section: "Current Position",
        min: 0,
        max: 999,
      },
      pct(
        "decreaseWarning",
        "Cash Decrease — Warning",
        10,
        "Cash decreased by this percentage compared to the previous month.",
        "Trend Monitoring",
      ),
      pct(
        "decreaseCritical",
        "Cash Decrease — Critical",
        20,
        "Cash decreased by this percentage compared to the previous month.",
        "Trend Monitoring",
      ),
    ],
  },
  {
    key: "fundBalance",
    title: "Fund Balance",
    description:
      "The reserve level you aim to protect — unassigned fund balance as a share of the general fund budget.",
    settings: [
      pct(
        "target",
        "District Target",
        5,
        "What the district strives to maintain for long-term financial stability.",
        "Reserve Goals",
        100,
      ),
      pct(
        "boardPolicyMinimum",
        "Board Policy Minimum",
        3,
        "Minimum reserve levels required by board policy and state law.",
        "Compliance Requirements",
        100,
      ),
      pct(
        "stateMinimum",
        "State Minimum",
        2,
        "Minimum reserve levels required by board policy and state law.",
        "Compliance Requirements",
        100,
      ),
      pct(
        "warning",
        "Warning Threshold",
        4,
        "Alerts generated from CURRENT fund balance.",
        "Current Position Alerts",
        100,
      ),
      pct(
        "critical",
        "Critical Threshold",
        3,
        "Alerts generated from CURRENT fund balance.",
        "Current Position Alerts",
        100,
      ),
      pct(
        "forecastWarning",
        "Forecast Warning",
        4,
        "Alerts generated from PROJECTED year-end fund balance.",
        "Forecast Monitoring",
        100,
      ),
      pct(
        "forecastCritical",
        "Forecast Critical",
        3,
        "Alerts generated from PROJECTED year-end fund balance.",
        "Forecast Monitoring",
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
    ["decreaseWarning", "decreaseCritical", "rising"],
  ],
  fundBalance: [
    ["warning", "critical", "falling"],
    ["forecastWarning", "forecastCritical", "falling"],
  ],
};
