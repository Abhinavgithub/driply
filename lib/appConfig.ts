import { prisma } from "@/lib/prisma";

let cache: Record<string, string> | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 60_000; // 60 seconds

/**
 * Reads a runtime config value from the AppConfig table.
 * Results are cached for 60 seconds to avoid a DB round-trip on every request.
 * Falls back to process.env if the DB is unreachable, so the app never breaks
 * if the table is empty or the connection is temporarily lost.
 */
export async function getConfig(key: string): Promise<string | undefined> {
  const now = Date.now();
  if (!cache || now >= cacheExpiresAt) {
    try {
      const rows = await prisma.appConfig.findMany();
      cache = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      cacheExpiresAt = now + CACHE_TTL_MS;
    } catch {
      // DB unavailable — prefer stale cache over env defaults so a transient
      // outage doesn't flip feature flags. Fall back to process.env only on
      // a cold start where no cache has been loaded yet.
      if (cache !== null) return cache[key] ?? process.env[key];
      return process.env[key];
    }
  }
  // env var is the ultimate fallback if the key is absent from the DB table
  return cache[key] ?? process.env[key];
}
