import * as z from "zod";

export const loginSchema = z.object({
  email: z.email({ error: "Enter a valid email address." }).trim(),
  password: z.string().min(1, { error: "Password is required." }),
});

export const forgotPasswordSchema = z.object({
  email: z.email({ error: "Enter a valid email address." }).trim(),
});

export const PASSWORD_HINT =
  "At least 8 characters, including a letter, a number, and a special character.";

export const passwordSchema = z
  .string()
  .min(8, { error: "Be at least 8 characters long." })
  .regex(/[a-zA-Z]/, { error: "Contain at least one letter." })
  .regex(/[0-9]/, { error: "Contain at least one number." })
  .regex(/[^a-zA-Z0-9]/, { error: "Contain at least one special character." });

export const resetPasswordSchema = z.object({
  token: z.string().min(1, { error: "Missing token." }),
  password: passwordSchema,
});
