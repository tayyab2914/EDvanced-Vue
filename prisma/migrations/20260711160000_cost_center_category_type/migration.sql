-- Cost Center gets a Category (School / Department / Operations / Other) and a
-- Type that depends on the category. Nullable so existing rows are unaffected;
-- required going forward via app validation.

-- AlterTable
ALTER TABLE "School" ADD COLUMN     "category" TEXT,
ADD COLUMN     "type" TEXT;
