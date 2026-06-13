"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { getBrowserSupabaseClient } from "@/lib/supabase/browser";

/**
 * Current Supabase auth user, kept in sync with auth state changes.
 * `ready` flips true after the initial session check resolves — render a
 * loading state until then to avoid flashing signed-out UI.
 */
export function useAuthUser() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = getBrowserSupabaseClient();
    let active = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user ?? null);
      setReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setReady(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return { user, ready };
}
