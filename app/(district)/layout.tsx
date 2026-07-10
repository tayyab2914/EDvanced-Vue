import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/dal";
import { AppShell } from "@/components/app-shell";
import { hasPermission, ROLE_LABELS } from "@/lib/auth/permissions";
import { Role } from "@/lib/enums";
import type { NavGroup, NavItem } from "@/components/sidebar-nav";

export default async function DistrictLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireAuth();
  // Platform admins have no home district; send them to the platform console.
  if (user.role === Role.PLATFORM_ADMIN || !user.districtId) {
    redirect("/platform");
  }

  const overview: NavItem[] = [
    { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
    { label: "Master data", href: "/master-data", icon: "database" },
  ];
  const admin: NavItem[] = [];
  if (hasPermission(user.role, "manage_users_own"))
    admin.push({ label: "Users", href: "/users", icon: "users" });
  if (hasPermission(user.role, "configure_district"))
    admin.push({ label: "Settings", href: "/settings", icon: "settings" });
  if (hasPermission(user.role, "view_audit"))
    admin.push({ label: "Audit", href: "/audit", icon: "activity" });

  const nav: NavGroup[] = [{ label: "Overview", items: overview }];
  if (admin.length) nav.push({ label: "Administration", items: admin });

  return (
    <AppShell
      brand="K–12 Finance"
      workspaceName={user.districtName ?? "District"}
      workspaceSub="Finance workspace"
      contextTag="2024–25"
      nav={nav}
      user={{ name: user.name, roleLabel: ROLE_LABELS[user.role] }}
    >
      {children}
    </AppShell>
  );
}
