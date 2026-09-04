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
| 10 | Constant coupling: when changing any TTL/limit/quota constant, `grep` all consumers (client caches, retry loops, comments naming the old value, docs) and update them in the same PR. Stale value-comments are findings (PR #43 P2: 10-min signed URLs vs 45-min `tryon-preview` cache). | `grep -rn "60 \* 60\|3600\|1-hour\|1h "` |

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
- PR #43 (Phase 2 draft): dead `style-dna` restore branch (temporal handoff) → rule 9; TTL/cache coupling (10-min URLs vs 45-min client cache) → rule 10.
