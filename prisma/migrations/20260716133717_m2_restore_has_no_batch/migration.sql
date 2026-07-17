-- DropForeignKey
ALTER TABLE "DatasetVersion" DROP CONSTRAINT "DatasetVersion_batchId_fkey";

-- AlterTable
ALTER TABLE "DatasetVersion" ADD COLUMN     "restoredFromVersionId" TEXT,
ALTER COLUMN "batchId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "DatasetVersion" ADD CONSTRAINT "DatasetVersion_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
