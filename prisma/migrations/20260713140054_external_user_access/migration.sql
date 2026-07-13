-- CreateEnum
CREATE TYPE "ExternalAccessStatus" AS ENUM ('PENDING', 'ACTIVE', 'DENIED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ExternalAccessLevel" AS ENUM ('VIEW_ONLY', 'FULL_ACCESS');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'EXTERNAL_USER';

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "activeDistrictId" TEXT;

-- CreateTable
CREATE TABLE "ExternalAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "status" "ExternalAccessStatus" NOT NULL DEFAULT 'PENDING',
    "level" "ExternalAccessLevel",
    "expiresAt" TIMESTAMP(3),
    "requestedByUserId" TEXT,
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalAccess_districtId_status_idx" ON "ExternalAccess"("districtId", "status");

-- CreateIndex
CREATE INDEX "ExternalAccess_userId_idx" ON "ExternalAccess"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalAccess_userId_districtId_key" ON "ExternalAccess"("userId", "districtId");

-- AddForeignKey
ALTER TABLE "ExternalAccess" ADD CONSTRAINT "ExternalAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalAccess" ADD CONSTRAINT "ExternalAccess_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE CASCADE ON UPDATE CASCADE;
