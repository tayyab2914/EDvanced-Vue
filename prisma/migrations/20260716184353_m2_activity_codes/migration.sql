-- CreateEnum
CREATE TYPE "ActivityClass" AS ENUM ('TRANSFERS_IN', 'TRANSFERS_OUT', 'OTHER_FINANCING_SOURCES');

-- CreateTable
CREATE TABLE "FinancialActivityCode" (
    "id" TEXT NOT NULL,
    "activityClass" "ActivityClass" NOT NULL,
    "codeFrom" TEXT NOT NULL,
    "codeTo" TEXT,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialActivityCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinancialActivityCode_activityClass_idx" ON "FinancialActivityCode"("activityClass");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialActivityCode_activityClass_codeFrom_codeTo_key" ON "FinancialActivityCode"("activityClass", "codeFrom", "codeTo");
