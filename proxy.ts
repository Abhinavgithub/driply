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

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isProtected = pathname === "/today" || pathname === "/library";
  const isSignIn = pathname === "/sign-in";

  if (!user && isProtected) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/sign-in";
    redirectUrl.searchParams.set(
      "next",
      normalizeNextPath(`${pathname}${request.nextUrl.search}`),
    );
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

export const config = {
  matcher: ["/today", "/library", "/sign-in"],
};
