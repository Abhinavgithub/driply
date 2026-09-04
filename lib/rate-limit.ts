import { prisma } from "@/lib/prisma";

const WINDOW_SECONDS = 60;
const PRUNE_PROBABILITY = 0.01;
const PRUNE_OLDER_THAN_MS = 10 * 60 * 1000;

/**
 * Fixed 60s window rate limiter backed by Postgres, so limits hold across
 * serverless instances and cold starts. The insert-or-increment is a single
 * atomic statement; concurrent requests cannot double-count or reset a live
 * window.
 *
 * Tiered fail mode (Phase 1): cost-sensitive writes (tryon, analyze, style-dna, items:post)
 * fail-closed (return false -> 429) on DB error to avoid unbounded AI cost. Idempotent reads
 * fail-open (return true) to keep the app usable during transient DB outage.
 */
export async function checkRateLimit(
  key: string,
  maxPerMinute: number,
  options?: { failClosed?: boolean },
): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      INSERT INTO "RateLimit" ("key", "count", "windowStart")
      VALUES (${key}, 1, now())
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "RateLimit"."windowStart" <= now() - make_interval(secs => ${WINDOW_SECONDS})
          THEN 1
          ELSE "RateLimit"."count" + 1
        END,
        "windowStart" = CASE
          WHEN "RateLimit"."windowStart" <= now() - make_interval(secs => ${WINDOW_SECONDS})
          THEN now()
          ELSE "RateLimit"."windowStart"
        END
      RETURNING "count"
    `;

    if (Math.random() < PRUNE_PROBABILITY) {
      await prisma.rateLimit.deleteMany({
        where: { windowStart: { lt: new Date(Date.now() - PRUNE_OLDER_THAN_MS) } },
      });
    }

    return (rows[0]?.count ?? 1) <= maxPerMinute;
  } catch (error) {
    const failClosed = options?.failClosed ?? false;
    if (failClosed) {
      console.error("[rate-limit] check failed, failing closed (cost-sensitive)", {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
    console.warn("[rate-limit] check failed, allowing request (fail-open for read)", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    // Extend windowStart handling by avoiding immediate retry storm: caller will not prune,
    // but next check would still hit DB. No extra delay needed here as fail-open preserves availability.
    return true;
  }
}
