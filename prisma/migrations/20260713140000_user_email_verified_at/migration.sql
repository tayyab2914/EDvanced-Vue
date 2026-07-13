-- Tracks whether the address currently on the user has been proven (a token sent to it
-- was consumed). Cleared when an admin changes the email, which is what surfaces the
-- "Resend invite" action for that user.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

-- Backfill: anyone past the INVITED stage got there by consuming an invite link sent to
-- their current address, so that address is already proven. Still-INVITED users stay null.
UPDATE "User"
SET "emailVerifiedAt" = "updatedAt"
WHERE "status" <> 'INVITED';
