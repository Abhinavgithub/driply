"use client";

import { useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";

interface EmailAuthFormProps {
  mode: "sign-in" | "sign-up";
  nextPath?: string;
  onError?: (msg: string | null) => void;
}

export function EmailAuthForm({ mode, nextPath, onError }: EmailAuthFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (onError) onError(null);

    if (mode === "sign-up" && password !== confirmPassword) {
      if (onError) onError("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    const supabase = getBrowserSupabaseClient();
    const finalNextPath = nextPath || "/today";

    try {
      if (mode === "sign-in") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          if (onError) onError(error.message);
        } else {
          window.location.href = finalNextPath;
        }
      } else {
        const callbackBase = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${callbackBase}/auth/callback?next=${encodeURIComponent(finalNextPath)}`,
          },
        });

        if (error) {
          if (onError) onError(error.message);
        } else {
          if (onError) onError("Check your email for the confirmation link.");
        }
      }
    } catch (err: any) {
      if (onError) onError(err.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex w-full flex-col gap-3">
      <input
        type="email"
        placeholder="Email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-xl border border-white/20 bg-transparent px-4 py-3 text-sm text-foreground focus:border-white/50 focus:outline-none"
      />
      
      <input
        type="password"
        placeholder="Password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded-xl border border-white/20 bg-transparent px-4 py-3 text-sm text-foreground focus:border-white/50 focus:outline-none"
      />

      {mode === "sign-up" && (
        <input
          type="password"
          placeholder="Confirm password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full rounded-xl border border-white/20 bg-transparent px-4 py-3 text-sm text-foreground focus:border-white/50 focus:outline-none"
        />
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="button-primary mt-2 w-full gap-2 disabled:opacity-50"
      >
        {isLoading
          ? "Please wait..."
          : mode === "sign-in"
            ? "Log in with Email"
            : "Sign up with Email"}
      </button>
    </form>
  );
}
