# Driply

A wardrobe assistant that recommends daily outfits based on the weather and your personal style. Upload your clothing, let AI classify and describe each piece, then get a weather-aware outfit suggestion each morning — complete with a photorealistic try-on preview.

## Features

- Upload clothing photos — AI classifies kind, subtype, color, pattern, style, formality, and warmth automatically
- Weather-aware outfit recommendations with a transparent scoring breakdown
- Personalised scoring — a 5-question style quiz at onboarding adjusts recommendation weights to match your dress code, lifestyle, priorities, color palette, and temperature sensitivity
- AI outfit re-ranking — Gemini selects the best candidate and explains why
- AI try-on preview — see yourself wearing the recommended outfit (Gemini multimodal, OpenAI gpt-image-2, or FLUX text-to-image)
- Outfit log — one-tap "Mark as worn" with 5-second undo; worn combinations are deprioritised for 7 days
- Tappable week history — tap any worn day to see the 3 outfit photos from that day
- Guided onboarding — style quiz → wardrobe prompt → try-on photo upload
- Time-aware home page — greeting and mood theme adapt to weather and time of day
- Mobile-first UI — bottom tab navigation, responsive layouts, hamburger menu on landing page
- Manual attribute overrides and per-item re-analysis for items stuck in pending
- Collapsible wardrobe library organised by category (Tops / Bottoms / Shoes)
- Google OAuth, email/password sign-in, forgot password / reset password flow

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2 (App Router, SSR) |
| Database | PostgreSQL via Supabase + Prisma 7 (`@prisma/adapter-pg`) |
| Auth | Supabase Auth — Google OAuth + email/password (PKCE, SSR cookies) |
| Storage | Supabase Storage |
| AI | Google Gemini API; optional OpenAI gpt-image-2 or HuggingFace FLUX for try-on |
| Styling | Tailwind CSS 4 + CSS variables |
| Validation | Zod 4 |

## AI Features

All three AI features are independently toggled and degrade gracefully when disabled or unavailable.

### Item Classification (`ENABLE_AI_CLASSIFICATION`)

Analyses uploaded clothing photos via Gemini to infer kind (TOP / BOTTOM / SHOE), subtype (e.g. T-Shirt, Jeans, Sneaker), and five attributes: color family, pattern, style profile, formality, and warmth level.

- Retries automatically on rate-limit (800 ms then 2 s backoff)
- If classification still fails, the item is saved as `PENDING` — the photo is kept and re-analysis can be triggered from the library
- Model: `GEMINI_CLASSIFIER_MODEL` (default: `gemini-2.5-flash-lite`)
- Fallback: item is marked `SKIPPED` if the flag is off; user can enter attributes manually

### Outfit Re-Ranking (`ENABLE_AI_RECOMMENDER`)

The deterministic engine scores every top × bottom × shoe combination. Base weights:

| Signal | Default weight |
|---|---|
| Weather match | 45% |
| Color harmony | 20% |
| Style consistency | 15% |
| Formality match | 10% |
| Pattern balance | 5% |
| Warmth appropriateness | 5% |

Weights are **personalised** at request time using the user's style quiz answers:

- Dress code preference shifts the formality weight (5% → 20%)
- Priority preference shifts the style weight (8% → 22%)
- Remaining weights are scaled proportionally so the total always equals 1.0
- Temperature sensitivity shifts the expected warmth band (cold/warm bias)

The top candidates are then optionally passed to Gemini, which selects the best outfit and returns a plain-English explanation.

- Model: `GEMINI_RECOMMENDER_MODEL` (default: `gemini-2.5-flash-lite`)
- Times out after 4.5 s and falls back to the deterministic ranking

### Try-On Preview (`ENABLE_AI_TRYON`)

Generates a photorealistic image of the user wearing the recommended outfit. Three providers:

- **`gemini`** (default): multimodal image generation — takes the user's full-body reference photo plus the three clothing item photos and composites them. Requires the user to upload a try-on photo in their profile.
- **`openai`**: OpenAI `gpt-image-2` via `/v1/images/edits` — same multimodal approach as Gemini (reference photo + clothing item images). Requires `OPENAI_API_KEY` and a try-on photo in profile.
- **`flux`**: HuggingFace FLUX.1-schnell text-to-image — purely synthetic, no reference photo needed. Requires `HF_TOKEN`.

Rate-limited to 10 requests per minute per user. Silently skipped if no try-on photo is on file.

## Project Structure

