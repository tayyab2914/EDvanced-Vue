import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getTenantDb, userCan } from "@/lib/auth/dal";
import { resolveScope } from "@/lib/dashboard/scope";
import { labelMode } from "@/lib/dashboard/label-mode";
import { loadCore } from "@/lib/dashboard/load";
import { money } from "@/lib/dashboard/format";
import { formatDateTime } from "@/lib/format";
import { fundLabel } from "@/lib/finance/funds";
import { scopeOptions } from "@/lib/dashboard/options";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/dashboard/section-card";
import { OverrideForm } from "./override-form";
import { CORRECTABLE_COMPONENTS, componentBreakdown } from "@/lib/finance/fund-balance";

/**
 * Correcting the derived fund-balance figures (Spec §6.5) — the second of the two entry
 * screens the specification lists as a known gap.
 *
 * District Administrators only, enforced here as well as in the action. Hiding the link
 * is not access control.
 *
 * ---------------------------------------------------------------------------
 * THE WHOLE SHEET, NOT A FIELD AT A TIME.
 *
 * The client, on seeing the first version: "could the layout be changed so it isn't in a
 * dropdown — all the fund balance components are listed, there is the system calculated
 * column which cannot be edited, and the corrected column they can just type."
 *
 * Behind the layout that is a real correction to how the screen thought. A dropdown asks
 * "which one figure is wrong?", and a district reconciling to an audit adjustment does not
 * have that answer — it has a corrected sheet, and it wants to enter it and see the total
 * it lands on before saving. So every component is a row, the calculated column is the
 * platform's figure and is read-only, and the total is derived from the entries rather than
 * being a seventh thing to type. See the note in app/actions/fund-balance.ts.
 * ---------------------------------------------------------------------------
 */
export default async function OverridePage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string; period?: string; fund?: string }>;
}) {
  const { db, user, districtId } = await getTenantDb();
  if (!userCan(user, "override_fund_balance")) redirect("/fund-balance");

  const sp = await searchParams;
  if (!sp.fund) notFound();

  const scope = await resolveScope(db, districtId, sp, await labelMode());
  if (scope.empty || !scope.fund) notFound();

  const core = await loadCore(db, districtId, scope);

  /**
   * What the platform calculated for each component and for the total, from the same
   * derivation the action re-runs when it stores the correction. A correction entered
   * without the computed value beside it is a number typed into the dark, and a computed
   * value the write path would not recognise is worse than none.
   */
  const [breakdown, existing] = await Promise.all([
    componentBreakdown(db, scope, core.codes),
    db.fundBalanceOverride.findMany({
      where: { fiscalYear: scope.fiscalYear, period: scope.period, fundId: scope.fund.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const corrections = new Map(existing.map((o) => [o.field as string, o]));

  const rows = CORRECTABLE_COMPONENTS.map((field) => ({
    field,
    label: LABELS[field],
    calculated: breakdown.components[field].toFixed(2),
    calculatedDisplay: money(breakdown.components[field]),
    corrected: corrections.get(field)?.value.toFixed(2) ?? "",
  }));

  const totalOverride = corrections.get("TOTAL");

  return (
    <div className="animate-fade-up mx-auto max-w-[820px] space-y-[18px]">
      <PageHeader
        title="Correct a fund balance figure"
        description={`${fundLabel(scope.fund, scope.labelMode)} · ${scope.label}`}
        actions={
          <Link
            href={scopeOptions(scope).link(
              `/fund-balance?fy=${scope.fiscalYear}&period=${scope.period}`,
            )}
            className="text-[12.5px] font-medium text-brand hover:underline"
          >
            Back to fund balance
          </Link>
        }
      />

      <div className="rounded-xl border border-monitor-bg bg-monitor-bg px-4 py-3 text-[12.5px] leading-relaxed text-monitor">
        <strong className="font-semibold">This corrects figures the platform calculated.</strong>{" "}
        Each is labelled as an override wherever it appears afterwards, it is versioned with the
        period it corrects, and it is cleared automatically if you later replace this
        period&apos;s data — because the numbers underneath will have changed.
      </div>

      <SectionCard
        title="Fund balance components"
        subtitle="Type over any figure that is wrong. The total follows your entries."
      >
        <OverrideForm
          fiscalYear={scope.fiscalYear}
          period={scope.period}
          fundId={scope.fund.id}
          rows={rows}
          total={{
            calculated: breakdown.total.toFixed(2),
            calculatedDisplay: money(breakdown.total),
          }}
          hasCorrections={existing.length > 0}
          reason={existing.find((o) => o.field !== "TOTAL")?.reason ?? ""}
        />
        {!breakdown.found && (
          <p className="mt-4 text-[11.5px] leading-relaxed text-monitor">
            No opening fund balance has been imported for this year, so the components read
            zero and the calculated total is only the year&apos;s net change.
          </p>
        )}
        {breakdown.found && !breakdown.gap.isZero() && (
          <p className="mt-4 text-[11.5px] leading-relaxed text-monitor">
            The imported total is {money(breakdown.gap)} away from the sum of the components
            above — the Total column on the opening balance file does not foot to the four
            designated columns beside it. Your corrections move the total by exactly what you
            change; they do not absorb that difference.
          </p>
        )}
      </SectionCard>

      {existing.length > 0 && (
        <SectionCard title="Corrections in force" subtitle="For this fund and period">
          <ul className="flex flex-col divide-y divide-line-soft">
            {existing.map((o) => (
              <li key={o.id} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[12.5px] font-medium text-ink">
                    {LABELS[o.field] ?? o.field}
                    {o.field === "TOTAL" && (
                      <span className="ml-1.5 text-[11px] font-normal text-muted-2">
                        derived
                      </span>
                    )}
                  </span>
                  <span className="text-[13px] font-semibold tabular-nums text-ink">
                    {money(o.value)}
                  </span>
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">{o.reason}</p>
                <p className="mt-1 text-[11px] text-muted-2">
                  Entered {formatDateTime(o.createdAt)}
                </p>
              </li>
            ))}
          </ul>
          {totalOverride && (
            <p className="mt-3 text-[11.5px] text-muted-2">
              The total is not entered by hand — it is the calculated total with your
              component corrections applied, and it is rewritten every time you save.
            </p>
          )}
        </SectionCard>
      )}
    </div>
  );
}

export const LABELS: Record<string, string> = {
  TOTAL: "Total fund balance",
  UNASSIGNED: "Unassigned",
  NONSPENDABLE: "Nonspendable",
  RESTRICTED: "Restricted",
  COMMITTED: "Committed",
  ASSIGNED: "Assigned",
};
