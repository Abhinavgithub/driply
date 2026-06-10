-- Fixed-window rate limit counters, shared across serverless instances.
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "windowStart" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);
