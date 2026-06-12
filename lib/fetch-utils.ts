/** Non-2xx API response. Carries the status and the parsed error body (if any). */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/** True for fetches cancelled via AbortController (e.g. component unmount). */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * True for errors a component should not surface to the user: aborted
 * requests (unmount) and 401s (useApiFetch already redirected to /sign-in).
 */
export function isHandledFetchError(error: unknown): boolean {
  return isAbortError(error) || (error instanceof ApiError && error.status === 401);
}

/**
 * Fetch a JSON endpoint, throwing ApiError on non-2xx responses.
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
    throw new ApiError(
      (errJson as { error?: string }).error ?? `Request failed: ${res.status}`,
      res.status,
      errJson,
    );
  }
  // Success — let parse errors surface; a 200 with invalid JSON is a real bug
  return res.json() as Promise<T>;
}
