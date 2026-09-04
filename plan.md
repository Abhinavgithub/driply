# Driply Code Review — Remaining Work (Phases 2–4)

> Working tracker. Original full review archived at `.opencode/plans/plan.md`.
> All paths under `/Users/abhinav/Developer/Driply` with `file:line` (verified Sep 2026).

## Completed (`933250a` PR #42 + `b80cdb3` Batch 3)

- **Phase 0:** CI `node 22` + `engines` + `concurrency`, `/api/health` (200) + `/api/readyz` (stable `"unavailable"` errors, 200/503)
- **Phase 1:** P0-1 (CSRF fail-closed `lib/api-guard.ts:118`), P0-2 (tiered rate-limit `failClosed`), P0-3 (legacy `recommendation`/`location-search` → `withAuth` + GET limits), env validation (`lib/env.ts`, all-runtimes `instrumentation.ts`), headers tradeoff-3 early half (`upgrade-insecure-requests` + HSTS prod-only, `63072000 preload`, `COOP/CORP`, DNS `off`, `Permissions-Policy` `/today/:path*`)
- **Codex P2s:** dev CSP breakage, `/api/readyz` info disclosure
- **Workflow:** `docs/codex-preflight.md` + `AGENTS.md` pointer (local pre-flight every push; `@codex review` major/security only)
- **Batch 3 (pre-existing):** M1-M12 error boundaries, 100KB/55MB streaming guard, `Permissions-Policy`

## Bucket 1 — P0 Critical remainder

| ID | Severity | Location | Issue | Impact |
|---|---|---|---|---|
| P0-4 | Critical | `lib/tryon-trigger.ts:24-45`, `netlify/functions/tryon-process-background.mts:8-11`, `netlify.toml:26`, `lib/tryon-job.ts:36` | Try-on worker dead path remainder (`TRYON_WORKER_SECRET` warning + all-runtimes validation already shipped): durable retry/DLQ missing; `pg`/`@prisma/adapter-pg` missing from `external_node_modules` (verified: only `sharp`, `@prisma/client`, `openai`, `@huggingface/inference` listed) → bundle crash; `included_files` may miss query engine. Jobs stuck `PENDING` past `JOB_STALE_AFTER_MS` (`app/api/tryon/route.ts:20`). | Silent outage, stuck jobs. |
| P0-5 | Critical | `lib/tryon-job.ts:123-141` | Partial outfit: nulls filtered, fails only if 0 images, 1–2 missing still generates. | Misleading image. |
| P0-6 | Critical | `lib/style-dna.ts:158-186` | Data loss: `upsert` clears `archetypeName/description/traits` before LLM, on failure wipes prior `READY`. | Lost user data. |
| P0-7 | High | `lib/recommendation.ts:451-526` | Unbounded `t*b*s` loops (500k for 100*100*50) in 10s serverless. | Timeout. |
| P0-8 | High | `lib/item-media.ts:17`, `lib/profile-media.ts:43`, `lib/tryon-job.ts:15` | Signed URL TTL `60*60` (verified still 1h in all three) → leak via `Referer`/logs. Tradeoff-2 decision: `600s` + `private`. | Private photo exposure. |

## Bucket 2 — P1 High remainder

