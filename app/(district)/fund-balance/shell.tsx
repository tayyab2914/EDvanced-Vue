import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { LinkTabs, FundLevelNotice } from "@/components/dashboard/shared";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
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
  /** Set on the tab that has a one-page print sheet — only Current Position does. */
  summaryHref,
  children,
}: {
  scope: DashboardScope;
  active: string;
  alertCount?: number;
  summaryHref?: string;
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
          <DashboardFilters
            scope={scope}
            exportHref={options.exportHref("/fund-balance/export")}
            summaryHref={summaryHref}
          />
        }
      />

      <LinkTabs
        active={`${active}${q}`}
        // The client's naming: "Tabs Update Names — Current Position, Forecasting &
        // Planning".
        tabs={[
          { href: `/fund-balance${q}`, label: "Current Position", icon: "building" },
          { href: `/fund-balance/forecast${q}`, label: "Forecasting & Planning", icon: "trend-up" },
          { href: `/fund-balance/policies${q}`, label: "Policies", icon: "shield" },
          { href: `/fund-balance/alerts${q}`, label: "Alerts", icon: "warning", count: alertCount },
        ]}
      />

      {scope.substituted && (
        <SubstitutionNotice asked={scope.substituted.asked} showing={scope.substituted.showing} />
      )}
      {scope.fundLevelOnly && <FundLevelNotice subject="Fund balance" />}

      {children}
    </div>
  );
}
