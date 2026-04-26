const store = new Map<string, { count: number; windowStart: number }>();

// Evict expired entries every 5 minutes to prevent unbounded memory growth.
// .unref() prevents this timer from keeping short-lived processes (test runners,
// seed scripts) alive after their own work is done.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.windowStart > 60_000) store.delete(key);
  }
}, 5 * 60 * 1000).unref();

export function checkRateLimit(key: string, maxPerMinute: number): boolean {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now - entry.windowStart > 60_000) {
    store.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= maxPerMinute) return false;
  entry.count++;
  return true;
}