| ID | Location | Issue |
|---|---|---|
| P1-1 | `lib/prisma.ts:9,7` | Import-time `getDatabaseUrl()` throw prevents `validateEnv` aggregation (verified still present); adapter not cached leaks pools on HMR. |
| P1-2 | `lib/appConfig.ts:20-35` | Thundering herd 50x `findMany` on expiry; DB outage `cacheExpiresAt` not extended → DDoS; `findMany` loads all rows for one key. |
| P1-3 | `prisma/schema.prisma:122,205,129,155` | `TryOnJob.provider String` not enum; `OutfitHistory @@unique` NULLs distinct → unlimited dupes/day; missing `(status,createdAt)` index → seq scan; redundant `StyleDNA` index. |
| P1-4 | `lib/tryon-job.ts:57-62,176`, `app/api/tryon/route.ts:72-87` | TOCTOU claim then `failJob` without status guard overwrites `READY`; dedupe `findFirst PENDING/RUNNING` race → duplicate jobs (needs partial unique index). |
| P1-5 | `app/api/items/analyze/route.ts:37`, `lib/gemini.ts:342`, `lib/flux-tryon.ts:37-53` | Concurrent analyze double cost; `sharp.toBuffer` uncaught on corrupt JPEG; Flux `setTimeout(()=>{},60s)` no `AbortSignal` hangs to 15m. |
| P1-6 | `lib/openMeteo.ts:30,43,15` | `toFixed(2)` cache collision 1.1km; in-memory `Map` per-instance, unbounded, `AbortSignal.timeout 5000` loses status. |
| P1-7 | `lib/file-magic.ts:88-94` | `detect==null` trusts `blob.type` → HTML polyglot stored 10*10MB. |
| P1-8 | `lib/auth.ts:49-65` | `avatarUrl` from `user_metadata` without URL/length validation → persisted XSS via `<img src>`. |
| P1-9 | `app/onboarding/page.tsx:519-545,649-673`, `components/today/outfit-hero.tsx:41,53`, `components/today/location-panel.tsx:83-98` | Nested `<button>` invalid; hero tiles `div onClick` no `role/tabIndex/onKeyDown`; location search no `<form>` Enter dead. |
| P1-10 | `app/globals.css:254-257`, `components/today/week-history.tsx:98-103`, `components/app-shell.tsx:83-104,299,307` | Focus lost: global `focus` only border, inline wipes, app-shell menu no `role=menu`/focus trap/restore. |
| P1-11 | `app/loading.tsx:1-11`, `app/error.tsx:10-20`, `app/global-error.tsx:18-32`, `app/library/page.tsx:206,293`, `app/onboarding/page.tsx:425,436-449`, `lib/hooks/use-api-fetch.ts` | Silent state: loading no `role=status`, errors no `role=alert`, `window.confirm` blocks, dropzone `div role=button` missing `aria-describedby`, quiz no `aria-pressed`. |
| P1-12r | `proxy.ts:69` | Remainder only (CI pin, concurrency, engines, health probes, all-runtimes validation shipped): matcher exact strings (`/today`, `/library`, `/sign-in` — verified) bypasses future sub-routes. |
| P1-13r | `netlify.toml:26-27`, `next.config.ts:29`, `lib/supabase/browser.ts:11` | Remainder only (env validation shipped): missing externals (see P0-4), `turbopack.root` dead vs `--webpack` scripts, browser env `?? ""` creates empty client instead of throwing. |

## Bucket 3 — P2 Medium remainder

| ID | Location | Issue |
|---|---|---|
| P2-1 | `lib/openai-tryon.ts:40`, `lib/gemini.ts:27,278-339,230,300`, `lib/gemini-tryon.ts:60` | `maxRetries:0`, retry only `RATE_LIMITED` not 5xx/timeout no jitter, `maxOutputTokens 220` truncates, `sharp` unhandled, `DEBUG_GEMINI` logs raw in non-prod. |
| P2-2 | `lib/tryon-job.ts:36-48,158`, `lib/style-dna.ts:154,192-220` | Global prune per-user only, `upsert:true` overwrite, version `+1` race, `.catch(()=>{})` swallows, rule fallback logs misleading `promptSnapshot`. |
| P2-3 | `lib/style-dna-prompt.ts:71,133`, `lib/tryon-prompt.ts:27,10-17` | `replace` not `replaceAll`, `visualSummary` verbatim prompt inject, Unicode strip loses é/中, `hexToColorName` no validation. |
| P2-4 | `components/item-image.tsx:45-52`, `lib/hooks/use-geolocation.ts:90-103`, `components/today/mood-banner.tsx:87-91`, `components/today/score-ring.tsx:22-39` | `<img>` no `width/height/sizes` CLS; geolocation silent retry double spinner; JS typewriter/particles ignore `prefers-reduced-motion` (`app/globals.css:1007` visual override but JS still runs). |
| P2-5 | `app/globals.css:8,414,289,853-882`, `lib/openai-tryon.ts:68` | `--muted-foreground #6a6a64` on `#f7f7f5` 3.8:1 fails AA, mood pill `oklch(92% 0.04 80)` low contrast, week dots color-only, `msg.includes` mis-maps `RATE_LIMITED`. |
| P2-6r | `next.config.ts:19`, `proxy.ts:15` | Remainder only (HSTS bump, `/today/:path*`, `COOP/CORP`, DNS `off`, `upgrade-insecure-requests` prod-only shipped): `connect-src` still `https://*.supabase.co` wildcard (pin to project origin), `data:` in `img-src` (drop if try-on base64 not needed), per-request CSP nonce (`proxy.ts` `x-nonce` + `strict-dynamic`) deferred. |

