-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "subtype" TEXT NOT NULL,
    "photoUrl" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "OutfitHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "topItemId" TEXT NOT NULL,
    "bottomItemId" TEXT NOT NULL,
    "shoeItemId" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "OutfitHistory_date_idx" ON "OutfitHistory"("date");
