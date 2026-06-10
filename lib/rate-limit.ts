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
 * Fails open on database errors: an unavailable limiter should degrade to
 * "no limit", not take every guarded endpoint down with it.
 */
export async function checkRateLimit(key: string, maxPerMinute: number): Promise<boolean> {
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
    console.warn("[rate-limit] check failed, allowing request", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
}