```
app/
  (auth)/              sign-in, sign-up, auth callback
  today/               outfit recommendation home page
  library/             wardrobe item management
  profile/             display name, avatar, style quiz, try-on photo
  onboarding/          guided setup wizard (style quiz → wardrobe → try-on)
  api/                 all API routes
lib/
  gemini.ts            image classification + outfit re-ranking
  gemini-tryon.ts      try-on image generation (Gemini)
  openai-tryon.ts      try-on image generation (OpenAI gpt-image-2)
  flux-tryon.ts        try-on image generation (FLUX)
  tryon-prompt.ts      prompt builders for all try-on providers
  recommendation.ts    deterministic outfit scoring + personalised weights
  aiRecommendation.ts  Gemini re-ranking wrapper
  style-preferences.ts quiz config, StylePreferences type, validation, weight logic
  auth.ts              getCurrentUser() + Prisma user sync
  item-media.ts        Supabase Storage helpers (wardrobe photos)
  profile-media.ts     Supabase Storage helpers (profile + try-on photos)
  rate-limit.ts        in-memory rate limiter
  file-magic.ts        image MIME validation via magic bytes
  date-utils.ts        server date key + UTC conversion helpers
prisma/
  schema.prisma        User, Item, OutfitHistory, AppConfig models
```

## Database Models

**User** — synced from Supabase Auth on first login. Stores `displayName`, `uploadedAvatarUrl`, and `aiTryOnPhotoUrl` separately from the OAuth-synced fields so manual edits are never overwritten. Also stores `stylePreferences` (JSON) — the user's quiz answers used to personalise recommendation weights.

**Item** — one clothing item. Key fields: `kind` (TOP/BOTTOM/SHOE), `subtype`, five attribute enums (`colorFamily`, `pattern`, `styleProfile`, `formality`, `warmthLevel`), `analysisStatus` (PENDING/READY/FAILED/SKIPPED), `photoUrl` (Supabase Storage path).

**OutfitHistory** — one worn outfit per day. Stores `topItemId`, `bottomItemId`, `shoeItemId`, and `date` (UTC midnight). Used to penalise recently repeated combinations (7-day lookback). Supports undo via the `DELETE /api/outfits` endpoint.

**AppConfig** — key/value store for runtime feature flags (`ENABLE_AI_CLASSIFICATION`, `ENABLE_AI_RECOMMENDER`, `ENABLE_AI_TRYON`, `TRYON_PROVIDER`). Values in the DB override environment variables, allowing flag changes without redeployment.

## Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project (free tier works)
- Google Cloud project with the Gemini API enabled and an API key
- Google OAuth configured as a provider in Supabase Auth

## Environment Variables

Create a `.env` file at the project root:

```env
# Database
DATABASE_URL=          # Supabase pooled connection (PgBouncer, port 6543)
DIRECT_URL=            # Direct Postgres connection for migrations (port 5432)

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=wardrobe
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Gemini
GEMINI_API_KEY=
GEMINI_CLASSIFIER_MODEL=gemini-2.5-flash-lite
GEMINI_RECOMMENDER_MODEL=gemini-2.5-flash-lite
GEMINI_TRYON_MODEL=gemini-2.5-flash-image

# Feature flags — set to "true" to enable
ENABLE_AI_CLASSIFICATION=true
ENABLE_AI_RECOMMENDER=true
ENABLE_AI_TRYON=true

# Try-on provider: "gemini" (default), "openai", or "flux"
TRYON_PROVIDER=gemini
HF_TOKEN=              # Required when TRYON_PROVIDER=flux
OPENAI_API_KEY=        # Required when TRYON_PROVIDER=openai
OPENAI_TRYON_MODEL=gpt-image-2  # Default; override to pin a snapshot
```

## Supabase Setup

1. Create a new Supabase project and copy the URL, anon key, and service role key into `.env`.
2. Enable Google (or email) as an auth provider under **Authentication → Providers**.
3. Add `{NEXT_PUBLIC_APP_URL}/auth/callback` as a redirect URL under **Authentication → URL Configuration**.
4. Create a private storage bucket named `wardrobe` (no public access needed — the server generates signed URLs).

## Local Development

```bash
npm install
npx prisma migrate dev   # apply pending migrations
npx prisma generate      # regenerate the Prisma client
npm run dev              # start the dev server on http://localhost:3000
```

Other useful commands:

```bash
npm run build            # production build
npm run lint             # ESLint
npx prisma studio        # visual database browser
```

## Deployment

Driply deploys to Netlify or Vercel with no additional configuration files. Set all environment variables in your hosting platform's dashboard. The `postinstall` script in `package.json` runs `prisma generate` automatically on each deploy.
