-- Tier 1: move FundType + Status from per-district reference lists to platform-managed
-- global lookups, and add RevenueType / ObjectType / FunctionType.
--
-- The seeded per-district FundType/Status rows are disposable reference data (the
-- same standard names were copied into every district), so they are wiped here and
-- re-seeded once, globally, by prisma/seed.ts. Funds are detached from their old
-- per-district fund type first so the rows can be removed cleanly.
UPDATE "Fund" SET "fundTypeId" = NULL;
DELETE FROM "FundType";
DELETE FROM "Status";

-- DropForeignKey
ALTER TABLE "FundType" DROP CONSTRAINT "FundType_districtId_fkey";

-- DropForeignKey
ALTER TABLE "Status" DROP CONSTRAINT "Status_districtId_fkey";

-- DropIndex
DROP INDEX "FundType_districtId_code_key";

-- DropIndex
DROP INDEX "FundType_districtId_idx";

-- DropIndex
DROP INDEX "Status_districtId_code_key";

-- DropIndex
DROP INDEX "Status_districtId_idx";

-- AlterTable
ALTER TABLE "FundType" DROP COLUMN "code",
DROP COLUMN "districtId",
DROP COLUMN "isStandard",
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Status" DROP COLUMN "code",
DROP COLUMN "districtId",
DROP COLUMN "isStandard",
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "RevenueType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevenueType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObjectType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObjectType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FunctionType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FunctionType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RevenueType_name_key" ON "RevenueType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ObjectType_name_key" ON "ObjectType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "FunctionType_name_key" ON "FunctionType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "FundType_name_key" ON "FundType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Status_name_key" ON "Status"("name");
