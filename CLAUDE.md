# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev        # Start dev server (webpack, localhost:3000) — uses --webpack flag, not Turbopack
npm run build      # Production build
npm run lint       # ESLint
npm test           # Vitest (run once); test:watch for watch mode
npm run format     # Prettier --write (format:check for CI-style verify)
npx prisma migrate dev   # Run pending migrations (fails against Supabase — hand-author SQL + migrate deploy instead)
npx prisma generate      # Regenerate Prisma client after schema changes
npx prisma studio        # Browse database
```

Tests use **Vitest** (`*.test.ts` colocated under `lib/`); current coverage is the pure logic — `lib/recommendation.ts` (scoring/weights/penalties/pagination) and `lib/itemAttributes.ts` (Zod schemas + helpers). `postinstall` runs `prisma generate` automatically after `npm install`. CI (`.github/workflows/ci.yml`) runs format-check, lint, `tsc --noEmit`, `npm test`, the production build, and `npm run verify:css` on PRs and pushes to main. `verify:css` (`scripts/verify-built-css.mjs`) asserts representative selectors survive into the built CSS bundle — it also runs in the Netlify build command, because that environment once silently truncated the tail of `app/globals.css` (dropping the Style DNA styles). A husky `pre-commit` hook runs `lint-staged` (Prettier on staged files).

**Migrations are applied manually**, not during deploy: the Netlify build runner (and GitHub-hosted runners) are IPv4-only and cannot reach Supabase's direct connection host (`db.<ref>.supabase.co:5432`, IPv6-only on current Supabase plans), so `prisma migrate deploy` fails there with P1001. After a PR with a migration merges, run `npx prisma migrate deploy` from a machine that can reach the DB (the pooler `DATABASE_URL` is IPv4-reachable but the transaction pooler can't run migrations; use the direct `DIRECT_URL` from such a machine, or the Supabase session pooler).

## Architecture

Driply is a wardrobe assistant: users upload clothing photos, AI classifies them, and the app recommends daily outfits based on weather.

**App Router layout** (`app/`):
- `/today` — outfit recommendations (weather-aware) + AI try-on preview; the page is a thin orchestrator over `components/today/*` (mood banner, hero, score ring, stylist card, week history, location panel, …) and the `useRecommendations` hook
- `/library` — wardrobe item browser
- `/profile` — display name, profile picture (avatar), and AI try-on photo upload
- `/onboarding` — 3-step wizard: style quiz → wardrobe upload → try-on photo (all optional/skippable)
- `/sign-in`, `/sign-up`, `/auth/callback` — auth flow
- `app/api/` — all API routes (items, recommendations, weather, outfits, location-search, profile, tryon, style-dna)

**Client vs Server components:** `/today`, `/library`, `/profile`, `/onboarding` are all `"use client"` pages that fetch data via `useEffect` + browser `fetch()`. Auth pages (`/sign-in`, `/sign-up`, `/auth/callback`) are Server Components. There is no `middleware.ts`; auth is enforced per-route.

**Client fetch convention:** pages call APIs through `useApiFetch()` (`lib/hooks/use-api-fetch.ts`), which wraps `fetchJson` (`lib/fetch-utils.ts`): throws `ApiError` on non-2xx, aborts in-flight requests on unmount, and redirects to `/sign-in` on 401. Catch blocks bail out early with `isHandledFetchError(e)` before surfacing errors. Item photos render via `<ItemImage>` (`components/item-image.tsx`), which re-fetches a fresh signed URL once on image load failure (signed URLs expire after 1 hour).

**API route conventions:**
- All authenticated routes use `withAuth(handler, { key, max }?)` from `lib/api-guard.ts` — returns 401 if unauthenticated, 429 on rate limit (Postgres-backed fixed 60s window, per-user keys like `items:post:${userId}`)
- POST/PATCH routes validate with Zod schemas; validation failures return 400
- Item and profile photos are always served as signed URLs (1-hour expiry) via `attachSignedPhotoUrls()` — raw `photoUrl` from storage is never exposed in API responses
- Two recommendation endpoints: `GET /api/recommendation` (singular, single outfit + debug scores for `/today`) vs `GET /api/recommendations` (plural, paginated carousel)
- Failed item analysis can be retried via `POST /api/items/analyze` with `{ itemId }` in the body (only items with `analysisStatus: PENDING`)
- `GET /api/items?ids=a,b,c` narrows to specific items (used to mint fresh signed photo URLs)
- Try-on is async: `POST /api/tryon` creates a `TryOnJob` and returns `{ jobId }`; the client polls `GET /api/tryon?jobId=…` until `ready` (signed result URL) or `failed`

**Key `lib/` modules:**
- `lib/auth.ts` — `getCurrentUser()` (checks Supabase session, then a read-only `findUnique` of the Prisma user, upserting only if the row is missing); all API routes call this and return 401 if missing. `syncAuthUser` only syncs OAuth fields (`name`, `avatarUrl`, `email`) — never overwrites `displayName`, `uploadedAvatarUrl`, `aiTryOnPhotoUrl`.
- `lib/api-guard.ts` — `withAuth` wrapper (auth + optional rate limit)
- `lib/rate-limit.ts` — fixed-window rate limiter backed by the Postgres `RateLimit` table (atomic insert-or-increment, survives serverless cold starts); fails open on DB errors
- `lib/appConfig.ts` — runtime config/feature flags from the `AppConfig` table, 60s in-process cache, falls back to `process.env` if the DB is unreachable
- `lib/style-preferences.ts` — `QUIZ_QUESTIONS` array (5 questions); answers saved as `User.stylePreferences` (JSON) and influence recommendation scoring weights
- `lib/gemini.ts` — image classification + outfit re-ranking via Gemini text/JSON; gracefully degrades if unavailable
- `lib/gemini-tryon.ts` — try-on image generation via `gemini-2.5-flash-preview-image-generation`; multimodal request (try-on photo + clothing images + prompt); returns `{ imageBase64, mimeType }` or throws `TryOnApiError`
- `lib/openai-tryon.ts` — try-on image generation via OpenAI `gpt-image-2` (`/v1/images/edits`); same multimodal pattern as Gemini (user photo + clothing images); uses `openai` npm SDK + `toFile()` helper
- `lib/tryon-prompt.ts` — prompt builders for try-on providers: `buildTryOnPrompt()` / `buildOpenAITryOnPrompt()` (multimodal, Gemini + OpenAI) and `buildFluxTryOnPrompt()` (text-only)
- `lib/tryon-job.ts` / `lib/tryon-trigger.ts` — background try-on processing: trigger schedules `processTryOnJob()` via `next/server`'s `after()`; results are stored in Supabase Storage and served as signed URLs
- `lib/style-dna.ts` / `lib/style-dna-prompt.ts` — Style DNA generation (`generateStyleDnaForUser()`, `getStyleDnaStatus()`); regeneration has a DB-backed 24h cooldown (`User.lastDnaRegenAt`)
- `lib/recommendation.ts` — deterministic outfit scoring (weather 45%, color 20%, style 15%, formality 10%, pattern 5%, warmth 5%)
- `lib/aiRecommendation.ts` — optional Gemini re-ranking on top of deterministic scores
- `lib/env.ts` — centralized env-var getters + `validateEnv()`; called once at boot from `instrumentation.ts` so misconfigured deploys fail at start with the full list of missing vars. Read env through these getters, not `process.env`. `lib/supabase/env.ts` re-exports the Supabase getters for back-compat.
- `lib/prisma.ts` — singleton Prisma client with `@prisma/adapter-pg`
- `lib/supabase/` — server, browser, and admin Supabase clients (SSR via `@supabase/ssr`)
- `lib/hooks/` — client hooks: `useApiFetch` (see fetch convention above), `useAuthUser` (Supabase auth state), `useGeolocation` (device coords with retry + eager prefetch), `useRecommendations` (`/today` outfit/location state machine)
- `lib/types/wardrobe.ts` — shared client-side shapes of API responses (`WardrobeItem`, `RecommendationOption`, `ProfileResponse`, …); import these instead of re-declaring per page
- `lib/item-media.ts` — Supabase Storage upload/delete/sign helpers for wardrobe item photos
- `lib/profile-media.ts` — Storage helpers for profile photos; avatar at `profiles/{userId}/avatar.{ext}`, try-on at `profiles/{userId}/tryon.{ext}`; `downloadStorageObject()` for server-side byte downloads
- `lib/openMeteo.ts` — weather data from Open-Meteo API

**Database (Prisma + Supabase Postgres):**
- `User` — synced from Supabase Auth on first login; extended with `displayName`, `uploadedAvatarUrl`, `aiTryOnPhotoUrl`, `aiTryOnPhotoMimeType` (user-controlled, never overwritten by OAuth sync)
- `Item` — wardrobe item with `kind` (TOP/BOTTOM/SHOE), attribute enums (colorFamily, pattern, styleProfile, formality, warmthLevel), and AI analysis fields (`analysisStatus`, `metadataSource`, etc.). Upload sets `analysisStatus` per path: `READY` (AI classification succeeded, or manual with all attributes), `SKIPPED` (manual with unknown attributes), `PENDING` (AI attempted but failed — retryable via the analyze endpoint). Only `READY` items enter recommendations. Key enums: `AnalysisStatus` (PENDING/READY/FAILED/SKIPPED), `MetadataSource` (MANUAL/AI/MIXED)
- `OutfitHistory` — records of outfits worn; 7-day lookback used to penalize recently-repeated combinations. Item ids are optional FKs to `Item` (`onDelete: SetNull` — deleting an item keeps the history row with a null id), with a unique constraint on `(userId, date, topItemId, bottomItemId, shoeItemId)` for idempotent logging
- `TryOnJob` — async try-on generation jobs (PENDING/RUNNING/READY/FAILED) polled by the client
- `StyleDNA` — generated style profile per user
- `AppConfig` / `RateLimit` — runtime feature flags and shared rate-limit windows (both survive serverless cold starts)

**Auth:** Supabase SSR PKCE OAuth (Google). Cookie-based sessions. OAuth metadata is synced into Prisma at `/auth/callback`; `getCurrentUser()` only reads, falling back to an upsert when the user row doesn't exist yet.

**AI features** (all optional; flags are read from the `AppConfig` table at runtime, falling back to env vars):
- `ENABLE_AI_CLASSIFICATION` — runs Gemini on uploaded photos to populate item attributes; uploads still succeed if this fails
- `ENABLE_AI_RECOMMENDER` — re-ranks deterministic outfit candidates with Gemini before returning results
- `ENABLE_AI_TRYON` — generates a try-on image via background job using the selected provider (`TRYON_PROVIDER`); Gemini and OpenAI are multimodal (require user's AI try-on photo); FLUX is text-only; the client falls back to normal recommendation display if the job fails or times out

## Environment variables

```env
DATABASE_URL=           # Prisma connection (pooled)
DIRECT_URL=             # Direct connection (migrations)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=wardrobe
NEXT_PUBLIC_APP_URL=http://localhost:3000
GEMINI_API_KEY=
GEMINI_CLASSIFIER_MODEL=gemini-2.5-flash-lite
GEMINI_RECOMMENDER_MODEL=gemini-2.5-flash-lite
ENABLE_AI_CLASSIFICATION=true
ENABLE_AI_RECOMMENDER=true
ENABLE_AI_TRYON=true
TRYON_PROVIDER=gemini        # "gemini" (default), "flux", or "openai"
GEMINI_TRYON_MODEL=gemini-2.5-flash-image
HF_TOKEN=                    # required when TRYON_PROVIDER=flux
OPENAI_API_KEY=              # required when TRYON_PROVIDER=openai
OPENAI_TRYON_MODEL=gpt-image-2  # default; override to pin a snapshot
```

Configure Google OAuth in Supabase with redirect URL `http://localhost:3000/auth/callback`.
