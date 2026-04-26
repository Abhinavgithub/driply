/**
 * Fetch a JSON endpoint, throwing on non-2xx responses.
 *
 * On error responses, JSON parsing is attempted but failures are swallowed
 * (error pages may be HTML). On success responses, parse failures throw so
 * callers are not silently handed an empty object instead of real data.
 */
export async function fetchJson<T = unknown>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    // Best-effort: error body may be HTML (e.g. Next.js 500 page)
    const errJson = await res.json().catch(() => ({}));
    throw new Error(
      (errJson as { error?: string }).error ?? `Request failed: ${res.status}`,
    );
  }
  // Success — let parse errors surface; a 200 with invalid JSON is a real bug
  return res.json() as Promise<T>;
}
