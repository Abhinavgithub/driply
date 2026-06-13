"use client";

import { useState } from "react";
import Link from "next/link";

import { getBrowserSupabaseClient } from "@/lib/supabase/browser";

export default function ForgotPasswordPageClient() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const supabase = getBrowserSupabaseClient();
      const redirectBase = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${redirectBase}/auth/callback?next=/reset-password`,
      });
      if (authError) {
        setError(authError.message);
      } else {
        setSent(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  }

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
            <h1 className="lp-auth-title">Reset password</h1>
            <p className="lp-auth-sub">
              Enter your email and we&apos;ll send you a link to reset your password.
            </p>
          </div>

          {sent ? (
            <>
              <p className="lp-auth-success-msg" style={{ marginBottom: "24px" }}>
                Check your email — a reset link is on its way. It may take a minute or two.
              </p>
              <p className="lp-auth-footer-text">
                <Link href="/sign-in">Back to sign in</Link>
              </p>
            </>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)}>
              <div className="lp-auth-form">
                <input
                  type="email"
                  placeholder="Email address"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`lp-auth-input${error ? " error" : ""}`}
                />
                {error && <p className="lp-auth-error-msg">{error}</p>}
              </div>

              <button type="submit" disabled={isLoading} className="lp-auth-primary-btn">
                {isLoading ? "Sending…" : "Send reset link"}
              </button>

              <p className="lp-auth-footer-text">
                <Link href="/sign-in">Back to sign in</Link>
              </p>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
