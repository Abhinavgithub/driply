/**
 * Fetch a JSON endpoint, throwing on non-2xx responses.
 * Checks res.ok before parsing so HTML error pages don't cause `.json()` to throw
 * before the status code is examined.
 */
export async function fetchJson<T = unknown>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (json as { error?: string }).error ?? `Request failed: ${res.status}`,
    );
  }
  return json as T;
}
