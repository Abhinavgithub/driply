"use client";

import { useState } from "react";
import Link from "next/link";

import { getBrowserSupabaseClient } from "@/lib/supabase/browser";

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

export default function ResetPasswordPageClient() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const strength = getStrength(password);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

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
      const { error: authError } = await supabase.auth.updateUser({ password });
      if (authError) {
        setError(authError.message);
      } else {
        setDone(true);
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
            <h1 className="lp-auth-title">Set new password</h1>
            <p className="lp-auth-sub">Choose a strong password for your driply account.</p>
          </div>

          {done ? (
            <>
              <p className="lp-auth-success-msg" style={{ marginBottom: "24px" }}>
                Password updated. You can now sign in with your new password.
              </p>
              <Link href="/sign-in" className="lp-auth-primary-btn" style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
                Go to sign in
              </Link>
            </>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)}>
              <div className="lp-auth-form">
                <input
                  type="password"
                  placeholder="New password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`lp-auth-input${error ? " error" : ""}`}
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
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`lp-auth-input${error ? " error" : ""}`}
                />
                {error && <p className="lp-auth-error-msg">{error}</p>}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="lp-auth-primary-btn"
              >
                {isLoading ? "Updating…" : "Update password"}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
