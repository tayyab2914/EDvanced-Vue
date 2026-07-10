import type { Role } from "@/lib/enums";

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
  // Default M1: Finance User is read-only on master data (confirm with client).
  FINANCE_USER: [
    "view_master_data",
    "upload_data",
    "manage_versions",
    "view_dashboards",
    "export_data",
  ],
  VIEWER: ["view_master_data", "view_dashboards", "export_data"],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export const ROLE_LABELS: Record<Role, string> = {
  PLATFORM_ADMIN: "Platform Admin",
  DISTRICT_ADMIN: "District Admin",
  FINANCE_USER: "Finance User",
  VIEWER: "Viewer",
};
