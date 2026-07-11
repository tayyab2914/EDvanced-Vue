import * as z from "zod";

export const configItemSchema = z.object({
  name: z.string().trim().min(1, { error: "Name is required." }).max(160),
});
