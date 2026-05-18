-- CreateEnum
CREATE TYPE "DnaAssetStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "lastDnaRegenAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "StyleDNA" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archetypeName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "traits" TEXT[],
    "colorPalette" TEXT[],
    "imagePromptHints" TEXT[],
    "promptHash" TEXT,
    "moodboardUrl" TEXT,
    "moodboardStatus" "DnaAssetStatus" NOT NULL DEFAULT 'PENDING',
    "textStatus" "DnaAssetStatus" NOT NULL DEFAULT 'PENDING',
    "generationTrigger" TEXT,
    "promptSnapshot" JSONB,
    "generatedAt" TIMESTAMP(3),
    "moodboardGeneratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StyleDNA_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StyleDNA_userId_key" ON "StyleDNA"("userId");

-- CreateIndex
CREATE INDEX "StyleDNA_userId_idx" ON "StyleDNA"("userId");

-- CreateIndex
CREATE INDEX "StyleDNA_promptHash_idx" ON "StyleDNA"("promptHash");

-- AddForeignKey
ALTER TABLE "StyleDNA" ADD CONSTRAINT "StyleDNA_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
