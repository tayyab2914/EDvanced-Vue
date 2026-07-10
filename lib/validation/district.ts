import * as z from "zod";

export const districtSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: "District name is required." })
    .max(120),
  code: z
    .string()
    .trim()
    .min(2, { error: "A short code is required." })
    .max(20)
    .regex(/^[A-Za-z0-9_-]+$/, {
      error: "Use letters, numbers, hyphens, or underscores only.",
    }),
  fiscalYearStartMonth: z.coerce.number().int().min(1).max(12).default(7),
});

export const districtSettingsSchema = z.object({
  name: z.string().trim().min(2, { error: "District name is required." }).max(120),
  fiscalYearStartMonth: z.coerce.number().int().min(1).max(12),
});
