"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

let browserClient: SupabaseClient | undefined;

export function getBrowserSupabaseClient() {
  if (!browserClient) {
    // Centralized getters throw on missing env instead of building a broken
    // client with empty URL/key that fails opaquely in every auth flow.
    browserClient = createBrowserClient(getSupabaseUrl(), getSupabaseAnonKey(), {
      auth: {
        flowType: "pkce",
      },
    });
  }

  return browserClient;
}
