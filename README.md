# Driply

A wardrobe assistant that recommends daily outfits based on the weather and your personal style. Upload your clothing, let AI classify and describe each piece, then get a weather-aware outfit suggestion each morning — complete with a photorealistic try-on preview.

## Features

- Upload clothing photos — AI classifies kind, subtype, color, pattern, style, formality, and warmth automatically
- Weather-aware outfit recommendations with a transparent scoring breakdown
- AI outfit re-ranking — Gemini selects the best candidate and explains why
- AI try-on preview — see yourself wearing the recommended outfit (Gemini multimodal or FLUX text-to-image)
- Outfit history tracking — recently worn combinations are deprioritised
- Manual attribute overrides and per-item re-analysis for items stuck in pending
- Collapsible wardrobe library organised by category (Tops / Bottoms / Shoes)
- Google OAuth and email/password sign-in

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2 (App Router, SSR) |
| Database | PostgreSQL via Supabase + Prisma 7 (`@prisma/adapter-pg`) |
| Auth | Supabase Auth — Google OAuth + email/password (PKCE, SSR cookies) |
| Storage | Supabase Storage |
| AI | Google Gemini API; optional HuggingFace FLUX fallback for try-on |
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

The deterministic engine scores every top × bottom × shoe combination:

| Signal | Weight |
|---|---|
| Weather match | 45% |
| Color harmony | 20% |
| Style consistency | 15% |
| Formality match | 10% |
| Pattern balance | 5% |
| Warmth appropriateness | 5% |

The top candidates are then optionally passed to Gemini, which selects the best outfit and returns a plain-English explanation.

- Model: `GEMINI_RECOMMENDER_MODEL` (default: `gemini-2.5-flash-lite`)
- Times out after 4.5 s and falls back to the deterministic ranking

### Try-On Preview (`ENABLE_AI_TRYON`)

Generates a photorealistic image of the user wearing the recommended outfit. Two providers:

- **`gemini`** (default): multimodal image generation — takes the user's full-body reference photo plus the three clothing item photos and composites them. Requires the user to upload a try-on photo in their profile.
- **`flux`**: HuggingFace FLUX.1-schnell text-to-image — purely synthetic, no reference photo needed. Requires `HF_TOKEN`.

Rate-limited to 10 requests per minute per user. Silently skipped if no try-on photo is on file.

## Project Structure

```
app/
  (auth)/            sign-in, sign-up, auth callback
  today/             outfit recommendation page
  library/           wardrobe item management
  profile/           display name, avatar, try-on photo upload
  api/               all API routes
lib/
  gemini.ts          image classification + outfit re-ranking
  gemini-tryon.ts    try-on image generation (Gemini)
  flux-tryon.ts      try-on image generation (FLUX)
  recommendation.ts  deterministic outfit scoring
  aiRecommendation.ts  Gemini re-ranking wrapper
  auth.ts            getCurrentUser() + Prisma user sync
  item-media.ts      Supabase Storage helpers (wardrobe photos)
  profile-media.ts   Supabase Storage helpers (profile photos)
  rate-limit.ts      in-memory rate limiter
  file-magic.ts      image MIME validation via magic bytes
  date-utils.ts      server date key + UTC conversion helpers
prisma/
  schema.prisma      User, Item, OutfitHistory models
```

## Database Models

**User** — synced from Supabase Auth on first login. Stores `displayName`, `uploadedAvatarUrl`, and `aiTryOnPhotoUrl` separately from the OAuth-synced fields so manual edits are never overwritten.

**Item** — one clothing item. Key fields: `kind` (TOP/BOTTOM/SHOE), `subtype`, five attribute enums (`colorFamily`, `pattern`, `styleProfile`, `formality`, `warmthLevel`), `analysisStatus` (PENDING/READY/FAILED/SKIPPED), `photoUrl` (Supabase Storage path).

**OutfitHistory** — one worn outfit per day. Stores `topItemId`, `bottomItemId`, `shoeItemId`, and `date` (UTC midnight). Used to penalise recently repeated combinations.

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

# Try-on provider: "gemini" (default) or "flux"
TRYON_PROVIDER=gemini
HF_TOKEN=              # Required when TRYON_PROVIDER=flux
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
