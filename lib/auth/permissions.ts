import { Role, type ExternalAccessLevel } from "@/lib/enums";

// Pure module (client-safe): no server-only imports. UI may use these to show/hide controls,
// but the authoritative check always happens server-side (DAL + Server Actions).

export type Permission =
  | "manage_districts" // create/edit districts (platform only)
  | "manage_users_all" // manage users across all districts
  | "manage_users_own" // manage users within own district
  | "configure_district" // edit district settings
  | "manage_master_data" // create/edit schools, grants, projects, reference lists
  | "view_master_data"
  | "view_audit"
  // ---- capabilities that ship in later milestones (permission reserved now) ----
  | "upload_data" // M2
  | "manage_versions" // M2
  | "view_dashboards" // M2
  | "export_data"; // M2

/**
 * What each access level a district can grant an external user actually unlocks.
 * FULL_ACCESS mirrors FINANCE_USER; VIEW_ONLY mirrors VIEWER. Neither level ever confers
 * manage_users_own, configure_district, view_audit or manage_districts — running the
 * district is never an outsider's job, at any level.
 */
export const ACCESS_LEVEL_PERMISSIONS: Record<ExternalAccessLevel, Permission[]> = {
  VIEW_ONLY: ["view_master_data", "view_dashboards", "export_data"],
  FULL_ACCESS: [
    "manage_master_data",
    "view_master_data",
    "upload_data",
    "manage_versions",
    "view_dashboards",
    "export_data",
  ],
};

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  PLATFORM_ADMIN: [
    "manage_districts",
    "manage_users_all",
    "manage_users_own",
    "configure_district",
    "manage_master_data",
    "view_master_data",
    "view_audit",
    "upload_data",
    "manage_versions",
    "view_dashboards",
    "export_data",
  ],
  DISTRICT_ADMIN: [
    "manage_users_own",
    "configure_district",
    "manage_master_data",
    "view_master_data",
    "view_audit",
    "upload_data",
    "manage_versions",
    "view_dashboards",
    "export_data",
  ],
  FINANCE_USER: [
    "manage_master_data",
    "view_master_data",
    "upload_data",
    "manage_versions",
    "view_dashboards",
    "export_data",
  ],
  VIEWER: ["view_master_data", "view_dashboards", "export_data"],
  // An external user holds NO permissions from their role alone — everything they can do
  // comes from the district's grant. Defaulting to the VIEW_ONLY set means a caller that
  // forgets to pass the level under-privileges them rather than over-privileging them.
  EXTERNAL_USER: ACCESS_LEVEL_PERMISSIONS.VIEW_ONLY,
};

/**
 * `level` is consulted ONLY for EXTERNAL_USER. That gate is load-bearing: if the level were
 * honoured for any role, a caller threading an attacker-influenced level onto a VIEWER
 * would escalate them. For every other role the answer comes from the static matrix alone.
 */
export function hasPermission(
  role: Role,
  permission: Permission,
  level?: ExternalAccessLevel | null,
): boolean {
  if (role === Role.EXTERNAL_USER) {
    const granted = level
      ? ACCESS_LEVEL_PERMISSIONS[level]
      : ROLE_PERMISSIONS.EXTERNAL_USER;
    return granted.includes(permission);
  }
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export const ROLE_LABELS: Record<Role, string> = {
  PLATFORM_ADMIN: "Platform Admin",
  DISTRICT_ADMIN: "District Admin",
  FINANCE_USER: "Finance User",
  VIEWER: "Viewer",
  EXTERNAL_USER: "External User",
};
