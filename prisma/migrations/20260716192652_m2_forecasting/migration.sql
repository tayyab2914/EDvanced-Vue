-- CreateTable
CREATE TABLE "ForecastAssumption" (
    "id" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "kind" "BudgetKind" NOT NULL,
    "revenueTypeId" TEXT,
    "objectTypeId" TEXT,
    "growthPercent" DECIMAL(7,3),
    "projectedYearEnd" DECIMAL(18,2),
    "monitored" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForecastAssumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundBalanceProjection" (
    "id" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "nonspendable" DECIMAL(18,2),
    "restricted" DECIMAL(18,2),
    "committed" DECIMAL(18,2),
    "assigned" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundBalanceProjection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ForecastAssumption_districtId_fiscalYear_idx" ON "ForecastAssumption"("districtId", "fiscalYear");

-- CreateIndex
CREATE UNIQUE INDEX "ForecastAssumption_districtId_fiscalYear_kind_revenueTypeId_key" ON "ForecastAssumption"("districtId", "fiscalYear", "kind", "revenueTypeId", "objectTypeId");

-- CreateIndex
CREATE INDEX "FundBalanceProjection_districtId_idx" ON "FundBalanceProjection"("districtId");

-- CreateIndex
CREATE UNIQUE INDEX "FundBalanceProjection_districtId_fiscalYear_fundId_key" ON "FundBalanceProjection"("districtId", "fiscalYear", "fundId");

-- AddForeignKey
ALTER TABLE "ForecastAssumption" ADD CONSTRAINT "ForecastAssumption_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecastAssumption" ADD CONSTRAINT "ForecastAssumption_revenueTypeId_fkey" FOREIGN KEY ("revenueTypeId") REFERENCES "RevenueType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecastAssumption" ADD CONSTRAINT "ForecastAssumption_objectTypeId_fkey" FOREIGN KEY ("objectTypeId") REFERENCES "ObjectType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundBalanceProjection" ADD CONSTRAINT "FundBalanceProjection_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundBalanceProjection" ADD CONSTRAINT "FundBalanceProjection_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
