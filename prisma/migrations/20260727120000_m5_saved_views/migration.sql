-- M5: saved dashboard filter views, shared within a district.
--
-- A new table with no foreign keys onto the large periodic tables, so this takes no lock
-- that matters: CREATE TABLE plus one FK to District (a small table) and two indexes on an
-- empty table. Nothing is rewritten and no existing query plan changes.

-- CreateTable
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedView_districtId_idx" ON "SavedView"("districtId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedView_districtId_name_key" ON "SavedView"("districtId", "name");

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE CASCADE ON UPDATE CASCADE;
