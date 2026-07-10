import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth/dal";
import { AppShell } from "@/components/app-shell";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { Role } from "@/lib/enums";
import type { NavGroup } from "@/components/sidebar-nav";

export default async function PlatformLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireRole(Role.PLATFORM_ADMIN);
  const nav: NavGroup[] = [
    {
      label: "Overview",
      items: [
        { label: "Overview", href: "/platform", icon: "dashboard", exact: true },
        {
          label: "District Management",
          href: "/platform/districts",
          icon: "building",
        },
      ],
    },
    {
      label: "Administration",
      items: [{ label: "Audit log", href: "/platform/audit", icon: "activity" }],
    },
  ];
  return (
    <AppShell
      brand="EDvanced Vue"
      workspaceName="Platform Console"
      workspaceSub="All districts"
      nav={nav}
      user={{ name: user.name, roleLabel: ROLE_LABELS[user.role] }}
    >
      {children}
    </AppShell>
  );
}
