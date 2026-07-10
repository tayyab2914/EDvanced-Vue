import * as z from "zod";

export type MasterKind =
  | "schools"
  | "grants"
  | "capital-projects"
  | "fund-types"
  | "funds"
  | "revenue-sources"
  | "functions"
  | "objects"
  | "statuses";

export interface FieldDef {
  name: string;
  label: string;
  type: "text" | "textarea" | "select";
  required?: boolean;
  placeholder?: string;
  optionsKey?: string; // key into the options map (for selects)
  relModel?: string; // tenant model the select references (for ownership checks)
}

export interface ResourceDef {
  kind: MasterKind;
  model: string; // Prisma delegate name on tenantDb
  title: string;
  singular: string;
  isReference: boolean;
  fields: FieldDef[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: z.ZodType<any>;
}

const codeField = z.string().trim().min(1, { error: "Code is required." }).max(40);
const nameField = z.string().trim().min(1, { error: "Name is required." }).max(160);
const optionalText = z
  .string()
  .trim()
  .max(300)
  .optional()
  .transform((v) => (v ? v : undefined));

const refSchema = z.object({ code: codeField, name: nameField });

function refDef(
  kind: MasterKind,
  model: string,
  title: string,
  singular: string,
): ResourceDef {
  return {
    kind,
    model,
    title,
    singular,
    isReference: true,
    fields: [
      { name: "code", label: "Code", type: "text", required: true },
      { name: "name", label: "Name", type: "text", required: true },
    ],
    schema: refSchema,
  };
}

export const RESOURCES: Record<MasterKind, ResourceDef> = {
  schools: {
    kind: "schools",
    model: "school",
    title: "Schools",
    singular: "School",
    isReference: false,
    fields: [
      { name: "schoolNumber", label: "School number", type: "text", required: true },
      { name: "name", label: "Name", type: "text", required: true },
    ],
    schema: z.object({ schoolNumber: codeField, name: nameField }),
  },
  grants: {
    kind: "grants",
    model: "grant",
    title: "Grants",
    singular: "Grant",
    isReference: false,
    fields: [
      { name: "grantId", label: "Grant ID", type: "text", required: true },
      { name: "name", label: "Name", type: "text", required: true },
      { name: "fiscalYear", label: "Fiscal year", type: "text", placeholder: "e.g. 2026-27" },
      { name: "fundId", label: "Fund", type: "select", optionsKey: "funds", relModel: "fund" },
      { name: "description", label: "Description", type: "textarea" },
    ],
    schema: z.object({
      grantId: codeField,
      name: nameField,
      fiscalYear: optionalText,
      fundId: optionalText,
      description: optionalText,
    }),
  },
  "capital-projects": {
    kind: "capital-projects",
    model: "capitalProject",
    title: "Capital projects",
    singular: "Capital project",
    isReference: false,
    fields: [
      { name: "projectId", label: "Project ID", type: "text", required: true },
      { name: "name", label: "Name", type: "text", required: true },
      { name: "description", label: "Description", type: "textarea" },
    ],
    schema: z.object({
      projectId: codeField,
      name: nameField,
      description: optionalText,
    }),
  },
  "fund-types": refDef("fund-types", "fundType", "Fund types", "Fund type"),
  funds: {
    kind: "funds",
    model: "fund",
    title: "Funds",
    singular: "Fund",
    isReference: true,
    fields: [
      { name: "code", label: "Code", type: "text", required: true },
      { name: "name", label: "Name", type: "text", required: true },
      {
        name: "fundTypeId",
        label: "Fund type",
        type: "select",
        optionsKey: "fundTypes",
        relModel: "fundType",
      },
    ],
    schema: z.object({
      code: codeField,
      name: nameField,
      fundTypeId: optionalText,
    }),
  },
  "revenue-sources": refDef(
    "revenue-sources",
    "revenueSource",
    "Revenue sources",
    "Revenue source",
  ),
  functions: refDef("functions", "accountFunction", "Functions", "Function"),
  objects: refDef("objects", "accountObject", "Objects", "Object"),
  statuses: refDef("statuses", "status", "Statuses", "Status"),
};

export const MASTER_KINDS = Object.keys(RESOURCES) as MasterKind[];

export const MASTER_NAV = MASTER_KINDS.map((k) => ({
  label: RESOURCES[k].title,
  href: `/master-data/${k}`,
}));
