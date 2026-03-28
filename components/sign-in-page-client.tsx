"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { normalizeNextPath } from "@/lib/navigation";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";

export default function SignInPageClient() {
  const searchParams = useSearchParams();
  const nextPath = useMemo(
    () => normalizeNextPath(searchParams.get("next"), "/today"),
    [searchParams],
  );
  const callbackBase = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(searchParams.get("error"));

  async function onSignIn() {
    setLoading(true);
    setError(null);

    const supabase = getBrowserSupabaseClient();
    const redirectBase = callbackBase || window.location.origin;
    const redirectTo = `${redirectBase}/auth/callback?next=${encodeURIComponent(nextPath)}`;

    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center">
      <section className="app-card w-full rounded-3xl p-6">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-foreground">Sign in</h1>
          <p className="text-sm muted-copy">Continue with Google to access your wardrobe.</p>
        </div>

        {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}

        <button type="button" onClick={() => void onSignIn()} disabled={loading} className="button-primary mt-6 w-full">
          {loading ? "Redirecting..." : "Continue with Google"}
        </button>
      </section>
    </div>
  );
}
