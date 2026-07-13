import { Role } from "@/lib/enums";

/** Where an external user picks which district to work in (and sees pending requests). */
export const EXTERNAL_HOME = "/districts";

/** Where a user lands after login, based on role (client-safe, pure). */
export function homePathForRole(role: Role): string {
  if (role === Role.PLATFORM_ADMIN) return "/platform";
  if (role === Role.EXTERNAL_USER) return EXTERNAL_HOME;
  return "/dashboard";
}

/**
 * Where to send a user who can't be where they are. Prefer this over `homePathForRole` when
 * you hold the user: an external user with no district selected has no dashboard to go to,
 * and bouncing them to a district route would loop.
 */
export function homePathForUser(user: {
  role: Role;
  districtId: string | null;
}): string {
  if (user.role === Role.EXTERNAL_USER && !user.districtId) return EXTERNAL_HOME;
  return homePathForRole(user.role);
}
