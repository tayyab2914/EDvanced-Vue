import * as z from "zod";
import { type EnumOption } from "@/lib/master-data/enums";
import {
  COST_CENTER_CATEGORIES,
  COST_CENTER_CATEGORY_VALUES,
} from "@/lib/master-data/cost-center";

// District-owned account dimensions. Order here drives the nav order.
//
// Grants and Capital Projects are deferred to V2 — a district maintains its projects in
// the single `projects` master below, and the paid modules reference those projects when
// they ship. See the dormant Grant / CapitalProject models in prisma/schema.prisma.
export type MasterKind =
  | "funds"
  | "revenues"
  | "functions"
  | "objects"
  | "cost-centers"
  | "projects";

// Platform-managed global lookup delegates a dimension can categorize against.
export type GlobalTypeModel =
  | "fundType"
  | "revenueType"
  | "objectType"
  | "functionType"
  | "costCenterType";

export interface FieldDef {
  name: string;
  label: string;
  type: "text" | "textarea" | "select" | "radio";
  required?: boolean;
  placeholder?: string;
  numeric?: boolean; // currency/number field (stored Decimal; shown formatted)
  optionsKey?: string; // key into the options map (for selects)
  relModel?: string; // tenant model the select references (ownership check)
  globalType?: GlobalTypeModel; // platform lookup the select references (existence check)
  staticOptions?: EnumOption[]; // fixed dropdown/radio values (no DB load)
  dependsOn?: string; // this select's options depend on another field's value
  optionsByParent?: Record<string, EnumOption[]>; // static options keyed by the parent value
  // For a dependent select backed by a `globalType`: the column on the lookup model that
  // holds the parent value, and the key into the server-loaded parent→options map.
  parentColumn?: string;
  optionsByParentKey?: string;
}

export interface ResourceDef {
  kind: MasterKind;
  model: string; // Prisma delegate name
  title: string;
  singular: string;
  fields: FieldDef[];
  columns: string[]; // field names shown as table columns (rest are form/view only)
  defaultSort: string; // field the table sorts by, ascending (stated, not inferred)
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
    defaultSort: "code",
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
      {
        name: "category",
        label: "Category",
        type: "radio",
        required: true,
        staticOptions: COST_CENTER_CATEGORIES,
      },
      {
        // Platform-managed (CostCenterType), but each type belongs to a category, so the
        // options stay filtered by the Category the user picked.
        name: "typeId",
        label: "Cost Center Type",
        type: "select",
        required: true,
        dependsOn: "category",
        parentColumn: "category",
        optionsKey: "costCenterTypes", // flat list — column labels + filter dropdown
        optionsByParentKey: "costCenterTypesByCategory",
        globalType: "costCenterType",
      },
    ],
    columns: ["schoolNumber", "name", "category", "typeId"],
    defaultSort: "schoolNumber",
    schema: z.object({
      schoolNumber: codeField,
      name: nameField,
      category: z.enum(COST_CENTER_CATEGORY_VALUES as [string, ...string[]], {
        error: "Choose a category.",
      }),
      typeId: requiredSelect("Cost Center Type"),
    }),
  },
  // The unified Projects master (MVP). Just the shared essentials — Project Number and
  // Project Name — that both the Grants and Capital Projects modules build on in V2. A
  // Project Number is unique per district; districts use their own numbering convention.
  projects: {
    kind: "projects",
    model: "project",
    title: "Projects",
    singular: "Project",
    fields: [
      { name: "projectNumber", label: "Project Number", type: "text", required: true },
      { name: "name", label: "Project Name", type: "text", required: true },
    ],
    columns: ["projectNumber", "name"],
    defaultSort: "projectNumber",
    schema: z.object({
      projectNumber: codeField,
      name: nameField,
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
