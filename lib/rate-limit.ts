const store = new Map<string, { count: number; windowStart: number }>();

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
