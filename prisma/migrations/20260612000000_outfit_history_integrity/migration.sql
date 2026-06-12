-- OutfitHistory integrity: item relations (SET NULL on delete) + uniqueness.
-- Data repair must run first: existing rows may reference deleted items
-- (would violate the new FKs) or be duplicates (would violate the unique index).

-- Dedupe: keep the earliest row of each (userId, date, top, bottom, shoe) group
DELETE FROM "OutfitHistory" a
USING "OutfitHistory" b
WHERE a."userId" = b."userId"
  AND a."date" = b."date"
  AND a."topItemId" = b."topItemId"
  AND a."bottomItemId" = b."bottomItemId"
  AND a."shoeItemId" = b."shoeItemId"
  AND (a."createdAt" > b."createdAt" OR (a."createdAt" = b."createdAt" AND a."id" > b."id"));

-- AlterTable (before orphan repair: the columns must accept NULL)
ALTER TABLE "OutfitHistory" ALTER COLUMN "topItemId" DROP NOT NULL,
ALTER COLUMN "bottomItemId" DROP NOT NULL,
ALTER COLUMN "shoeItemId" DROP NOT NULL;

-- Null out references to items that no longer exist
UPDATE "OutfitHistory" h SET "topItemId" = NULL
WHERE h."topItemId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Item" i WHERE i."id" = h."topItemId");

UPDATE "OutfitHistory" h SET "bottomItemId" = NULL
WHERE h."bottomItemId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Item" i WHERE i."id" = h."bottomItemId");

UPDATE "OutfitHistory" h SET "shoeItemId" = NULL
WHERE h."shoeItemId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Item" i WHERE i."id" = h."shoeItemId");

-- DropIndex (superseded by the unique index prefix below)
DROP INDEX "OutfitHistory_userId_date_idx";

-- CreateIndex
CREATE UNIQUE INDEX "OutfitHistory_userId_date_topItemId_bottomItemId_shoeItemId_key" ON "OutfitHistory"("userId", "date", "topItemId", "bottomItemId", "shoeItemId");

-- AddForeignKey
ALTER TABLE "OutfitHistory" ADD CONSTRAINT "OutfitHistory_topItemId_fkey" FOREIGN KEY ("topItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutfitHistory" ADD CONSTRAINT "OutfitHistory_bottomItemId_fkey" FOREIGN KEY ("bottomItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutfitHistory" ADD CONSTRAINT "OutfitHistory_shoeItemId_fkey" FOREIGN KEY ("shoeItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
