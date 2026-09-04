import { defineConfig } from "@playwright/test";

/**
 * Smoke + a11y suite (Phase 5). Chromium-only to keep CI lean; all specs are
 * unauthenticated and env-agnostic so they run against the placeholder env.
 * Authenticated pages are out of scope until a seeded-user fixture exists.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  retries: 1,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: "npm run start -- -p 3100",
    url: "http://localhost:3100/api/health",
    // Never reuse: a stale server from manual probing once silently served
    // pre-fix code to the whole suite (all proxy specs passed against it).
    // A port conflict now fails loudly instead.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
