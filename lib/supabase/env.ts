// Re-exported from the centralized env module so existing Supabase client
// imports keep working. New code can import from "@/lib/env" directly.
export {
  getSupabaseUrl,
  getSupabaseAnonKey,
  getSupabaseServiceRoleKey,
  getSupabaseStorageBucket,
  getAppUrl,
} from "@/lib/env";
