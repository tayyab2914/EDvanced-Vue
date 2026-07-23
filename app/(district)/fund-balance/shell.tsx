import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { LinkTabs } from "@/components/dashboard/shared";
import { ScopeBar } from "@/components/dashboard/scope-bar";
import { DataAsOf } from "@/components/dashboard/section-card";
import { SubstitutionNotice } from "@/components/dashboard/shared";
import { scopeOptions } from "@/lib/dashboard/options";
import type { DashboardScope } from "@/lib/dashboard/scope";

/**
 * The chrome shared by the four Fund Balance tabs.
 *
 * The tabs are LINKS with the scope carried in the query string, not local state. An alert
 * deep-links to the Alerts tab and the Expenditures dashboard links to Forecast & Planning;
 * both would land on the wrong tab if selection lived in React.
 */
export function FundBalanceShell({
  scope,
  active,
  alertCount,
  children,
}: {
  scope: DashboardScope;
  active: string;
  alertCount?: number;
  children: ReactNode;
}) {
  const options = scopeOptions(scope);
  const q = options.query ? `?${options.query}` : "";

  return (
    <div className="animate-fade-up space-y-[18px]">
      <PageHeader
        title="Fund Balance"
        description="Track fund balance, reserve levels, and plan for the future."
        actions={
          <ScopeBar
            periods={options.periods}
            period={options.period}
            funds={options.funds}
            fund={scope.fundId ?? ""}
            exportHref={options.exportHref("/fund-balance/export")}
          />
        }
      />

      <LinkTabs
        active={`${active}${q}`}
        tabs={[
          { href: `/fund-balance${q}`, label: "Current position", icon: "building" },
          { href: `/fund-balance/forecast${q}`, label: "Forecast & planning", icon: "chart" },
          { href: `/fund-balance/policies${q}`, label: "Policies", icon: "shield" },
          { href: `/fund-balance/alerts${q}`, label: "Alerts", icon: "activity", count: alertCount },
        ]}
      />

      {scope.substituted && (
        <SubstitutionNotice asked={scope.substituted.asked} showing={scope.substituted.showing} />
      )}
      <DataAsOf date={scope.dataAsOf} note={scope.fund ? scope.fund.name : "All funds"} />

      {children}
    </div>
  );
}
