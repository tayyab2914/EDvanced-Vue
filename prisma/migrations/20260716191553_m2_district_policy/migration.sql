-- CreateTable
CREATE TABLE "DistrictPolicy" (
    "id" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "revenue" JSONB NOT NULL DEFAULT '{}',
    "expenditure" JSONB NOT NULL DEFAULT '{}',
    "cash" JSONB NOT NULL DEFAULT '{}',
    "fundBalance" JSONB NOT NULL DEFAULT '{}',
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistrictPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DistrictPolicy_districtId_key" ON "DistrictPolicy"("districtId");

-- AddForeignKey
ALTER TABLE "DistrictPolicy" ADD CONSTRAINT "DistrictPolicy_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE CASCADE ON UPDATE CASCADE;
