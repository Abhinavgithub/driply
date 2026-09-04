import { prisma } from "@/lib/prisma";

/** Returns true for "1", "true", "yes", "on" (case-insensitive). */
export function isEnabledFlag(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

let cache: Record<string, string> | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 60_000; // 60 seconds
// Short backoff after a failed refresh so every request during a DB outage
// doesn't hammer findMany (P1-2).
const ERROR_BACKOFF_MS = 5_000;
// Singleflight: concurrent refreshes share one DB round-trip instead of each
// firing findMany when the cache expires (P1-2 thundering herd).
let inflightRefresh: Promise<Record<string, string>> | null = null;

/**
 * Reads a runtime config value from the AppConfig table.
 * Results are cached for 60 seconds to avoid a DB round-trip on every request.
 * Falls back to process.env if the DB is unreachable, so the app never breaks
 * if the table is empty or the connection is temporarily lost.
 */
export async function getConfig(key: string): Promise<string | undefined> {
  const now = Date.now();
  if (!cache || now >= cacheExpiresAt) {
    if (!inflightRefresh) {
      inflightRefresh = (async () => {
        const rows = await prisma.appConfig.findMany({ select: { key: true, value: true } });
        return Object.fromEntries(rows.map((r) => [r.key, r.value]));
      })();
      // Clear the shared slot once settled so the next expiry starts fresh.
      inflightRefresh.then(
        () => {
          inflightRefresh = null;
        },
        () => {
          inflightRefresh = null;
        },
      );
    }
    try {
      cache = await inflightRefresh;
      cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    } catch {
      // DB unavailable — prefer stale cache over env defaults so a transient
      // outage doesn't flip feature flags. Fall back to process.env only on
      // a cold start where no cache has been loaded yet. Extend the expiry
      // briefly so we don't retry the DB on every request during an outage.
      cacheExpiresAt = Date.now() + ERROR_BACKOFF_MS;
      if (cache !== null) return cache[key] ?? process.env[key];
      return process.env[key];
    }
  }
  // env var is the ultimate fallback if the key is absent from the DB table
  return cache[key] ?? process.env[key];
}
