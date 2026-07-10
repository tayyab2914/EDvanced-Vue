import "server-only";
import * as z from "zod";

/**
 * Validates required environment variables at server startup.
 * Throws a readable error if anything is missing/malformed.
 */
const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, { error: "DATABASE_URL is required" }),
  SESSION_SECRET: z
    .string()
    .min(32, { error: "SESSION_SECRET must be at least 32 characters" }),
  APP_URL: z.url({ error: "APP_URL must be a valid URL" }),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Only needed by the seed script; optional for the running app.
  PLATFORM_ADMIN_EMAIL: z.email().optional(),
  PLATFORM_ADMIN_PASSWORD: z.string().optional(),
  // SMTP email (optional — falls back to console logging when SMTP_HOST is unset).
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
});

export const env = EnvSchema.parse(process.env);
export const isProduction = env.NODE_ENV === "production";
