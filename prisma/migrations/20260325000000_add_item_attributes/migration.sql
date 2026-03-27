-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "subtype" TEXT NOT NULL,
    "colorFamily" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "pattern" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "styleProfile" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "formality" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "warmthLevel" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "photoUrl" TEXT NOT NULL
);
INSERT INTO "new_Item" ("createdAt", "id", "kind", "photoUrl", "subtype")
SELECT "createdAt", "id", "kind", "photoUrl", "subtype" FROM "Item";
DROP TABLE "Item";
ALTER TABLE "new_Item" RENAME TO "Item";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
