-- AddColumn
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "stylePreferences" JSONB;
