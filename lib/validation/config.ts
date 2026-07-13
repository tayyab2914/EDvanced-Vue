import * as z from "zod";
import type { ConfigDef } from "@/lib/config/registry";

export const configItemSchema = z.object({
  code: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v ? v : undefined)),
  name: z.string().trim().min(1, { error: "Name is required." }).max(160),
});

export interface ConfigItemInput {
  code?: string;
  name: string;
  category?: string;
}

/** Lists with a `categoryField` (Cost Center Types) also require a valid category. */
export function configSchemaFor(def: ConfigDef): z.ZodType<ConfigItemInput> {
  if (!def.categoryField) return configItemSchema;
  const values = def.categoryField.options.map((o) => o.value) as [
    string,
    ...string[],
  ];
  return configItemSchema.extend({
    category: z.enum(values, {
      error: `Choose a ${def.categoryField.label.toLowerCase()}.`,
    }),
  });
}
