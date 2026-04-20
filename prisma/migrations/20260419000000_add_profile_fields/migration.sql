-- AlterTable: add profile fields to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "displayName" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "uploadedAvatarUrl" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "aiTryOnPhotoUrl" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "aiTryOnPhotoMimeType" TEXT;
