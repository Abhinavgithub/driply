"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { EmailAuthForm } from "@/components/email-auth-form";
import { GoogleAuthButton } from "@/components/google-auth-button";
import { normalizeNextPath } from "@/lib/navigation";

export default function SignInPageClient() {
  const searchParams = useSearchParams();
  const nextPath = useMemo(
    () => normalizeNextPath(searchParams.get("next"), "/today"),
    [searchParams],
  );
  const [error, setError] = useState<string | null>(searchParams.get("error"));

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center">
      <section className="app-card w-full rounded-3xl p-6">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-foreground">Sign in</h1>
          <p className="text-sm muted-copy">Welcome back. Use Google to open your wardrobe.</p>
        </div>

        {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}

        <GoogleAuthButton className="button-primary mt-6 w-full gap-2" nextPath={nextPath} onError={setError}>
          Log in with Google
        </GoogleAuthButton>

        <div className="my-6 flex items-center gap-3">
          <div className="h-[1px] flex-1 bg-white/10" />
          <span className="text-xs font-medium uppercase muted-copy">or</span>
          <div className="h-[1px] flex-1 bg-white/10" />
        </div>

        <EmailAuthForm mode="sign-in" nextPath={nextPath} onError={setError} />

        <p className="mt-4 text-sm muted-copy">
          Don't have an account?{" "}
          <Link href="/sign-up" className="text-foreground underline">
            Sign up
          </Link>
        </p>
      </section>
    </div>
  );
}
