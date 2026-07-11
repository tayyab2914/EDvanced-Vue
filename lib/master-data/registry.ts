import * as z from "zod";
import {
  GRANT_STATUS,
  PROJECT_STATUS,
  PROJECT_TYPE,
  values,
  type EnumOption,
} from "@/lib/master-data/enums";

// District-owned account dimensions. Order here drives the nav order.
export type MasterKind =
  | "funds"
  | "revenues"
  | "functions"
  | "objects"
  | "cost-centers"
  | "grants"
  | "capital-projects";

// Platform-managed global lookup delegates a dimension can categorize against.
export type GlobalTypeModel =
  | "fundType"
  | "revenueType"
  | "objectType"
  | "functionType";

export interface FieldDef {
  name: string;
  label: string;
  type: "text" | "textarea" | "select";
  required?: boolean;
  placeholder?: string;
  numeric?: boolean; // currency/number field (stored Decimal; shown formatted)
  optionsKey?: string; // key into the options map (for selects)
  relModel?: string; // tenant model the select references (ownership check)
  globalType?: GlobalTypeModel; // platform lookup the select references (existence check)
  staticOptions?: EnumOption[]; // fixed dropdown values (no DB load)
}

export interface ResourceDef {
  kind: MasterKind;
  model: string; // Prisma delegate name
  title: string;
  singular: string;
  fields: FieldDef[];
  columns: string[]; // field names shown as table columns (rest are form/view only)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: z.ZodType<any>;
}

// Serializable subset safe to hand to Client Components (no Zod schema / model).
export type ClientResourceDef = Pick<
  ResourceDef,
  "kind" | "title" | "singular" | "fields" | "columns"
>;

export function toClientDef(def: ResourceDef): ClientResourceDef {
  return {
    kind: def.kind,
    title: def.title,
    singular: def.singular,
    fields: def.fields,
    columns: def.columns,
  };
}

const codeField = z.string().trim().min(1, { error: "Code is required." }).max(40);
const nameField = z.string().trim().min(1, { error: "Name is required." }).max(160);
const optionalText = z
  .string()
  .trim()
  .max(300)
  .optional()
  .transform((v) => (v ? v : undefined));

const optionalAmount = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => v === undefined || (!isNaN(Number(v)) && Number(v) >= 0), {
    error: "Enter a valid amount.",
  });

const requiredSelect = (label: string) =>
  z.string().trim().min(1, { error: `Select a ${label.toLowerCase()}.` });

// A code/name dimension that categorizes against a platform-managed global type.
function typedDimension(
  kind: MasterKind,
  model: string,
  title: string,
  singular: string,
  typeField: { name: string; label: string; optionsKey: string; globalType: GlobalTypeModel },
): ResourceDef {
  return {
    kind,
    model,
    title,
    singular,
    fields: [
      { name: "code", label: "Code", type: "text", required: true },
      { name: "name", label: "Name", type: "text", required: true },
      {
        name: typeField.name,
        label: typeField.label,
        type: "select",
        required: true,
        placeholder: `Select a ${typeField.label.toLowerCase()}…`,
        optionsKey: typeField.optionsKey,
        globalType: typeField.globalType,
      },
    ],
    columns: ["code", "name", typeField.name],
    schema: z.object({
      code: codeField,
      name: nameField,
      [typeField.name]: requiredSelect(typeField.label),
    }),
  };
}

export const RESOURCES: Record<MasterKind, ResourceDef> = {
  funds: typedDimension("funds", "fund", "Funds", "Fund", {
    name: "fundTypeId",
    label: "Fund type",
    optionsKey: "fundTypes",
    globalType: "fundType",
  }),
  revenues: typedDimension("revenues", "revenueSource", "Revenues", "Revenue", {
    name: "revenueTypeId",
    label: "Revenue type",
    optionsKey: "revenueTypes",
    globalType: "revenueType",
  }),
  functions: typedDimension(
    "functions",
    "accountFunction",
    "Functions",
    "Function",
    {
      name: "functionTypeId",
      label: "Function type",
      optionsKey: "functionTypes",
      globalType: "functionType",
    },
  ),
  objects: typedDimension("objects", "accountObject", "Objects", "Object", {
    name: "objectTypeId",
    label: "Object type",
    optionsKey: "objectTypes",
    globalType: "objectType",
  }),
  "cost-centers": {
    kind: "cost-centers",
    model: "school",
    title: "Cost Centers",
    singular: "Cost Center",
    fields: [
      {
        name: "schoolNumber",
        label: "Cost center number",
        type: "text",
        required: true,
      },
      { name: "name", label: "Name", type: "text", required: true },
    ],
    columns: ["schoolNumber", "name"],
    schema: z.object({ schoolNumber: codeField, name: nameField }),
  },
  grants: {
    kind: "grants",
    model: "grant",
    title: "Grants",
    singular: "Grant",
    fields: [
      { name: "grantId", label: "Grant Number", type: "text", required: true },
      { name: "name", label: "Grant Name", type: "text", required: true },
      {
        name: "revenueTypeId",
        label: "Revenue Type",
        type: "select",
        required: true,
        placeholder: "Select a revenue type…",
        optionsKey: "revenueTypes",
        globalType: "revenueType",
      },
      {
        name: "awardAmount",
        label: "Award Amount",
        type: "text",
        numeric: true,
        placeholder: "e.g. 1200000",
      },
      {
        name: "status",
        label: "Grant Status",
        type: "select",
        required: true,
        staticOptions: GRANT_STATUS,
      },
      { name: "grantPeriod", label: "Grant Period", type: "text", placeholder: "e.g. 2026-27" },
      { name: "grantManager", label: "Grant Manager", type: "text" },
      { name: "description", label: "Description", type: "textarea" },
      { name: "cfdaNumber", label: "CFDA Number", type: "text" },
    ],
    columns: ["grantId", "name", "status", "awardAmount"],
    schema: z.object({
      grantId: codeField,
      name: nameField,
      revenueTypeId: requiredSelect("Revenue Type"),
      awardAmount: optionalAmount,
      status: z.enum(values(GRANT_STATUS)),
      grantPeriod: optionalText,
      grantManager: optionalText,
      description: optionalText,
      cfdaNumber: optionalText,
    }),
  },
  "capital-projects": {
    kind: "capital-projects",
    model: "capitalProject",
    title: "Capital Projects",
    singular: "Capital Project",
    fields: [
      { name: "projectId", label: "Project Number", type: "text", required: true },
      { name: "name", label: "Project Name", type: "text", required: true },
      { name: "description", label: "Description", type: "textarea" },
      {
        name: "status",
        label: "Status",
        type: "select",
        required: true,
        staticOptions: PROJECT_STATUS,
      },
      {
        name: "projectType",
        label: "Project Type",
        type: "select",
        required: true,
        placeholder: "Select a project type…",
        staticOptions: PROJECT_TYPE,
      },
    ],
    columns: ["projectId", "name", "status", "projectType"],
    schema: z.object({
      projectId: codeField,
      name: nameField,
      description: optionalText,
      status: z.enum(values(PROJECT_STATUS)),
      projectType: requiredSelect("Project Type"),
    }),
  },
};

export const MASTER_KINDS = Object.keys(RESOURCES) as MasterKind[];

export interface ImportResult {
  ok: boolean;
  error?: string; // fatal (bad file / missing columns)
  imported?: number;
  failed?: number;
  errors?: { row: number; message: string }[];
}

export const EMPTY_IMPORT_RESULT: ImportResult = { ok: false };
