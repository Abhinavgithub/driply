CREATE TYPE "AnalysisStatus" AS ENUM ('PENDING', 'READY', 'FAILED', 'SKIPPED');
CREATE TYPE "MetadataSource" AS ENUM ('MANUAL', 'AI', 'MIXED');

ALTER TABLE "Item"
  ADD COLUMN "analysisStatus" "AnalysisStatus" NOT NULL DEFAULT 'SKIPPED',
  ADD COLUMN "metadataSource" "MetadataSource" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "visualSummary" TEXT,
  ADD COLUMN "analysisConfidence" DOUBLE PRECISION,
  ADD COLUMN "analysisModel" TEXT,
  ADD COLUMN "analysisPromptVersion" TEXT,
  ADD COLUMN "analysisErrorCode" TEXT;

UPDATE "Item"
SET
  "analysisStatus" = CASE
    WHEN "colorFamily" <> 'UNKNOWN'
      AND "pattern" <> 'UNKNOWN'
      AND "styleProfile" <> 'UNKNOWN'
      AND "formality" <> 'UNKNOWN'
      AND "warmthLevel" <> 'UNKNOWN'
    THEN 'READY'::"AnalysisStatus"
    ELSE 'SKIPPED'::"AnalysisStatus"
  END,
  "metadataSource" = 'MANUAL'::"MetadataSource";
