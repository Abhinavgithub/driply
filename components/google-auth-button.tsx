"use client";

import { useState } from "react";

import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import { normalizeNextPath } from "@/lib/navigation";

type GoogleAuthButtonProps = {
  className: string;
  children: React.ReactNode;
  nextPath?: string;
  onError?: (message: string | null) => void;
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.75-.07-1.46-.19-2.14H12v4.05h5.39a4.63 4.63 0 0 1-2 3.04v2.52h3.24c1.9-1.75 2.97-4.33 2.97-7.47Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.96-.89 6.62-2.3l-3.24-2.52c-.89.6-2.04.96-3.38.96-2.6 0-4.8-1.75-5.58-4.11H3.08v2.6A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.42 14.03A5.98 5.98 0 0 1 6.1 12c0-.7.12-1.38.32-2.03V7.37H3.08A10 10 0 0 0 2 12c0 1.6.38 3.11 1.08 4.63l3.34-2.6Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.86c1.47 0 2.78.5 3.81 1.48l2.86-2.86C16.95 2.89 14.69 2 12 2A10 10 0 0 0 3.08 7.37l3.34 2.6C7.2 7.61 9.4 5.86 12 5.86Z"
      />
    </svg>
  );
}

export function GoogleAuthButton(props: GoogleAuthButtonProps) {
  const [loading, setLoading] = useState(false);
  const callbackBase = process.env.NEXT_PUBLIC_APP_URL ?? "";

  async function onSignIn() {
    setLoading(true);
    props.onError?.(null);

    const supabase = getBrowserSupabaseClient();
    const redirectBase = callbackBase || window.location.origin;
    const redirectTo = `${redirectBase}/auth/callback?next=${encodeURIComponent(
      normalizeNextPath(props.nextPath, "/today"),
    )}`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });

    if (error) {
      props.onError?.(error.message);
      setLoading(false);
    }
  }

  return (
    <button type="button" onClick={() => void onSignIn()} disabled={loading} className={props.className}>
      {loading ? (
        "Redirecting..."
      ) : (
        <>
          <GoogleIcon />
          <span>{props.children}</span>
        </>
      )}
    </button>
  );
}
