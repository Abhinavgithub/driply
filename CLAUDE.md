# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev        # Start dev server (webpack, localhost:3000)
npm run build      # Production build
npm run lint       # ESLint
npx prisma migrate dev   # Run pending migrations
npx prisma generate      # Regenerate Prisma client after schema changes
npx prisma studio        # Browse database
```

No test suite is configured.

## Architecture

Driply is a wardrobe assistant: users upload clothing photos, AI classifies them, and the app recommends daily outfits based on weather.

**App Router layout** (`app/`):
- `/today` — outfit recommendations (weather-aware) + AI try-on preview
- `/library` — wardrobe item browser
- `/profile` — display name, profile picture (avatar), and AI try-on photo upload
- `/sign-in`, `/sign-up`, `/auth/callback` — auth flow
- `app/api/` — all API routes (items, recommendations, weather, outfits, location-search, profile, tryon)

**Key `lib/` modules:**
- `lib/auth.ts` — `getCurrentUser()` (checks Supabase session + syncs Prisma user); all API routes call this and return 401 if missing. `syncAuthUser` only syncs OAuth fields (`name`, `avatarUrl`, `email`) — never overwrites `displayName`, `uploadedAvatarUrl`, `aiTryOnPhotoUrl`.
- `lib/gemini.ts` — image classification + outfit re-ranking via Gemini text/JSON; gracefully degrades if unavailable
- `lib/gemini-tryon.ts` — try-on image generation via `gemini-2.5-flash-preview-image-generation`; multimodal request (try-on photo + clothing images + prompt); returns `{ imageBase64, mimeType }` or throws `TryOnApiError`
- `lib/tryon-prompt.ts` — `buildTryOnPrompt()` utility; takes item metadata and displayName, returns the Gemini image generation prompt string
- `lib/recommendation.ts` — deterministic outfit scoring (weather 45%, color 20%, style 15%, formality 10%, pattern 5%, warmth 5%)
- `lib/aiRecommendation.ts` — optional Gemini re-ranking on top of deterministic scores
- `lib/prisma.ts` — singleton Prisma client with `@prisma/adapter-pg`
- `lib/supabase/` — server, browser, and admin Supabase clients (SSR via `@supabase/ssr`)
- `lib/item-media.ts` — Supabase Storage upload/delete/sign helpers for wardrobe item photos
- `lib/profile-media.ts` — Storage helpers for profile photos; avatar at `profiles/{userId}/avatar.{ext}`, try-on at `profiles/{userId}/tryon.{ext}`; `downloadStorageObject()` for server-side byte downloads
- `lib/openMeteo.ts` — weather data from Open-Meteo API

**Database (Prisma + Supabase Postgres):**
- `User` — synced from Supabase Auth on first login; extended with `displayName`, `uploadedAvatarUrl`, `aiTryOnPhotoUrl`, `aiTryOnPhotoMimeType` (user-controlled, never overwritten by OAuth sync)
- `Item` — wardrobe item with `kind` (TOP/BOTTOM/SHOE), attribute enums (colorFamily, pattern, styleProfile, formality, warmthLevel), and AI analysis fields (`analysisStatus`, `metadataSource`, etc.)
- `OutfitHistory` — records of outfits worn; used to penalize recently-repeated combinations

**Auth:** Supabase SSR PKCE OAuth (Google). Cookie-based sessions. `syncAuthUser()` upserts the user into Prisma on every `getCurrentUser()` call.

**AI features** (all optional, toggled by env vars):
- `ENABLE_AI_CLASSIFICATION` — runs Gemini on uploaded photos to populate item attributes; uploads still succeed if this fails
- `ENABLE_AI_RECOMMENDER` — re-ranks deterministic outfit candidates with Gemini before returning results
- `ENABLE_AI_TRYON` — generates a try-on image via `gemini-2.5-flash-preview-image-generation` using the user's AI try-on photo + item photos; silently falls back to normal recommendation display on any failure

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
TRYON_PROVIDER=gemini        # "gemini" (default) or "flux"
GEMINI_TRYON_MODEL=gemini-2.5-flash-image
HF_TOKEN=                    # required when TRYON_PROVIDER=flux
```

Configure Google OAuth in Supabase with redirect URL `http://localhost:3000/auth/callback`.
