import * as z from "zod";

export const configItemSchema = z.object({
  code: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v ? v : undefined)),
  name: z.string().trim().min(1, { error: "Name is required." }).max(160),
});
