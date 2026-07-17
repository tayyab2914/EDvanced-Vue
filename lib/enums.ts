// Client-safe re-export of Prisma-generated enums (pure constants + types).
// Explicit named re-exports (not `export *`) so static named bindings link
// reliably across bundlers and the tsx/Node ESM loader.
export {
  Role,
  UserStatus,
  DistrictStatus,
  TokenType,
  ExternalAccessStatus,
  ExternalAccessLevel,
  // M2 — the data pipeline
  PeriodType,
  BudgetType,
  BudgetKind,
  DatasetKind,
  ImportStatus,
  ImportAction,
  Severity,
  FundBalanceField,
  ActivityClass,
} from "@/lib/generated/prisma/enums";
