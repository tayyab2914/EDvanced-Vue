import { redirect } from "next/navigation";
import { getTenantDb, userCan } from "@/lib/auth/dal";
import { resolveScope } from "@/lib/dashboard/scope";
import { labelMode } from "@/lib/dashboard/label-mode";
import { loadCore } from "@/lib/dashboard/load";
import { PageHeader } from "@/components/page-header";
import { SectionCard, DataAsOf, FooterInfoBar } from "@/components/dashboard/section-card";
import { AlertList, AlertSummary } from "@/components/dashboard/alert-list";
import { EmptyState, SubstitutionNotice, Row } from "@/components/dashboard/shared";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { alertFunds, scopeDescription, scopeOptions } from "@/lib/dashboard/options";
import { GO_TO } from "@/lib/dashboard/cta";
import type { AlertGroup } from "@/lib/alerts/catalog";

/**
 * Every alert for the scoped period, in one place (Spec §5.17).
 *
 * ONE PERIOD, and the footer says so. Alerts are evaluated for the period on screen, not
 * across the year — so a threshold a district crossed in February and has since recovered
 * from shows nothing today. That is the correct behaviour for a status page, but it is not
 * obvious, and a trend chart that visibly dips below a red line with no alert beside it
 * looks broken unless the page explains itself.
 */
const GROUPS: { key: AlertGroup; title: string; href: string; cta: string }[] = [
  { key: "revenue", title: "Revenue", href: "/revenues", cta: GO_TO.revenues },
  { key: "expenditure", title: "Expenditure", href: "/expenditures", cta: GO_TO.expenditures },
  { key: "cash", title: "Cash", href: "/cash", cta: GO_TO.cash },
  { key: "fundBalance", title: "Fund balance", href: "/fund-balance", cta: GO_TO.fundBalance },
];

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string; period?: string; fund?: string }>;
}) {
  const { db, user, districtId } = await getTenantDb();
  if (!userCan(user, "view_dashboards")) redirect("/master-data");

  const sp = await searchParams;
  const scope = await resolveScope(db, districtId, sp, await labelMode());

  if (scope.empty) {
    return (
      <div className="animate-fade-up space-y-[18px]">
        <PageHeader title="Alerts" description="Everything needing attention this period." />
        <EmptyState title="No data to monitor yet" action="Upload data" href="/data/upload">
          Alerts are raised from committed data against the thresholds you have set. Upload a
          reporting period to begin.
        </EmptyState>
      </div>
    );
  }

  const core = await loadCore(db, districtId, scope);
  const alerts = core.alerts;
  const options = scopeOptions(scope);

  return (
    <div className="animate-fade-up space-y-[18px]">
      <PageHeader
        title="Alerts"
        description="Everything needing attention this period, judged against your own thresholds."
        actions={
          <DashboardFilters
            scope={scope}
          />
        }
      />
      {scope.substituted && <SubstitutionNotice asked={scope.substituted.asked} showing={scope.substituted.showing} />}
      <DataAsOf date={scope.dataAsOf} note={scopeDescription(scope)} />

      <Row cols="1-2">
        <SectionCard title="Summary" footer={GO_TO.policies} footerHref="/policies">
          <AlertSummary
            alerts={(alerts?.alerts ?? []).map((a) => ({
              id: a.id,
              severity: a.severity,
              title: a.title,
              message: a.message,
              funds: alertFunds(scope, "/alerts", a.funds),
            }))}
            critical={alerts?.criticalCount ?? 0}
            warning={alerts?.warningCount ?? 0}
            informational={alerts?.informationalCount ?? 0}
            href="#all"
          />
        </SectionCard>

        <SectionCard title="For awareness" subtitle="Facts worth noticing, with no threshold behind them">
          <AlertList
            mode={scope.labelMode}
            alerts={(alerts?.observations ?? []).map((o) => ({
              id: o.id,
              severity: "INFORMATIONAL" as const,
              title: o.title,
              message: o.message,
            }))}
            empty="Nothing else of note this period."
          />
        </SectionCard>
      </Row>

      <div id="all" className="grid gap-4 lg:grid-cols-2">
        {GROUPS.map((g) => {
          const group = (alerts?.alerts ?? []).filter((a) => a.group === g.key);
          return (
            <SectionCard
              key={g.key}
              title={`${g.title} (${group.length})`}
              footer={g.cta}
              footerHref={options.link(g.href)}
            >
              <AlertList
                mode={scope.labelMode}
                alerts={group.map((a) => ({
                  id: a.id,
                  severity: a.severity,
                  title: a.title,
                  message: a.message,
                  // The drill-down stays on this page rather than jumping to the group's
                  // dashboard: the reader came here to triage, and narrowing to a fund
                  // re-triages everything, not just the row they clicked.
                  funds: alertFunds(scope, "/alerts", a.funds),
                }))}
                empty={`No ${g.title.toLowerCase()} thresholds have been crossed.`}
              />
            </SectionCard>
          );
        })}
      </div>

      <FooterInfoBar action={GO_TO.policies} href="/policies">
        Alerts are evaluated for {scope.label} only. A threshold crossed in an earlier month
        appears on that month, not here — use the period selector to look back.
      </FooterInfoBar>
    </div>
  );
}
