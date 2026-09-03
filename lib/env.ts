/**
 * Centralized environment-variable access and boot-time validation.
 *
 * `validateEnv()` is called once from `instrumentation.ts` so a misconfigured
 * deploy fails immediately at server start, with the full list of problems,
 * rather than throwing mid-request on the first endpoint that needs a var.
 *
 * The getters below are the single source of truth; read env vars through
 * them rather than touching `process.env` directly.
 */

function readRequired(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readOptional(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

// ── Core infrastructure (always required) ──
export function getDatabaseUrl() {
  return readRequired("DATABASE_URL");
}

export function getSupabaseUrl() {
  return readRequired("NEXT_PUBLIC_SUPABASE_URL");
}

export function getSupabaseAnonKey() {
  return readRequired("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export function getSupabaseServiceRoleKey() {
  return readRequired("SUPABASE_SERVICE_ROLE_KEY");
}

export function getSupabaseStorageBucket() {
  return readRequired("SUPABASE_STORAGE_BUCKET");
}

export function getAppUrl() {
  return readRequired("NEXT_PUBLIC_APP_URL");
}

// ── Optional / feature-gated ──
export function getGeminiApiKey() {
  return readOptional("GEMINI_API_KEY");
}

export function getOpenAiApiKey() {
  return readOptional("OPENAI_API_KEY");
}

export function getHfToken() {
  return readOptional("HF_TOKEN");
}

export function getTryOnProvider(): "gemini" | "openai" | "flux" {
  const raw = readOptional("TRYON_PROVIDER")?.trim().toLowerCase();
  if (!raw) return "gemini";
  if (raw === "gemini" || raw === "openai" || raw === "flux") return raw;
  return "gemini";
}

export function getDirectUrl() {
  return readOptional("DIRECT_URL");
}

export function getTryOnWorkerSecret() {
  return readOptional("TRYON_WORKER_SECRET");
}

const ALWAYS_REQUIRED = [
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_APP_URL",
] as const;

/**
 * Validates all required env vars at once. Throws a single error listing every
 * problem so a bad deploy surfaces them together. Returns the list of warnings
 * (non-fatal: feature keys that look misconfigured) for logging.
 */
export function validateEnv(): { warnings: string[] } {
  const missing = ALWAYS_REQUIRED.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        `Set these before starting the server (see CLAUDE.md "Environment variables").`,
    );
  }

  const warnings: string[] = [];
  const errors: string[] = [];

  // URL format checks for core infra
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (supabaseUrl) {
    try {
      const u = new URL(supabaseUrl);
      if (u.protocol !== "https:") warnings.push("NEXT_PUBLIC_SUPABASE_URL should use https://");
    } catch {
      errors.push("NEXT_PUBLIC_SUPABASE_URL is not a valid URL");
    }
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) {
    try {
      new URL(appUrl);
    } catch {
      errors.push("NEXT_PUBLIC_APP_URL is not a valid URL");
    }
  }
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (dbUrl && !dbUrl.startsWith("postgresql://") && !dbUrl.startsWith("postgres://")) {
    warnings.push("DATABASE_URL does not start with postgresql:// or postgres://");
  }

  // TRYON_PROVIDER must be known value — typo should surface as warning
  const rawProvider = process.env.TRYON_PROVIDER?.trim();
  if (rawProvider && !["gemini", "openai", "flux"].includes(rawProvider.toLowerCase())) {
    warnings.push(
      `TRYON_PROVIDER="${rawProvider}" is unknown; expected gemini, openai, or flux. Defaulting to gemini.`,
    );
  }

  // DIRECT_URL is required for migrations (prisma.config.ts). Warn if missing in production.
  if (!process.env.DIRECT_URL?.trim()) {
    warnings.push(
      "DIRECT_URL is not set; `prisma migrate deploy` will fail on hosts without direct DB access (see CLAUDE.md).",
    );
  }

  // TRYON_WORKER_SECRET is required for production try-on background function.
  if (process.env.NODE_ENV === "production" && !process.env.TRYON_WORKER_SECRET?.trim()) {
    warnings.push(
      "TRYON_WORKER_SECRET is not set in production; POST /api/tryon will fall back to after() (may not run on Netlify) and jobs can get stuck PENDING.",
    );
  }

  if (errors.length > 0) {
    throw new Error(errors.join("; "));
  }

  // Try-on is the one feature with a hard external dependency per provider.
  // If it's enabled in env, the matching key must be present; warn rather than
  // throw, since the DB-backed flag can override the env default at runtime.
  const tryOnEnabled = ["1", "true", "yes", "on"].includes(
    (process.env.ENABLE_AI_TRYON ?? "").trim().toLowerCase(),
  );
  if (tryOnEnabled) {
    const provider = getTryOnProvider();
    const keyForProvider: Record<string, string> = {
      gemini: "GEMINI_API_KEY",
      openai: "OPENAI_API_KEY",
      flux: "HF_TOKEN",
    };
    const requiredKey = keyForProvider[provider];
    if (requiredKey && !process.env[requiredKey]?.trim()) {
      warnings.push(
        `ENABLE_AI_TRYON is on with TRYON_PROVIDER=${provider} but ${requiredKey} is not set; try-on will fail until it is.`,
      );
    }
  }

  return { warnings };
}
