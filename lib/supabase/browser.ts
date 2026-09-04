"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | undefined;

export function getBrowserSupabaseClient() {
  if (!browserClient) {
    // NOTE: literal process.env.NEXT_PUBLIC_* access is REQUIRED here.
    // Next.js statically inlines only literal references at build time;
    // the centralized getters in lib/env.ts read via a dynamic key
    // (process.env[name]), which is undefined in browser bundles and threw
    // "Missing required environment variable" on every page load.
    // Still fail fast (not ?? "") so a build without client env fails loudly
    // instead of shipping silently broken auth.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY — rebuild with client env set.",
      );
    }
    browserClient = createBrowserClient(url, anonKey, {
      auth: {
        flowType: "pkce",
      },
    });
  }

  return browserClient;
}
