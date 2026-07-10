import * as z from "zod";

// District-scoped roles that admins can assign (never PLATFORM_ADMIN via the UI).
export const ASSIGNABLE_ROLES = [
  "DISTRICT_ADMIN",
  "FINANCE_USER",
  "VIEWER",
] as const;

export const createUserSchema = z.object({
  name: z.string().trim().min(2, { error: "Name is required." }).max(120),
  email: z.email({ error: "Enter a valid email address." }).trim(),
  role: z.enum(ASSIGNABLE_ROLES, { error: "Choose a role." }),
});
