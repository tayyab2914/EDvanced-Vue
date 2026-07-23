import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireAuth, userCan } from "@/lib/auth/dal";
import { tenantDb } from "@/lib/tenant-db";
import { AppShell } from "@/components/app-shell";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { ACCESS_LEVEL_LABELS } from "@/lib/external-access";
import {
  listLiveGrants,
  pendingRequestCount,
} from "@/lib/external-access-db";
import { DistrictSwitcher } from "@/components/external/district-switcher";
import { EXTERNAL_HOME } from "@/lib/auth/routes";
import { Role } from "@/lib/enums";
import type { NavGroup, NavItem } from "@/components/sidebar-nav";

export default async function DistrictLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireAuth();
  // Platform admins have no home district; send them to the platform console.
  if (user.role === Role.PLATFORM_ADMIN) redirect("/platform");
  // An external user with no LIVE grant selected (never entered one, or it lapsed / was
  // revoked mid-session) has no district to render — send them to pick one.
  if (!user.districtId) {
    redirect(user.role === Role.EXTERNAL_USER ? EXTERNAL_HOME : "/platform");
  }

  const isExternal = user.role === Role.EXTERNAL_USER;

  // MAIN — the district's financial views. All five dashboards ship in Milestone 3.
  //
  // Capital Projects and Grants appear in the client's reference navigation but are V2
  // subscribable modules in both the Feature Specification (§5.14) and the Milestone Plan.
  // Project spend is already collected, tagged, on every detail row, so those screens can
  // be built later from data the platform holds today — they are deliberately not here.
  const main: NavItem[] = [
    { label: "Executive Dashboard", href: "/dashboard", icon: "dashboard", exact: true },
    { label: "Revenues", href: "/revenues", icon: "chart" },
    { label: "Expenditures", href: "/expenditures", icon: "database" },
    { label: "Fund Balance", href: "/fund-balance", icon: "shield" },
    { label: "Cash Position", href: "/cash", icon: "activity" },
    { label: "Alerts", href: "/alerts", icon: "mail" },
  ];

  // DATA MANAGEMENT — uploading, the version history, and the chart of accounts. Reading the
  // data is a view permission; uploading is not. So "Upload Data" appears only for someone who
  // can actually upload, while "Version Management" (the history) is visible to any viewer.
  // These are two distinct destinations: the menu label now matches the page it opens, rather
  // than "Data Uploads" quietly opening the version history.
  const dataManagement: NavItem[] = [
    { label: "Chart of Accounts", href: "/master-data", icon: "database" },
  ];
  if (userCan(user, "view_dashboards")) {
    dataManagement.unshift({ label: "Version Management", href: "/data/versions", icon: "reports" });
    // The periodic browse was reachable only from the version history and from each
    // dataset page — Spec §5.19 flags the missing top-level entry as a known gap and
    // suggests folding it into this milestone. This is that.
    dataManagement.unshift({ label: "Browse Data", href: "/data/revenue-detail", icon: "search" });
  }
  if (userCan(user, "upload_data")) {
    dataManagement.unshift({ label: "Upload Data", href: "/data/upload", icon: "upload" });
  }

  const admin: NavItem[] = [];
  if (userCan(user, "configure_district"))
    admin.push({ label: "District Settings", href: "/settings", icon: "settings" });
  // Readable by anyone who can see the dashboards — a Viewer should be able to see the
  // rules they are being measured against, even though only an admin can change them.
  if (userCan(user, "view_dashboards"))
    admin.push({ label: "Financial Policies", href: "/policies", icon: "shield" });
  if (userCan(user, "manage_users_own"))
    admin.push({ label: "Users", href: "/users", icon: "users" });
  if (userCan(user, "view_audit"))
    admin.push({ label: "Audit Log", href: "/audit", icon: "activity" });

  const nav: NavGroup[] = [
    { label: "Main", items: main },
    { label: "Data Management", items: dataManagement },
  ];
  if (admin.length) nav.push({ label: "Administration", items: admin });

  // External users get a switcher over their other live districts; district staff belong to
  // exactly one district and get the plain workspace card.
  const grants = isExternal ? await listLiveGrants(user.id) : [];

  // The header's fiscal-year chip. Resolved from committed data rather than hardcoded —
  // it used to read "2024–25" for every district forever, which would now visibly
  // contradict the year every dashboard resolves for itself.
  const latest = await tenantDb(user.districtId).datasetVersion.findFirst({
    where: { isCurrent: true },
    orderBy: [{ fiscalYear: "desc" }],
    select: { fiscalYear: true },
  });

  // Only someone who can act on requests should be told about them.
  const pending = userCan(user, "manage_users_own")
    ? await pendingRequestCount(user.districtId)
    : 0;

  return (
    <AppShell
      workspaceName={user.districtName ?? "District"}
      workspaceSub={
        isExternal && user.accessLevel
          ? `External · ${ACCESS_LEVEL_LABELS[user.accessLevel]}`
          : "Finance workspace"
      }
      contextTag={latest?.fiscalYear}
      hideHeader
      nav={nav}
      user={{ name: user.name, roleLabel: ROLE_LABELS[user.role] }}
      switcher={
        isExternal ? (
          <DistrictSwitcher
            activeDistrictId={user.districtId}
            activeDistrictName={user.districtName ?? "District"}
            grants={grants.map((g) => ({
              districtId: g.districtId,
              districtName: g.district.name,
              level: g.level,
            }))}
          />
        ) : undefined
      }
      alerts={
        pending > 0
          ? {
              href: "/users?tab=external",
              count: pending,
              label: "pending access request",
            }
          : undefined
      }
    >
      {children}
    </AppShell>
  );
}
