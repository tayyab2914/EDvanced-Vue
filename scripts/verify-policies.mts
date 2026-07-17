import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { makeTenantExtension } from "@/lib/tenant-scope";
import type { TenantDb } from "@/lib/tenant-db";
import {
  ALL_SETTINGS,
  POLICY_GROUPS,
  defaultPolicy,
  resolvePolicy,
  validateGroup,
} from "@/lib/policies/registry";
import { loadPolicy, toBusinessRules } from "@/lib/policies/load";

/**
 * Checks the policy registry and that the district's own thresholds actually reach the
 * import validator — the seam M2.5 was built against.
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

async function main() {
  // ---- the registry ----
  console.log("\nRegistry");
  assert(POLICY_GROUPS.length === 4, `four groups (${POLICY_GROUPS.length})`);
  assert(
    POLICY_GROUPS.map((g) => g.key).join() === "revenue,expenditure,cash,fundBalance",
    "the workbook's four: revenue, expenditure, cash, fund balance",
  );
  assert(ALL_SETTINGS.length >= 22, `at least the workbook's 22 settings (${ALL_SETTINGS.length})`);

  const keys = ALL_SETTINGS.map((s) => `${s.group}.${s.setting.key}`);
  assert(new Set(keys).size === keys.length, "no setting is declared twice");
  assert(
    ALL_SETTINGS.every((s) => s.setting.help.trim().length > 0),
    "every setting explains what tripping it means",
  );
  assert(
    ALL_SETTINGS.every((s) => s.setting.label.trim().length > 0),
    "and carries a label",
  );

  // The workbook's numbers, spelled out. If one of these changes it should be because the
  // client changed it, not because someone tidied a default.
  console.log("\nThe workbook's defaults");
  const d = defaultPolicy();
  assert(d.revenue.varianceWarning === 5, "revenue variance warning is ±5%");
  assert(d.revenue.varianceCritical === 10, "revenue variance critical is ±10%");
  assert(d.expenditure.utilizationWarning === 80, "budget utilization warning is 80%");
  assert(d.expenditure.utilizationCritical === 95, "budget utilization critical is 95%");
  assert(d.expenditure.budgetExceeded === 100, "budget exceeded is 100%");
  assert(d.expenditure.momIncreaseWarning === 15, "month-over-month warning is 15%");
  assert(d.expenditure.momIncreaseCritical === 25, "month-over-month critical is 25%");
  assert(d.cash.daysCashWarning === 60, "days cash warning is 60 days");
  assert(d.cash.daysCashCritical === 45, "days cash critical is 45 days");
  assert(d.cash.forecastCashWarning === 15_000_000, "forecast cash warning is $15.0M");
  assert(d.cash.forecastCashCritical === 10_000_000, "forecast cash critical is $10.0M");
  assert(d.cash.decreaseWarning === 10, "cash decrease warning is 10%");
  assert(d.cash.decreaseCritical === 20, "cash decrease critical is 20%");
  assert(d.fundBalance.target === 5, "target unassigned fund balance is 5%");
  assert(d.fundBalance.warning === 4, "fund balance warning is 4%");
  assert(d.fundBalance.critical === 3, "fund balance critical is 3%");

  // ---- resolution ----
  console.log("\nResolving a stored policy");
  assert(
    resolvePolicy(null).cash.daysCashWarning === 60,
    "a district that never saved gets the workbook's values",
  );
  const partial = resolvePolicy({ cash: { daysCashWarning: 30 } });
  assert(partial.cash.daysCashWarning === 30, "a saved value wins");
  assert(
    partial.cash.daysCashCritical === 45,
    "and its unsaved siblings still fall back — the alert engine never reads a hole",
  );
  assert(
    resolvePolicy({ revenue: { nonsense: 1 } }).revenue.varianceWarning === 5,
    "a stale key from an older version is ignored, not crashed on",
  );
  assert(
    resolvePolicy({ cash: { daysCashWarning: "sixty" } as never }).cash.daysCashWarning === 60,
    "a value of the wrong type falls back rather than poisoning a comparison",
  );
  assert(
    resolvePolicy({ expenditure: { flagNegativeAvailable: false } }).expenditure
      .flagNegativeAvailable === false,
    "a toggle turned OFF is honoured — false is a value, not a missing one",
  );

  // ---- validation ----
  console.log("\nValidation");
  const ok = validateGroup("cash", {
    daysCashWarning: "60",
    daysCashCritical: "45",
    forecastCashWarning: "15000000",
    forecastCashCritical: "10000000",
    decreaseWarning: "10",
    decreaseCritical: "20",
  });
  assert(Object.keys(ok.errors).length === 0, "valid input passes");
  assert(ok.values.daysCashWarning === 60, "and is coerced to numbers");

  const bad = validateGroup("cash", { daysCashWarning: "abc" });
  assert(!!bad.errors.daysCashWarning, "text where a number belongs is refused");

  const negative = validateGroup("revenue", { varianceWarning: "-5" });
  assert(!!negative.errors.varianceWarning, "a negative percentage is refused");

  // The ordering rule: a critical that fires before its warning means a red alert with no
  // amber first — exactly what thresholds exist to prevent.
  console.log("\nWarning must fire before critical");
  const rising = validateGroup("expenditure", {
    utilizationWarning: "95",
    utilizationCritical: "80",
  });
  assert(
    !!rising.errors.utilizationCritical,
    "a rising threshold with critical BELOW warning is refused",
  );
  const risingOk = validateGroup("expenditure", {
    utilizationWarning: "80",
    utilizationCritical: "95",
  });
  assert(!risingOk.errors.utilizationCritical, "and the right way round passes");

  const falling = validateGroup("cash", { daysCashWarning: "45", daysCashCritical: "60" });
  assert(
    !!falling.errors.daysCashCritical,
    "a FALLING threshold is the other way round: critical must be below warning",
  );
  const fallingOk = validateGroup("cash", { daysCashWarning: "60", daysCashCritical: "45" });
  assert(!fallingOk.errors.daysCashCritical, "60 then 45 passes");

  const reserve = validateGroup("fundBalance", { warning: "3", critical: "4" });
  assert(!!reserve.errors.critical, "the reserve thresholds fall too — critical below warning");

  const equal = validateGroup("expenditure", {
    utilizationWarning: "90",
    utilizationCritical: "90",
  });
  assert(
    !equal.errors.utilizationCritical,
    "equal thresholds are allowed — a district may want one line, not two",
  );

  // ---- the seam ----
  console.log("\nThe district's rules reach the import validator");
  const district = await prisma.district.findFirst({ orderBy: { createdAt: "asc" } });
  if (!district) {
    console.log("No district found — run `npm run seed:demo` first.");
    process.exit(1);
  }
  const db = tenantDb(district.id);
  const had = await db.districtPolicy.findFirst({ where: { districtId: district.id } });

  try {
    const fresh = await loadPolicy(db, district.id);
    assert(
      typeof fresh.cash.daysCashWarning === "number",
      "loadPolicy always returns a complete policy",
    );

    const rules = toBusinessRules(defaultPolicy());
    assert(rules.flagRevenueOverCollected === true, "by default, over-collection is flagged");
    assert(rules.flagNegativeAvailableBudget === true, "and negative available budget");

    // Turning a rule off in the policy must actually silence the import warning. This is
    // the whole point of the seam: business-rules.ts never forked, its source changed.
    const off = defaultPolicy();
    off.expenditure.flagNegativeAvailable = false;
    off.revenue.flagOverCollected = false;
    const offRules = toBusinessRules(off);
    assert(
      offRules.flagNegativeAvailableBudget === false,
      "switching a check off in the policy switches off the import warning",
    );
    assert(offRules.flagRevenueOverCollected === false, "and the same for over-collection");

    await db.districtPolicy.upsert({
      where: { districtId: district.id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: { districtId: district.id, ...defaultPolicy(), cash: { daysCashWarning: 90 } } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: { cash: { daysCashWarning: 90 } } as any,
    });
    const saved = await loadPolicy(db, district.id);
    assert(saved.cash.daysCashWarning === 90, "a saved threshold round-trips through the database");
    assert(
      saved.cash.daysCashCritical === 45,
      "and its unsaved siblings still resolve to the workbook",
    );
  } finally {
    if (had) {
      await prisma.districtPolicy.update({
        where: { districtId: district.id },
        data: {
          revenue: had.revenue as never,
          expenditure: had.expenditure as never,
          cash: had.cash as never,
          fundBalance: had.fundBalance as never,
        },
      });
    } else {
      await prisma.districtPolicy.deleteMany({ where: { districtId: district.id } });
    }
  }

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
