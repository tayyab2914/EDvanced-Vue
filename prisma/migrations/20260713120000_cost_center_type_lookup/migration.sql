-- Cost Center Type becomes a platform-managed lookup (like Fund/Revenue/Object/Function
-- Type), but keeps a `category` so the Master Data dropdown stays filtered by Category.

-- CreateTable
CREATE TABLE "CostCenterType" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostCenterType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CostCenterType_code_key" ON "CostCenterType"("code");
CREATE UNIQUE INDEX "CostCenterType_name_key" ON "CostCenterType"("name");
CREATE INDEX "CostCenterType_category_idx" ON "CostCenterType"("category");

-- Seed the previously hardcoded types. `code` carries the old School.type value so the
-- backfill below can match on it; Platform Admins can edit/extend the list afterwards.
INSERT INTO "CostCenterType" ("id", "code", "name", "category", "sortOrder", "updatedAt")
VALUES
    (gen_random_uuid()::text, 'ELEMENTARY', 'Elementary', 'SCHOOL', 10, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'MIDDLE', 'Middle', 'SCHOOL', 20, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'HIGH', 'High', 'SCHOOL', 30, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'K8', 'K-8', 'SCHOOL', 40, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'PREK8', 'PreK-8', 'SCHOOL', 50, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'ALTERNATIVE', 'Alternative', 'SCHOOL', 60, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'CHARTER', 'Charter', 'SCHOOL', 70, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'OTHER_SCHOOL', 'Other School', 'SCHOOL', 80, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'CENTRAL_OFFICE', 'Central Office Department', 'DEPARTMENT', 10, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'SCHOOL_BASED', 'School-Based Department', 'DEPARTMENT', 20, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'OTHER_DEPARTMENT', 'Other Department', 'DEPARTMENT', 30, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'TRANSPORTATION', 'Transportation', 'OPERATIONS', 10, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'MAINTENANCE', 'Maintenance', 'OPERATIONS', 20, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'FACILITIES', 'Facilities', 'OPERATIONS', 30, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'FOOD_SERVICES', 'Food Services', 'OPERATIONS', 40, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'WAREHOUSE', 'Warehouse', 'OPERATIONS', 50, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'FLEET', 'Fleet', 'OPERATIONS', 60, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'CAPITAL_CONSTRUCTION', 'Capital / Construction', 'OPERATIONS', 70, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'OTHER_OPERATIONS', 'Other Operations', 'OPERATIONS', 80, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'DISTRICTWIDE', 'Districtwide', 'OTHER', 10, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'NON_SCHOOL_SITE', 'Non-School Site', 'OTHER', 20, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'OTHER', 'Other', 'OTHER', 30, CURRENT_TIMESTAMP);

-- AlterTable: School.type (free text) -> School.typeId (FK)
ALTER TABLE "School" ADD COLUMN "typeId" TEXT;

UPDATE "School" s
SET "typeId" = t."id"
FROM "CostCenterType" t
WHERE s."type" = t."code" AND s."category" = t."category";

ALTER TABLE "School" DROP COLUMN "type";

-- CreateIndex
CREATE INDEX "School_typeId_idx" ON "School"("typeId");

-- AddForeignKey
ALTER TABLE "School" ADD CONSTRAINT "School_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "CostCenterType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
