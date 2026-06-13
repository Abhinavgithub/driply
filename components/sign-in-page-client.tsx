"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { GoogleAuthButton } from "@/components/google-auth-button";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import { normalizeNextPath } from "@/lib/navigation";

export default function SignInPageClient() {
  const searchParams = useSearchParams();
  const nextPath = useMemo(
    () => normalizeNextPath(searchParams.get("next"), "/today"),
    [searchParams],
  );
  const [error, setError] = useState<string | null>(searchParams.get("error"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleEmailSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const supabase = getBrowserSupabaseClient();
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        setError(authError.message);
      } else {
        window.location.href = nextPath;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  }

  const hasError = Boolean(error);

  return (
    <div className="lp-auth-page">
      <div className="lp-auth-nav-wrap">
        <nav className="lp-auth-nav">
          <Link href="/" className="lp-auth-logo">
            drip<span>ly</span>
          </Link>
        </nav>
      </div>

      <main className="lp-auth-main">
        <div className="lp-auth-card">
          <div className="lp-auth-header">
            <h1 className="lp-auth-title">Sign in</h1>
            <p className="lp-auth-sub">Welcome back. Use Google to open your wardrobe.</p>
          </div>

          <GoogleAuthButton className="lp-auth-google-btn" nextPath={nextPath} onError={setError}>
            Log in with Google
          </GoogleAuthButton>

          <div className="lp-auth-divider">
            <div className="lp-auth-divider-line" />
            <span className="lp-auth-divider-text">or</span>
            <div className="lp-auth-divider-line" />
          </div>

          <form onSubmit={(e) => void handleEmailSignIn(e)}>
            <div className="lp-auth-form">
              <input
                type="email"
                placeholder="Email address"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`lp-auth-input${hasError ? " error" : ""}`}
              />
              <input
                type="password"
                placeholder="Password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`lp-auth-input${hasError ? " error" : ""}`}
              />
              {error && <p className="lp-auth-error-msg">{error}</p>}
            </div>

            <div className="lp-auth-forgot">
              <Link href="/forgot-password">Forgot password?</Link>
            </div>

            <button type="submit" disabled={isLoading} className="lp-auth-primary-btn">
              {isLoading ? "Signing in…" : "Log in with Email"}
            </button>
          </form>

          <p className="lp-auth-footer-text">
            Don&apos;t have an account? <Link href="/sign-up">Sign up</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
