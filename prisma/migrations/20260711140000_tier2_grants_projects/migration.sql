-- Tier 2 (Stage 2): Grants + Capital Projects.
--   Grants: add Revenue Type link, Award Amount, Status, Grant Period (replaces
--   Fiscal Year), Grant Manager, CFDA Number; drop the Fund link.
--   Capital Projects: add Status + Project Type.
-- Rows are wiped so districts start from the new shape (no legacy fiscalYear/fund data).

DELETE FROM "Grant";
DELETE FROM "CapitalProject";

-- CreateEnum
CREATE TYPE "GrantStatus" AS ENUM ('PENDING', 'ACTIVE', 'ON_HOLD', 'CLOSE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNING', 'DESIGN', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('NEW_CONSTRUCTION', 'RENOVATION', 'ADDITION', 'MAINTENANCE', 'TECHNOLOGY', 'SAFETY_SECURITY', 'OTHER');

-- DropForeignKey
ALTER TABLE "Grant" DROP CONSTRAINT "Grant_fundId_fkey";

-- DropIndex
DROP INDEX "Grant_fundId_idx";

-- AlterTable
ALTER TABLE "CapitalProject" ADD COLUMN     "projectType" "ProjectType",
ADD COLUMN     "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNING';

-- AlterTable
ALTER TABLE "Grant" DROP COLUMN "fiscalYear",
DROP COLUMN "fundId",
ADD COLUMN     "awardAmount" DECIMAL(65,30),
ADD COLUMN     "cfdaNumber" TEXT,
ADD COLUMN     "grantManager" TEXT,
ADD COLUMN     "grantPeriod" TEXT,
ADD COLUMN     "revenueTypeId" TEXT,
ADD COLUMN     "status" "GrantStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "Grant_revenueTypeId_idx" ON "Grant"("revenueTypeId");

-- AddForeignKey
ALTER TABLE "Grant" ADD CONSTRAINT "Grant_revenueTypeId_fkey" FOREIGN KEY ("revenueTypeId") REFERENCES "RevenueType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
