# Codex Pre-flight Checklist

Run this **before every `git push` / `gh pr create` / fix-push to a PR**.
Goal: catch the bypass/info-disclosure classes Codex has flagged on Driply
(PR #41: 8 body-limit bypasses in `lib/api-guard.ts`; PR #42: CSP dev breakage,
`/api/readyz` error disclosure) locally — saving Codex quota for major items.

## Tiered workflow

- **Every PR → local pre-flight (free, fast).** Self-review against the table
  below + adversarial `Task(explore)` pass when the diff touches API/auth.
- **Major/security PRs only → draft-PR Codex review.** Qualifies when the diff
  touches `lib/api-guard.ts`, `lib/rate-limit.ts`, auth (`lib/auth.ts`,
  `proxy.ts`), storage (`lib/item-media.ts`, `lib/profile-media.ts`,
  `lib/tryon-job.ts`), crypto/secrets, or adds a new unauthenticated route.
  Push as draft early, comment `@codex review the PR`, fix, then mark ready.

## Checklist

| # | Rule (from past Codex findings) | Where to check |
|---|---|---|
| 1 | Body caps enforced on **actual bytes**, incl. chunked / missing `Content-Length` (stream + cancel, don't buffer via `req.text()` first). Count UTF-8 bytes (`byteLength`/`TextEncoder`), not UTF-16 length. | `lib/api-guard.ts:12-116`, `MAX_JSON_BODY_BYTES` |
| 2 | Body caps apply **independent of `Content-Type`**: `text/plain`, case variants (`Application/JSON`), missing header. Multipart exception only for explicit upload routes, **method+path scoped** (`POST /api/items`, `PATCH /api/profile`). | `lib/api-guard.ts:181-253`, `MULTIPART_LIMITS` |
| 3 | Multipart envelopes capped **before parsing** (`formData()`), streaming byte-accurate, per-route limits preserving valid batches (e.g. multi-file uploads). | `lib/api-guard.ts:193-216` |
| 4 | No raw backend errors to unauthenticated callers: no `error.message` / Prisma / Supabase text in responses on routes excluded from `proxy.ts` matcher. Return stable codes (`"unavailable"`) + `console.error` server-side. | `app/api/readyz/route.ts`, `proxy.ts:68` |
| 5 | No headers that assume HTTPS in dev: `upgrade-insecure-requests`, HSTS gated on `!isDev` (same pattern as `unsafe-eval`/`ws:`). | `next.config.ts:7-53` |
| 6 | Every route has a rate limit: GETs included (`items:get`, `weather:get`, …). Cost-sensitive writes (`tryon:post`, `analyze`, `style-dna`, `items:post`) use `failClosed:true` so DB outage returns 429, not unbounded AI cost. | `lib/rate-limit.ts:16`, `lib/api-guard.ts:156`, `app/api/*/route.ts` |
| 7 | New env vars validated: required in `ALWAYS_REQUIRED` or warned in `validateEnv()` (URL format, enum values like `TRYON_PROVIDER`, `DIRECT_URL`/`TRYON_WORKER_SECRET` warnings). Runs on all runtimes. | `lib/env.ts:70-116`, `instrumentation.ts:6` |
| 8 | Guard changes ship with tests: streaming, byte-count (emoji), content-type spoof, CSRF (missing/mismatch `Origin`, `Referer` fallback, GET exempt). | `lib/api-guard.test.ts` |
| 9 | Temporal handoffs: when a route mutates state then delegates (`after()`, worker POST, cron), trace the exact read/write order across the boundary. Capture pre-mutation values at the writer and pass them explicitly — never re-read "previous" state downstream (PR #43 P2: `style-dna` restore read the endpoint's own `PENDING` write). | route `upsert`/`update` + `after()` targets |
| 10 | Constant coupling: when changing any TTL/limit/quota constant or the behavior of a shared function, `grep` BOTH the literal (`60 * 60`, `3600`, `1-hour`) AND consumer identifiers (`avatarUrl`, `aiTryOnPhotoUrl`, `signedUrl`, `imageUrl`, `<img src`), and enumerate all callers of the changed function. Implicit consumers (plain `<img>`, caches) never mention the TTL (PR #43 P2: profile `<img>` missed by literal-only grep). | `grep -rn "60 \* 60\|3600\|1-hour\|1h "\|avatarUrl\|aiTryOnPhotoUrl\|signedUrl"` |
| 11 | Constraint interaction: when adding a DB unique constraint/index, list every writer that can collide with it AND every reader/recovery flow that assumed pre-constraint behavior (stale thresholds, `timed_out` handling, retention cleanup, P2002 catch paths). Simulate the dead-worker/duplicate-race scenario end to end (PR #43 P1: partial unique index vs 4-min stale + `timed_out`-without-status-change = permanent deadlock). | new `CREATE UNIQUE INDEX` vs route `P2002` + poller semantics |
| 12 | Cold-start failure paths: for any cache/fallback/circuit-breaker logic, trace the first-call-fails case separately from the warm path — `null` initial state often bypasses backoff guards written against a populated cache (PR #43 P2: `!cache` retried every request despite `ERROR_BACKOFF_MS`). Cover with a unit test that fails the dependency on a cold cache. | `lib/appConfig.test.ts` pattern (mock rejection + fake timers) |
| 13 | Client env access must be literal: `"use client"` modules must read `process.env.NEXT_PUBLIC_*` via literal references only — never import server env getters (`lib/env.ts`, `lib/supabase/env.ts`). Next.js statically inlines only literal references; dynamic `process.env[name]` is `undefined` in browser bundles and crashes every page via shared hooks (PR #45 hotfix: `browser.ts` threw `Missing required environment variable` from `useAuthUser` on all pages despite correct `.env`). `curl` against a prod server cannot catch this (SSR only) — verify by grepping the built chunk for the inlined value and absence of the dynamic reader. | `lib/supabase/browser.ts` comment; `grep -o` built `layout-*.js` |

## Verification (same gates as CI)

```bash
npx tsc --noEmit
npm test            # vitest, incl. api-guard CSRF/body-cap cases
npm run lint
npm run build && npm run verify:css
npx prettier --check <touched files>
```

Plus manual spot checks for the class touched:

- CSRF: `curl -H "Origin: https://evil.com"` → 403; POST without `Origin`/`Referer` → 403; GET without origin → 200.
- Readiness: force DB/storage failure → `/api/readyz` body contains only `"unavailable"`, no hosts/connection strings; detail only in server logs.
- Headers: `npm run dev` → no `upgrade-insecure-requests`/HSTS; prod build → both present.

## History

- PR #41 (`b80cdb3` + 7 fixups): chunked bypass → streaming cap → byte count → content-type independence → multipart spoof → method scoping → envelope cap → per-route capacity.
- PR #42 (`0a3053b`, `5013d25`, `dd76b28`): `upgrade-insecure-requests` dev breakage; `/api/readyz` info disclosure.
- PR #43 (Phase 2 draft): dead `style-dna` restore branch (temporal handoff) → rule 9; TTL/cache coupling (10-min URLs vs 45-min client cache) → rule 10; stale-slot deadlock (partial index vs `timed_out` recovery) → rule 11; cold-cache backoff bypass → rule 12; profile `<img>` missed by literal-only grep → rule 10 strengthened.
