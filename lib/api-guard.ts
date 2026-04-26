import { type NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

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
    if (rateLimit && !checkRateLimit(rateLimit.key(user), rateLimit.max)) {
      return NextResponse.json(
        { error: "Too many requests. Try again in a minute." },
        { status: 429 },
      );
    }
    return handler(user, req);
  };
}