## Tradeoff decisions — status

1. **Tiered rate-limit fail-closed** — SHIPPED (`lib/rate-limit.ts:16`, `lib/api-guard.ts:156`).
2. **Signed URL TTL 3600 → 600s `private`** — OPEN (P0-8): change `60*60` → `600` in `lib/item-media.ts:17`, `lib/profile-media.ts:43`, `lib/tryon-job.ts:15`; add `Cache-Control: private, max-age=600`; boot check `getBucket().public===false`; `ItemImage` refresh dedupe.
3. **CSP `unsafe-inline` phased** — HALF SHIPPED (headers hardened); REMAINDER (P2-6r): origin pinning + nonce phase.

## Execution sequence

### Phase 2 — Data integrity — MERGED (`2d6f79c` PR #43)

Shipped: lazy Prisma + appConfig singleflight; `TryOnProvider` enum + migration `20260905000000` (applied); try-on guards + netlify externals; style-DNA atomicity + preStatus handoff (Codex round); TTL 600s + re-sign-on-reuse (Codex round); AI resilience; 3 Codex rounds fixed in-branch (stale-slot P1, backoff/profile P2s); preflight rules 9–12 born here. Tests 50 → 61.

### Phase 3 — A11y blockers — MERGED (`e1fa33a` PR #44)

Shipped: de-nested onboarding buttons, hero keyboard tiles, location `<form>`; global focus ring, menu focus trap; live regions + `AlertDialog`; reduced-motion short-circuits; contrast + non-color indicators. Minor tier, no Codex.

### Phase 4 — Reliability polish — MERGED (`03e96a3` PR #45)

Shipped: proxy `:path*` + fail-open errors; browser env fail-fast (hotfixed post-merge: literal `NEXT_PUBLIC_*` access — dynamic reads don't inline); CSP origin pinning; CSS guard hardening. Preflight rule 13 born here.

### Phase 5 — Automated smoke + a11y suite — MERGED (`65320ae` PR #46)

Shipped: Playwright smoke (health/proxy/headers, 11 specs) + public-pages axe (4 specs, reduced-motion emulation) + CI `e2e` job (green 1m37s first run); `--lp-muted` 45%→60% real finding; fail-meaningfully proof recorded. Follow-ups: authenticated axe fixture, CSP nonce.

- **A. Playwright smoke** (`tests/smoke/`, chromium-only, `webServer` on `next start`): `health.spec.ts` (`/api/health` 200, `/api/readyz` shape), `proxy.spec.ts` (307 matrix + `/profile` 200), `headers.spec.ts` (pinned CSP, no `data:`, HSTS, geolocation override, DNS-off)
- **B. Axe, public pages only** (`/`, `/sign-in`, `/sign-up`, `/forgot-password` [+ `/reset-password` if routable]): gate zero serious/critical; authenticated pages deferred (needs seeded-user fixture — follow-up)
- **C. CI `e2e` job**: `npm install -D @playwright/test @axe-core/playwright`, cached chromium, build → start → test, placeholder env
- **Acceptance:** every spec proven to fail meaningfully (broken-build run); full gates green (`tsc`, `lint`, `prettier`, `vitest`, `build`, `verify:css`, `test:e2e`)
- **Review tier:** minor → local pre-flight only

## Workflow (per `docs/codex-preflight.md`)

- One PR per phase; each runs `format:check → lint → tsc --noEmit → vitest → build → verify:css`. Migrations via `DIRECT_URL` manually post-merge (`CLAUDE.md:22`); never `prisma migrate deploy` on Netlify.
- Local pre-flight on every push; `@codex review` only for Phase 2 (major/security).
