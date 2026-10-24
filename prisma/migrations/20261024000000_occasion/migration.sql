-- Core features PR 2: occasion chips on /today.
-- Additive only (nullable columns, new type), so code deployed before this
-- migration is applied keeps working and old rows need no backfill.

-- Idempotent: tolerate a retry after a partial first deploy.
DO $$ BEGIN
  CREATE TYPE "Occasion" AS ENUM ('CASUAL', 'WORK', 'GOING_OUT', 'ACTIVE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "occasionByWeekday" JSONB;
ALTER TABLE "OutfitHistory" ADD COLUMN IF NOT EXISTS "occasion" "Occasion";
