-- Add District.state (2-letter US state code)
ALTER TABLE "District" ADD COLUMN "state" TEXT NOT NULL DEFAULT 'FL';
