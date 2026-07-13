import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/dal";
import { AppShell } from "@/components/app-shell";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { homePathForRole } from "@/lib/auth/routes";
import { Role } from "@/lib/enums";
import type { NavGroup } from "@/components/sidebar-nav";

/**
 * The external user's shell, OUTSIDE any district. It exists because an external user with
 * no live grant has no district to render — they still need somewhere to see why (pending,
 * denied, expired) and to pick one to enter.
 */
export default async function ExternalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireAuth();
  if (user.role !== Role.EXTERNAL_USER) redirect(homePathForRole(user.role));

  const nav: NavGroup[] = [
    {
      label: "Overview",
      items: [
        { label: "My districts", href: "/districts", icon: "building", exact: true },
      ],
    },
  ];

  return (
    <AppShell
      workspaceName="My districts"
      workspaceSub="External access"
      nav={nav}
      user={{ name: user.name, roleLabel: ROLE_LABELS[user.role] }}
    >
      {children}
    </AppShell>
  );
}
