import { Role } from "@/lib/enums";

/** Where a user lands after login, based on role (client-safe, pure). */
export function homePathForRole(role: Role): string {
  return role === Role.PLATFORM_ADMIN ? "/platform" : "/dashboard";
}
