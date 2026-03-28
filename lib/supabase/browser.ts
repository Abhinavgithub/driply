"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | undefined;

export function getBrowserSupabaseClient() {
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      {
        auth: {
          flowType: "pkce",
        },
      },
    );
  }

  return browserClient;
}
