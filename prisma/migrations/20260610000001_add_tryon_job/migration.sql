-- Async try-on generation jobs: created by POST /api/tryon, processed by a
-- background worker, polled by the client.
CREATE TYPE "TryOnJobStatus" AS ENUM ('PENDING', 'RUNNING', 'READY', 'FAILED');

CREATE TABLE "TryOnJob" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "topItemId" TEXT NOT NULL,
    "bottomItemId" TEXT NOT NULL,
    "shoeItemId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "TryOnJobStatus" NOT NULL DEFAULT 'PENDING',
    "errorCode" TEXT,
    "resultPath" TEXT,
    "resultMimeType" TEXT,
    "startedAt" TIMESTAMPTZ,
    "completedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TryOnJob_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TryOnJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TryOnJob_userId_createdAt_idx" ON "TryOnJob"("userId", "createdAt");
