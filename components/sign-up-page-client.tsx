"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { GoogleAuthButton } from "@/components/google-auth-button";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import { normalizeNextPath } from "@/lib/navigation";

function getStrength(val: string): { pct: number; color: string } {
  let score = 0;
  if (val.length >= 8) score++;
  if (/[A-Z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;
  const colors = [
    "oklch(65% 0.18 25)",
    "oklch(70% 0.16 50)",
    "oklch(78% 0.16 118)",
    "oklch(75% 0.18 200)",
  ];
  return { pct: (score / 4) * 100, color: colors[Math.max(0, score - 1)] };
}

export default function SignUpPageClient() {
  const searchParams = useSearchParams();
  const nextPath = useMemo(
    () => normalizeNextPath(searchParams.get("next"), "/today"),
    [searchParams],
  );
  const [error, setError] = useState<string | null>(searchParams.get("error"));
  const [info, setInfo] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const strength = getStrength(password);

  async function handleEmailSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setIsLoading(true);
    try {
      const supabase = getBrowserSupabaseClient();
      const callbackBase = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${callbackBase}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      });
      if (authError) {
        setError(authError.message);
      } else {
        setInfo("Check your email for the confirmation link.");
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
            <h1 className="lp-auth-title">Get started</h1>
            <p className="lp-auth-sub">
              Create your driply account with Google and start building your wardrobe.
            </p>
          </div>

          <GoogleAuthButton
            className="lp-auth-google-btn"
            nextPath={nextPath}
            onError={setError}
          >
            Sign up with Google
          </GoogleAuthButton>

          <div className="lp-auth-divider">
            <div className="lp-auth-divider-line" />
            <span className="lp-auth-divider-text">or</span>
            <div className="lp-auth-divider-line" />
          </div>

          <form onSubmit={(e) => void handleEmailSignUp(e)}>
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
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`lp-auth-input${hasError ? " error" : ""}`}
              />
              {password.length > 0 && (
                <div className="lp-auth-strength-bar">
                  <div
                    className="lp-auth-strength-fill"
                    style={{ width: `${strength.pct}%`, background: strength.color }}
                  />
                </div>
              )}
              <input
                type="password"
                placeholder="Confirm password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`lp-auth-input${hasError ? " error" : ""}`}
              />
              {error && <p className="lp-auth-error-msg">{error}</p>}
              {info && <p className="lp-auth-success-msg">{info}</p>}
            </div>

            <p className="lp-auth-terms">
              By signing up you agree to our{" "}
              <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>.
            </p>

            <button
              type="submit"
              disabled={isLoading}
              className="lp-auth-primary-btn"
            >
              {isLoading ? "Creating account…" : "Sign up with Email"}
            </button>
          </form>

          <p className="lp-auth-footer-text">
            Already have an account?{" "}
            <Link href="/sign-in">Log in</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
