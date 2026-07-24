-- M4 — Forecasting & Planning becomes configurable.
--
-- The client's note: "there is not a one-size-fits-all approach. Districts have different
-- board policies and budgeting practices, so assumptions such as one-time expenditures,
-- recurring expenditures, committed reserves, restricted balances, and other fund balance
-- components should be configurable rather than hard-coded."
--
-- Two additions, no destructive change:
--
--   1. ForecastAssumption gains a recurring and a one-time adjustment. On the
--      district-level row (both category columns null) these are the Forecasting &
--      Planning screen's Recurring / One-Time revenue adjustments and the one-time and
--      carryforward spending excluded from the recurring operating base.
--
--   2. FundBalanceComponentAssumption stores the RULE each fund balance component is
--      projected by. FundBalanceProjection already stores the resulting figures per year;
--      this is what produces them, so a district states a policy once instead of typing
--      four numbers per component per year.
--
-- Both columns are nullable and the new table starts empty, so an un-migrated district
-- keeps exactly the behaviour it has today: no adjustments, and every component carried
-- forward flat.

-- AlterTable
ALTER TABLE "ForecastAssumption"
  ADD COLUMN "recurringAdjustment" DECIMAL(18,2),
  ADD COLUMN "oneTimeAdjustment"   DECIMAL(18,2);

-- CreateTable
CREATE TABLE "FundBalanceComponentAssumption" (
    "id" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "annualIncreasePercent" DECIMAL(7,3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundBalanceComponentAssumption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FundBalanceComponentAssumption_districtId_fiscalYear_idx"
  ON "FundBalanceComponentAssumption"("districtId", "fiscalYear");

-- CreateIndex
CREATE UNIQUE INDEX "FundBalanceComponentAssumption_districtId_fiscalYear_fundId_component_key"
  ON "FundBalanceComponentAssumption"("districtId", "fiscalYear", "fundId", "component");

-- AddForeignKey
ALTER TABLE "FundBalanceComponentAssumption"
  ADD CONSTRAINT "FundBalanceComponentAssumption_districtId_fkey"
  FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundBalanceComponentAssumption"
  ADD CONSTRAINT "FundBalanceComponentAssumption_fundId_fkey"
  FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
