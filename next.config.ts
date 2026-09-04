import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const isDev = process.env.NODE_ENV !== "production";

// Pinned at build time from NEXT_PUBLIC_SUPABASE_URL so a project move or
// custom domain is picked up automatically. Falls back to the wildcard when
// the var is absent (e.g. partial local env) so the build never breaks.
function supabaseOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (raw) {
    try {
      return new URL(raw).origin;
    } catch {
      // fall through to wildcard
    }
  }
  return "https://*.supabase.co";
}

const supabaseSrc = supabaseOrigin();

// 'unsafe-inline' for scripts is required by Next.js bootstrap scripts (no nonce
// setup); dev additionally needs 'unsafe-eval' and websockets for Fast Refresh.
// Phase 1 hardens headers without full nonce migration (tradeoff 3).
// upgrade-insecure-requests is production-only: under `next dev` (plain HTTP)
// it would rewrite /api/* to https://localhost and break local fetches (Codex P2).
// FUTURE: per-request nonce (script-src 'nonce-…' 'strict-dynamic') needs CSP
// moved into proxy.ts with per-request UUIDs — tracked follow-up, not here.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Supabase Storage signed URLs, Google OAuth avatars, Unsplash (landing
  // page outfit examples), blob: for upload previews. No data: — nothing
  // renders data: images (verified: previews use createObjectURL).
  `img-src 'self' ${supabaseSrc} https://lh3.googleusercontent.com https://images.unsplash.com blob:`,
  `connect-src 'self' ${supabaseSrc}${isDev ? " ws:" : ""}`,
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  outputFileTracingRoot: projectRoot,
  // NOTE: no `turbopack` block — package.json pins `--webpack` for dev/build,
  // so Turbopack config would be dead code. Re-adding Turbopack later must
  // re-prove `npm run verify:css` (the Style DNA truncation trauma).
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          // HSTS is production-only: browsers ignore it over HTTP, and emitting
          // it in dev risks pinning https://localhost with self-signed certs.
          ...(isDev
            ? []
            : [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains; preload",
                },
              ]),
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Deny camera/mic/geolocation by default; /today overrides geolocation for weather lookup.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
        ],
      },
      {
        source: "/today/:path*",
        headers: [
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
