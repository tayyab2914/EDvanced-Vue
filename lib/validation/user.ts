import * as z from "zod";

// District-scoped roles that admins can assign (never PLATFORM_ADMIN via the UI).
export const ASSIGNABLE_ROLES = [
  "DISTRICT_ADMIN",
  "FINANCE_USER",
  "VIEWER",
] as const;

const firstName = z
  .string()
  .trim()
  .min(1, { error: "First name is required." })
  .max(60);
const lastName = z
  .string()
  .trim()
  .min(1, { error: "Last name is required." })
  .max(60);
const role = z.enum(ASSIGNABLE_ROLES, { error: "Choose a role." });

export const createUserSchema = z.object({
  firstName,
  lastName,
  email: z.email({ error: "Enter a valid email address." }).trim(),
  role,
});

export const editUserSchema = z.object({ firstName, lastName, role });

export function fullName(first: string, last: string): string {
  return `${first} ${last}`.trim();
}
