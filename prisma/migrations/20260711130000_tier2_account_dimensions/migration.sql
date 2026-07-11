-- Tier 2 (Stage 1): district account dimensions.
--   * Link Revenues / Functions / Objects to their platform-managed type (nullable FK).
--   * Drop the now-unused `isStandard` flag ("no standards" — each district enters its own).
--   * Wipe the previously seeded district account rows so every district starts empty.
-- Cost Centers and Funds keep their tables; Funds already link to FundType (Tier 1).

-- Reset seeded district account data (disposable; districts re-enter/import their own).
DELETE FROM "objects";
DELETE FROM "functions";
DELETE FROM "RevenueSource";
DELETE FROM "Fund";
DELETE FROM "School";

-- AlterTable
ALTER TABLE "Fund" DROP COLUMN "isStandard";

-- AlterTable
ALTER TABLE "RevenueSource" DROP COLUMN "isStandard",
ADD COLUMN     "revenueTypeId" TEXT;

-- AlterTable
ALTER TABLE "functions" DROP COLUMN "isStandard",
ADD COLUMN     "functionTypeId" TEXT;

-- AlterTable
ALTER TABLE "objects" DROP COLUMN "isStandard",
ADD COLUMN     "objectTypeId" TEXT;

-- CreateIndex
CREATE INDEX "RevenueSource_revenueTypeId_idx" ON "RevenueSource"("revenueTypeId");

-- CreateIndex
CREATE INDEX "functions_functionTypeId_idx" ON "functions"("functionTypeId");

-- CreateIndex
CREATE INDEX "objects_objectTypeId_idx" ON "objects"("objectTypeId");

-- AddForeignKey
ALTER TABLE "RevenueSource" ADD CONSTRAINT "RevenueSource_revenueTypeId_fkey" FOREIGN KEY ("revenueTypeId") REFERENCES "RevenueType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "functions" ADD CONSTRAINT "functions_functionTypeId_fkey" FOREIGN KEY ("functionTypeId") REFERENCES "FunctionType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objects" ADD CONSTRAINT "objects_objectTypeId_fkey" FOREIGN KEY ("objectTypeId") REFERENCES "ObjectType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
