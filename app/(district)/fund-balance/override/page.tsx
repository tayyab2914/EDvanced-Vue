import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getTenantDb, userCan } from "@/lib/auth/dal";
import { resolveScope } from "@/lib/dashboard/scope";
import { loadCore } from "@/lib/dashboard/load";
import { money, compactMoney } from "@/lib/dashboard/format";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/dashboard/section-card";
import { OverrideForm } from "./override-form";
import { FundBalanceField } from "@/lib/enums";

/**
 * Correcting a derived fund-balance figure (Spec §6.5) — the second of the two entry
 * screens the specification lists as a known gap.
 *
 * District Administrators only, enforced here as well as in the action. Hiding the link
 * is not access control.
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

  const scope = await resolveScope(db, districtId, sp);
  if (scope.empty || !scope.fund) notFound();

  const core = await loadCore(db, districtId, scope);
  const computed = core.point?.fundBalance ?? null;
  const computedUnassigned = core.point?.unassignedFundBalance ?? null;

  const existing = await db.fundBalanceOverride.findMany({
    where: { fiscalYear: scope.fiscalYear, period: scope.period, fundId: scope.fund.id },
  });

  const opening = core.series.opening;

  /**
   * What the platform computed for each component, so the form can show both figures side
   * by side. A correction entered without the computed value beside it is a number typed
   * into the dark.
   */
  const computedFor: Record<string, string> = {
    [FundBalanceField.TOTAL]: money(computed),
    [FundBalanceField.UNASSIGNED]: money(computedUnassigned),
    [FundBalanceField.NONSPENDABLE]: money(opening?.nonspendable),
    [FundBalanceField.RESTRICTED]: money(opening?.restricted),
    [FundBalanceField.COMMITTED]: money(opening?.committed),
    [FundBalanceField.ASSIGNED]: money(opening?.assigned),
  };

  return (
    <div className="animate-fade-up mx-auto max-w-[720px] space-y-[18px]">
      <PageHeader
        title="Correct a fund balance figure"
        description={`${scope.fund.code} — ${scope.fund.name} · ${scope.label}`}
        actions={
          <Link
            href={`/fund-balance?fy=${scope.fiscalYear}&period=${scope.period}`}
            className="text-[12.5px] font-medium text-brand hover:underline"
          >
            Back to fund balance
          </Link>
        }
      />

      <div className="rounded-xl border border-monitor-bg bg-monitor-bg px-4 py-3 text-[12.5px] leading-relaxed text-monitor">
        <strong className="font-semibold">This corrects a figure the platform calculated.</strong>{" "}
        It is labelled as an override wherever it appears afterwards, it is versioned with the
        period it corrects, and it is cleared automatically if you later replace this
        period&apos;s data — because the numbers underneath will have changed.
      </div>

      <SectionCard title="The correction">
        <OverrideForm
          fiscalYear={scope.fiscalYear}
          period={scope.period}
          fundId={scope.fund.id}
          computed={computedFor}
          existing={existing.map((o) => ({
            field: o.field,
            value: o.value.toFixed(2),
            reason: o.reason,
          }))}
        />
      </SectionCard>

      {existing.length > 0 && (
        <SectionCard title="Corrections in force" subtitle="For this fund and period">
          <ul className="flex flex-col divide-y divide-line-soft">
            {existing.map((o) => (
              <li key={o.id} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[12.5px] font-medium text-ink">{LABELS[o.field]}</span>
                  <span className="text-[13px] font-semibold tabular-nums text-ink">
                    {compactMoney(o.value)}
                  </span>
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">{o.reason}</p>
                <p className="mt-1 text-[11px] text-muted-2">
                  Entered {formatDateTime(o.createdAt)}
                </p>
              </li>
            ))}
          </ul>
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
