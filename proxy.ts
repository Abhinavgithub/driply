import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { normalizeNextPath } from "@/lib/navigation";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

function copyCookies(from: NextResponse, to: NextResponse) {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie);
  }
  return to;
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  let supabase: ReturnType<typeof createServerClient>;
  try {
    supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
      auth: {
        flowType: "pkce",
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }

          response = NextResponse.next({
            request,
          });

          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    });
  } catch (error) {
    // Misconfigured env must not 500 every page: degrade to no session and
    // let client-side 401 handling take over. validateEnv() still fails the
    // boot loudly via instrumentation.ts.
    console.warn("[proxy] Supabase client init failed, skipping auth gate", {
      error: error instanceof Error ? error.message : String(error),
    });
    return response;
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error && error.name !== "AuthSessionMissingError") {
    // Transient failure (network/timeout): do NOT redirect to /sign-in —
    // that would loop on blips. Fail open; client-side handling covers it.
    // A merely absent session (logged out) still flows into the redirect
    // logic below via user === null.
    console.warn("[proxy] getUser failed, skipping auth gate", { error: error.message });
    return response;
  }

  const pathname = request.nextUrl.pathname;
  // Prefix match: the matcher (:path*) also covers future sub-routes, so the
  // gate must not use exact equality (a sub-route would otherwise fall
  // through to a 404 instead of /sign-in).
  const isProtected =
    pathname === "/today" ||
    pathname.startsWith("/today/") ||
    pathname === "/library" ||
    pathname.startsWith("/library/");
  const isSignIn = pathname === "/sign-in";

  if (!user && isProtected) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/sign-in";
    redirectUrl.searchParams.set("next", normalizeNextPath(`${pathname}${request.nextUrl.search}`));
    return copyCookies(response, NextResponse.redirect(redirectUrl));
  }

  if (user && isSignIn) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = normalizeNextPath(request.nextUrl.searchParams.get("next"), "/today");
    redirectUrl.search = "";
    return copyCookies(response, NextResponse.redirect(redirectUrl));
  }

  return response;
}

// NOTE (auth boundary, deliberate): only /today + /library are server-gated.
// /profile relies on client-side 401 handling (useApiFetch → /sign-in) and
// /onboarding is public by design for new users. Revisit if profile gains
// server-rendered private data. `:path*` also matches the bare path, so this
// covers future sub-routes (previously exact strings bypassed them).
export const config = {
  matcher: ["/today/:path*", "/library/:path*", "/sign-in"],
};
