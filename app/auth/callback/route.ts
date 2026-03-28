import { NextRequest, NextResponse } from "next/server";

import { syncAuthUser } from "@/lib/auth";
import { normalizeNextPath } from "@/lib/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = normalizeNextPath(requestUrl.searchParams.get("next"), "/today");

  if (!code) {
    return NextResponse.redirect(new URL(`/sign-in?error=missing_code`, request.url));
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(`/sign-in?error=${encodeURIComponent(error.message)}`, request.url),
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await syncAuthUser(user);
  }

  return NextResponse.redirect(new URL(nextPath, request.url));
}
