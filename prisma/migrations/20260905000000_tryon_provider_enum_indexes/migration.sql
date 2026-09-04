-- P1-3: constrain TryOnJob.provider to an enum so typos can't silently
-- mis-route jobs (the processor falls through to Gemini for unknown values).
-- Existing rows store lowercase values; normalize to uppercase first.
UPDATE "TryOnJob" SET "provider" = 'GEMINI' WHERE UPPER("provider") NOT IN ('GEMINI', 'FLUX', 'OPENAI');
UPDATE "TryOnJob" SET "provider" = UPPER("provider") WHERE "provider" <> UPPER("provider");

-- Idempotent: the first deploy attempt created the type before failing on
-- the column cast, so a retry must tolerate its presence.
DO $$ BEGIN
  CREATE TYPE "TryOnProvider" AS ENUM ('GEMINI', 'FLUX', 'OPENAI');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "TryOnJob" ALTER COLUMN "provider" DROP DEFAULT;
ALTER TABLE "TryOnJob" ALTER COLUMN "provider" TYPE "TryOnProvider" USING "provider"::"TryOnProvider";
ALTER TABLE "TryOnJob" ALTER COLUMN "provider" SET DEFAULT 'GEMINI'::"TryOnProvider";

-- P1-4: prevent duplicate in-flight jobs for the same outfit. Two concurrent
-- POSTs can both miss the findFirst dedupe check and create twice; the
-- partial unique index makes the loser fail with P2002 so the route can reuse
-- the winner. (Prisma has no partial-index syntax; hand-authored per project
-- workflow.)
CREATE UNIQUE INDEX "TryOnJob_inflight_outfit_idx" ON "TryOnJob"("userId", "topItemId", "bottomItemId", "shoeItemId", "provider") WHERE "status" IN ('PENDING', 'RUNNING');

-- P1-3: cover the stale-job sweep and in-flight lookups by (status, createdAt).
CREATE INDEX "TryOnJob_status_createdAt_idx" ON "TryOnJob"("status", "createdAt");

-- P1-3: drop redundant StyleDNA(userId) index — the @unique already covers it.
DROP INDEX IF EXISTS "StyleDNA_userId_idx";
