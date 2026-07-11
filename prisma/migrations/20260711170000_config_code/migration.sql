-- Add an optional Code to the platform-managed lookup lists (unique when set).

ALTER TABLE "FundType" ADD COLUMN "code" TEXT;
ALTER TABLE "RevenueType" ADD COLUMN "code" TEXT;
ALTER TABLE "ObjectType" ADD COLUMN "code" TEXT;
ALTER TABLE "FunctionType" ADD COLUMN "code" TEXT;
ALTER TABLE "Status" ADD COLUMN "code" TEXT;

CREATE UNIQUE INDEX "FundType_code_key" ON "FundType"("code");
CREATE UNIQUE INDEX "RevenueType_code_key" ON "RevenueType"("code");
CREATE UNIQUE INDEX "ObjectType_code_key" ON "ObjectType"("code");
CREATE UNIQUE INDEX "FunctionType_code_key" ON "FunctionType"("code");
CREATE UNIQUE INDEX "Status_code_key" ON "Status"("code");
