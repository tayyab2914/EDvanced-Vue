-- CreateEnum
CREATE TYPE "PeriodType" AS ENUM ('ANNUAL', 'MONTHLY', 'SURVEY');

-- CreateEnum
CREATE TYPE "BudgetType" AS ENUM ('ADOPTED', 'CURRENT');

-- CreateEnum
CREATE TYPE "BudgetKind" AS ENUM ('REVENUE', 'EXPENDITURE');

-- CreateEnum
CREATE TYPE "DatasetKind" AS ENUM ('REVENUE_BUDGET', 'EXPENDITURE_BUDGET', 'OPENING_FUND_BALANCE', 'REVENUE_DETAIL', 'EXPENDITURE_DETAIL', 'CASH_POSITION');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PARSING', 'VALIDATED', 'AWAITING_CHOICE', 'COMMITTED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportAction" AS ENUM ('INITIAL', 'REPLACED', 'NEW_VERSION');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('ERROR', 'WARNING');

-- CreateEnum
CREATE TYPE "FundBalanceField" AS ENUM ('TOTAL', 'UNASSIGNED', 'NONSPENDABLE', 'RESTRICTED', 'COMMITTED', 'ASSIGNED');

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "dataset" "DatasetKind" NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "periodType" "PeriodType" NOT NULL,
    "period" INTEGER,
    "budgetType" "BudgetType",
    "status" "ImportStatus" NOT NULL DEFAULT 'PARSING',
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "rowsParsed" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "warningsAckedAt" TIMESTAMP(3),
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportStagingRow" (
    "id" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "resolved" JSONB,

    CONSTRAINT "ImportStagingRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationFinding" (
    "id" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "layer" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "rowNumber" INTEGER,
    "column" TEXT,
    "value" TEXT,
    "message" TEXT NOT NULL,

    CONSTRAINT "ValidationFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetVersion" (
    "id" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "dataset" "DatasetKind" NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "periodType" "PeriodType" NOT NULL,
    "period" INTEGER,
    "budgetType" "BudgetType",
    "version" INTEGER NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "action" "ImportAction" NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "errorCount" INTEGER NOT NULL,
    "warningCount" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "committedByUserId" TEXT NOT NULL,
    "committedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DatasetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetLine" (
    "id" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "budgetType" "BudgetType" NOT NULL DEFAULT 'ADOPTED',
    "kind" "BudgetKind" NOT NULL,
    "fundId" TEXT NOT NULL,
    "revenueSourceId" TEXT,
    "functionId" TEXT,
    "objectId" TEXT,
    "costCenterId" TEXT,
    "capitalProjectId" TEXT,
    "grantId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevenueActual" (
    "id" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "period" INTEGER NOT NULL,
    "fundId" TEXT NOT NULL,
    "revenueSourceId" TEXT NOT NULL,
    "grantId" TEXT,
    "capitalProjectId" TEXT,
    "costCenterId" TEXT,
    "budget" DECIMAL(18,2) NOT NULL,
    "actualMtd" DECIMAL(18,2) NOT NULL,
    "actualYtd" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "RevenueActual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenditureActual" (
    "id" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "period" INTEGER NOT NULL,
    "fundId" TEXT NOT NULL,
    "functionId" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "costCenterId" TEXT,
    "grantId" TEXT,
    "capitalProjectId" TEXT,
    "budget" DECIMAL(18,2) NOT NULL,
    "actualMtd" DECIMAL(18,2) NOT NULL,
    "actualYtd" DECIMAL(18,2) NOT NULL,
    "encumbrances" DECIMAL(18,2) NOT NULL,
    "availableBudget" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "ExpenditureActual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashPosition" (
    "id" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "period" INTEGER NOT NULL,
    "fundId" TEXT NOT NULL,
    "beginningCash" DECIMAL(18,2) NOT NULL,
    "receiptsMtd" DECIMAL(18,2) NOT NULL,
    "disbursementsMtd" DECIMAL(18,2) NOT NULL,
    "endingCash" DECIMAL(18,2) NOT NULL,
    "investmentBalance" DECIMAL(18,2),
    "restrictedCash" DECIMAL(18,2),
    "unrestrictedCash" DECIMAL(18,2),

    CONSTRAINT "CashPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpeningFundBalance" (
    "id" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "pyNonspendable" DECIMAL(18,2) NOT NULL,
    "pyRestricted" DECIMAL(18,2) NOT NULL,
    "pyCommitted" DECIMAL(18,2) NOT NULL,
    "pyAssigned" DECIMAL(18,2) NOT NULL,
    "pyUnassigned" DECIMAL(18,2) NOT NULL,
    "pyTotal" DECIMAL(18,2) NOT NULL,
    "begNonspendable" DECIMAL(18,2),
    "begRestricted" DECIMAL(18,2),
    "begCommitted" DECIMAL(18,2),
    "begAssigned" DECIMAL(18,2),
    "begUnassigned" DECIMAL(18,2) NOT NULL,
    "begTotal" DECIMAL(18,2) NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "statusId" TEXT,
    "notes" TEXT,

    CONSTRAINT "OpeningFundBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundBalanceOverride" (
    "id" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "period" INTEGER NOT NULL,
    "fundId" TEXT NOT NULL,
    "field" "FundBalanceField" NOT NULL,
    "value" DECIMAL(18,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "overriddenByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundBalanceOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportBatch_districtId_dataset_fiscalYear_period_idx" ON "ImportBatch"("districtId", "dataset", "fiscalYear", "period");

-- CreateIndex
CREATE INDEX "ImportBatch_districtId_status_idx" ON "ImportBatch"("districtId", "status");

-- CreateIndex
CREATE INDEX "ImportStagingRow_districtId_idx" ON "ImportStagingRow"("districtId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportStagingRow_batchId_rowNumber_key" ON "ImportStagingRow"("batchId", "rowNumber");

-- CreateIndex
CREATE INDEX "ValidationFinding_batchId_severity_idx" ON "ValidationFinding"("batchId", "severity");

-- CreateIndex
CREATE INDEX "ValidationFinding_districtId_idx" ON "ValidationFinding"("districtId");

-- CreateIndex
CREATE UNIQUE INDEX "DatasetVersion_batchId_key" ON "DatasetVersion"("batchId");

-- CreateIndex
CREATE INDEX "DatasetVersion_districtId_dataset_fiscalYear_period_idx" ON "DatasetVersion"("districtId", "dataset", "fiscalYear", "period");

-- CreateIndex
CREATE INDEX "DatasetVersion_districtId_dataset_fiscalYear_period_isCurre_idx" ON "DatasetVersion"("districtId", "dataset", "fiscalYear", "period", "isCurrent");

-- CreateIndex
CREATE INDEX "BudgetLine_districtId_fiscalYear_kind_budgetType_idx" ON "BudgetLine"("districtId", "fiscalYear", "kind", "budgetType");

-- CreateIndex
CREATE INDEX "BudgetLine_versionId_idx" ON "BudgetLine"("versionId");

-- CreateIndex
CREATE INDEX "BudgetLine_fundId_idx" ON "BudgetLine"("fundId");

-- CreateIndex
CREATE INDEX "RevenueActual_districtId_fiscalYear_period_idx" ON "RevenueActual"("districtId", "fiscalYear", "period");

-- CreateIndex
CREATE INDEX "RevenueActual_versionId_idx" ON "RevenueActual"("versionId");

-- CreateIndex
CREATE INDEX "RevenueActual_districtId_fiscalYear_period_fundId_idx" ON "RevenueActual"("districtId", "fiscalYear", "period", "fundId");

-- CreateIndex
CREATE INDEX "RevenueActual_districtId_fiscalYear_period_revenueSourceId_idx" ON "RevenueActual"("districtId", "fiscalYear", "period", "revenueSourceId");

-- CreateIndex
CREATE INDEX "ExpenditureActual_districtId_fiscalYear_period_idx" ON "ExpenditureActual"("districtId", "fiscalYear", "period");

-- CreateIndex
CREATE INDEX "ExpenditureActual_versionId_idx" ON "ExpenditureActual"("versionId");

-- CreateIndex
CREATE INDEX "ExpenditureActual_districtId_fiscalYear_period_fundId_idx" ON "ExpenditureActual"("districtId", "fiscalYear", "period", "fundId");

-- CreateIndex
CREATE INDEX "ExpenditureActual_districtId_fiscalYear_period_functionId_idx" ON "ExpenditureActual"("districtId", "fiscalYear", "period", "functionId");

-- CreateIndex
CREATE INDEX "ExpenditureActual_districtId_fiscalYear_period_objectId_idx" ON "ExpenditureActual"("districtId", "fiscalYear", "period", "objectId");

-- CreateIndex
CREATE INDEX "CashPosition_districtId_fiscalYear_period_idx" ON "CashPosition"("districtId", "fiscalYear", "period");

-- CreateIndex
CREATE INDEX "CashPosition_versionId_idx" ON "CashPosition"("versionId");

-- CreateIndex
CREATE INDEX "CashPosition_districtId_fiscalYear_period_fundId_idx" ON "CashPosition"("districtId", "fiscalYear", "period", "fundId");

-- CreateIndex
CREATE INDEX "OpeningFundBalance_districtId_fiscalYear_idx" ON "OpeningFundBalance"("districtId", "fiscalYear");

-- CreateIndex
CREATE INDEX "OpeningFundBalance_versionId_idx" ON "OpeningFundBalance"("versionId");

-- CreateIndex
CREATE INDEX "OpeningFundBalance_fundId_idx" ON "OpeningFundBalance"("fundId");

-- CreateIndex
CREATE INDEX "FundBalanceOverride_versionId_idx" ON "FundBalanceOverride"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "FundBalanceOverride_districtId_fiscalYear_period_fundId_fie_key" ON "FundBalanceOverride"("districtId", "fiscalYear", "period", "fundId", "field");

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportStagingRow" ADD CONSTRAINT "ImportStagingRow_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportStagingRow" ADD CONSTRAINT "ImportStagingRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationFinding" ADD CONSTRAINT "ValidationFinding_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationFinding" ADD CONSTRAINT "ValidationFinding_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetVersion" ADD CONSTRAINT "DatasetVersion_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetVersion" ADD CONSTRAINT "DatasetVersion_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DatasetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_revenueSourceId_fkey" FOREIGN KEY ("revenueSourceId") REFERENCES "RevenueSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_functionId_fkey" FOREIGN KEY ("functionId") REFERENCES "functions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_capitalProjectId_fkey" FOREIGN KEY ("capitalProjectId") REFERENCES "CapitalProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "Grant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueActual" ADD CONSTRAINT "RevenueActual_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueActual" ADD CONSTRAINT "RevenueActual_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DatasetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueActual" ADD CONSTRAINT "RevenueActual_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueActual" ADD CONSTRAINT "RevenueActual_revenueSourceId_fkey" FOREIGN KEY ("revenueSourceId") REFERENCES "RevenueSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueActual" ADD CONSTRAINT "RevenueActual_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "Grant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueActual" ADD CONSTRAINT "RevenueActual_capitalProjectId_fkey" FOREIGN KEY ("capitalProjectId") REFERENCES "CapitalProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueActual" ADD CONSTRAINT "RevenueActual_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenditureActual" ADD CONSTRAINT "ExpenditureActual_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenditureActual" ADD CONSTRAINT "ExpenditureActual_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DatasetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenditureActual" ADD CONSTRAINT "ExpenditureActual_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenditureActual" ADD CONSTRAINT "ExpenditureActual_functionId_fkey" FOREIGN KEY ("functionId") REFERENCES "functions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenditureActual" ADD CONSTRAINT "ExpenditureActual_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenditureActual" ADD CONSTRAINT "ExpenditureActual_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenditureActual" ADD CONSTRAINT "ExpenditureActual_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "Grant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenditureActual" ADD CONSTRAINT "ExpenditureActual_capitalProjectId_fkey" FOREIGN KEY ("capitalProjectId") REFERENCES "CapitalProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashPosition" ADD CONSTRAINT "CashPosition_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashPosition" ADD CONSTRAINT "CashPosition_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DatasetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashPosition" ADD CONSTRAINT "CashPosition_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningFundBalance" ADD CONSTRAINT "OpeningFundBalance_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningFundBalance" ADD CONSTRAINT "OpeningFundBalance_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DatasetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningFundBalance" ADD CONSTRAINT "OpeningFundBalance_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningFundBalance" ADD CONSTRAINT "OpeningFundBalance_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "Status"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundBalanceOverride" ADD CONSTRAINT "FundBalanceOverride_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundBalanceOverride" ADD CONSTRAINT "FundBalanceOverride_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DatasetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundBalanceOverride" ADD CONSTRAINT "FundBalanceOverride_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Hand-written: the two DatasetVersion invariants Prisma cannot express.
--
-- `period` is NULL for the three ANNUAL datasets (Revenue Budget, Expenditure
-- Budget, Opening Fund Balance). Postgres treats every NULL as DISTINCT, so any
-- plain UNIQUE containing `period` silently stops constraining annual rows —
-- half the importers. COALESCE(period, -1) closes that. -1 is safe: real periods
-- are 1..12 (monthly) and 1..2 (survey), never negative.
-- ============================================================================

-- 1. One version number per district × dataset × fiscal year × period.
--    Prisma's @@unique would have put a bare `period` in the key. See the note on
--    the DatasetVersion model in schema.prisma.
CREATE UNIQUE INDEX "DatasetVersion_one_version_number"
  ON "DatasetVersion" ("districtId", "dataset", "fiscalYear", COALESCE("period", -1), "version");

-- 2. Exactly ONE current version per district × dataset × fiscal year × period.
--    Prisma's @@unique has no WHERE clause, so this can only live here. This is the
--    invariant behind "exactly one version drives the dashboards" (Spec §5.9), and
--    it is what makes the commit in lib/import/commit.ts safe: clearing isCurrent
--    before setting the new one is required, and this index is what enforces it.
CREATE UNIQUE INDEX "DatasetVersion_one_current_per_period"
  ON "DatasetVersion" ("districtId", "dataset", "fiscalYear", COALESCE("period", -1))
  WHERE "isCurrent" = true;
