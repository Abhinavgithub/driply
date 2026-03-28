CREATE TYPE "ItemKind" AS ENUM ('TOP', 'BOTTOM', 'SHOE');
CREATE TYPE "ColorFamily" AS ENUM ('BLACK', 'WHITE', 'BLUE', 'BROWN', 'GREEN', 'RED', 'PINK', 'GREY', 'BEIGE', 'YELLOW', 'MULTI', 'UNKNOWN');
CREATE TYPE "Pattern" AS ENUM ('SOLID', 'STRIPED', 'CHECKERED', 'GRAPHIC', 'PRINTED', 'TEXTURED', 'UNKNOWN');
CREATE TYPE "StyleProfile" AS ENUM ('CASUAL', 'SMART_CASUAL', 'ATHLEISURE', 'FORMAL', 'UNKNOWN');
CREATE TYPE "Formality" AS ENUM ('RELAXED', 'ELEVATED', 'DRESSY', 'UNKNOWN');
CREATE TYPE "WarmthLevel" AS ENUM ('LIGHT', 'MID', 'WARM', 'UNKNOWN');

CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" "ItemKind" NOT NULL,
    "subtype" TEXT NOT NULL,
    "colorFamily" "ColorFamily" NOT NULL DEFAULT 'UNKNOWN',
    "pattern" "Pattern" NOT NULL DEFAULT 'UNKNOWN',
    "styleProfile" "StyleProfile" NOT NULL DEFAULT 'UNKNOWN',
    "formality" "Formality" NOT NULL DEFAULT 'UNKNOWN',
    "warmthLevel" "WarmthLevel" NOT NULL DEFAULT 'UNKNOWN',
    "photoUrl" TEXT NOT NULL,
    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OutfitHistory" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "date" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "topItemId" TEXT NOT NULL,
    "bottomItemId" TEXT NOT NULL,
    "shoeItemId" TEXT NOT NULL,
    CONSTRAINT "OutfitHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "Item_userId_createdAt_idx" ON "Item"("userId", "createdAt");
CREATE INDEX "OutfitHistory_userId_date_idx" ON "OutfitHistory"("userId", "date");

ALTER TABLE "Item"
  ADD CONSTRAINT "Item_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OutfitHistory"
  ADD CONSTRAINT "OutfitHistory_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutfitHistory" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own" ON "User";
CREATE POLICY "users_select_own" ON "User"
  FOR SELECT
  USING (auth.uid() = "id");

DROP POLICY IF EXISTS "users_update_own" ON "User";
CREATE POLICY "users_update_own" ON "User"
  FOR UPDATE
  USING (auth.uid() = "id")
  WITH CHECK (auth.uid() = "id");

DROP POLICY IF EXISTS "items_select_own" ON "Item";
CREATE POLICY "items_select_own" ON "Item"
  FOR SELECT
  USING (auth.uid() = "userId");

DROP POLICY IF EXISTS "items_insert_own" ON "Item";
CREATE POLICY "items_insert_own" ON "Item"
  FOR INSERT
  WITH CHECK (auth.uid() = "userId");

DROP POLICY IF EXISTS "items_update_own" ON "Item";
CREATE POLICY "items_update_own" ON "Item"
  FOR UPDATE
  USING (auth.uid() = "userId")
  WITH CHECK (auth.uid() = "userId");

DROP POLICY IF EXISTS "items_delete_own" ON "Item";
CREATE POLICY "items_delete_own" ON "Item"
  FOR DELETE
  USING (auth.uid() = "userId");

DROP POLICY IF EXISTS "outfit_history_select_own" ON "OutfitHistory";
CREATE POLICY "outfit_history_select_own" ON "OutfitHistory"
  FOR SELECT
  USING (auth.uid() = "userId");

DROP POLICY IF EXISTS "outfit_history_insert_own" ON "OutfitHistory";
CREATE POLICY "outfit_history_insert_own" ON "OutfitHistory"
  FOR INSERT
  WITH CHECK (auth.uid() = "userId");

DROP POLICY IF EXISTS "outfit_history_update_own" ON "OutfitHistory";
CREATE POLICY "outfit_history_update_own" ON "OutfitHistory"
  FOR UPDATE
  USING (auth.uid() = "userId")
  WITH CHECK (auth.uid() = "userId");

DROP POLICY IF EXISTS "outfit_history_delete_own" ON "OutfitHistory";
CREATE POLICY "outfit_history_delete_own" ON "OutfitHistory"
  FOR DELETE
  USING (auth.uid() = "userId");

INSERT INTO storage.buckets ("id", "name", "public", "file_size_limit", "allowed_mime_types")
VALUES (
  'wardrobe',
  'wardrobe',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT ("id") DO UPDATE
SET "public" = EXCLUDED."public";

DROP POLICY IF EXISTS "wardrobe_select_own" ON storage.objects;
CREATE POLICY "wardrobe_select_own" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'wardrobe'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "wardrobe_insert_own" ON storage.objects;
CREATE POLICY "wardrobe_insert_own" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'wardrobe'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "wardrobe_update_own" ON storage.objects;
CREATE POLICY "wardrobe_update_own" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'wardrobe'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'wardrobe'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "wardrobe_delete_own" ON storage.objects;
CREATE POLICY "wardrobe_delete_own" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'wardrobe'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
