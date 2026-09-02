import { type NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAppUrl } from "@/lib/env";

export const MAX_JSON_BODY_BYTES = 100 * 1024; // 100 KB for JSON payloads

export async function readLimitedJson(req: NextRequest, limit = MAX_JSON_BODY_BYTES) {
  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > limit) {
    throw new Error(`Payload too large: ${contentLength} > ${limit}`);
  }
  const text = await req.text();
  if (text.length > limit) {
    throw new Error(`Payload too large: ${text.length} > ${limit}`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isAllowedOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const allowedOrigin = (() => {
    try {
      return new URL(getAppUrl()).origin;
    } catch {
      return null;
    }
  })();
  if (!allowedOrigin) return true;
  if (origin) return origin === allowedOrigin;
  if (referer) {
    try {
      return new URL(referer).origin === allowedOrigin;
    } catch {
      return false;
    }
  }
  // No Origin/Referer — allow (e.g. server-to-server, curl); CSRF requires browser to send Origin.
  return true;
}

type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
type AuthedHandler = (user: CurrentUser, req: NextRequest) => Promise<NextResponse>;

/**
 * Wraps a Next.js route handler with authentication and optional rate limiting.
 * Returns 401 if the session is missing, 429 if the rate limit is exceeded.
 *
 * Usage:
 *   export const GET = withAuth(async (user, req) => { ... });
 *   export const POST = withAuth(
 *     async (user, req) => { ... },
 *     { key: (u) => `items:post:${u.appUser.id}`, max: 20 },
 *   );
 */
export function withAuth(
  handler: AuthedHandler,
  rateLimit?: { key: (user: CurrentUser) => string; max: number },
): (req: NextRequest) => Promise<NextResponse> {
  return async (req) => {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    // JSON body size guard (M4): reject oversized payloads before handler reads them.
    const contentType = req.headers.get("content-type") ?? "";
    if (
      contentType.includes("application/json") &&
      ["POST", "PATCH", "PUT", "DELETE"].includes(req.method)
    ) {
      const len = req.headers.get("content-length");
      if (len && Number(len) > MAX_JSON_BODY_BYTES) {
        return NextResponse.json({ error: "Payload too large." }, { status: 413 });
      }
    }
    // CSRF: state-changing requests must originate from allowed app origin.
    if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method) && !isAllowedOrigin(req)) {
      return NextResponse.json({ error: "Forbidden: invalid origin." }, { status: 403 });
    }
    if (rateLimit && !(await checkRateLimit(rateLimit.key(user), rateLimit.max))) {
      const res = NextResponse.json(
        { error: "Too many requests. Try again in a minute." },
        { status: 429 },
      );
      res.headers.set("Retry-After", "60");
      res.headers.set("Vary", "Origin");
      return res;
    }
    return handler(user, req);
  };
}
