-- Add first/last name to User. `name` stays as a denormalized "First Last" for
-- display; new invites set all three. Backfill splits the existing name on the
-- first space (single-word names get an empty last name).

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastName" TEXT;

-- Backfill from the existing name
UPDATE "User" SET
  "firstName" = split_part("name", ' ', 1),
  "lastName" = CASE
    WHEN position(' ' in "name") > 0
      THEN trim(substring("name" from position(' ' in "name") + 1))
    ELSE ''
  END;
