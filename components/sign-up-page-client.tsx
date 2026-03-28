"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { GoogleAuthButton } from "@/components/google-auth-button";
import { normalizeNextPath } from "@/lib/navigation";

export default function SignUpPageClient() {
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
          <h1 className="text-xl font-semibold text-foreground">Get started</h1>
          <p className="text-sm muted-copy">Create your Driply account with Google and start building your wardrobe.</p>
        </div>

        {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}

        <GoogleAuthButton className="button-primary mt-6 w-full gap-2" nextPath={nextPath} onError={setError}>
          Sign up with Google
        </GoogleAuthButton>

        <p className="mt-4 text-sm muted-copy">
          Already have an account?{" "}
          <Link href="/sign-in" className="text-foreground underline">
            Log in
          </Link>
        </p>
      </section>
    </div>
  );
}
