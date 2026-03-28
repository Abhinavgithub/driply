# Driply

Driply is a wardrobe assistant that recommends outfits from a user’s wardrobe based on weather and garment attributes.

## Stack

- Next.js 16
- Supabase Auth (Google)
- Supabase Postgres
- Supabase Storage
- Prisma

## Environment

Create `.env` with:

```env
DATABASE_URL="postgresql://postgres:postgres@db.example.supabase.co:5432/postgres"
DIRECT_URL="postgresql://postgres:postgres@db.example.supabase.co:5432/postgres"
NEXT_PUBLIC_SUPABASE_URL="https://example.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="replace-with-supabase-anon-key"
SUPABASE_SERVICE_ROLE_KEY="replace-with-supabase-service-role-key"
SUPABASE_STORAGE_BUCKET="wardrobe"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

## Supabase setup

Configure Google OAuth in Supabase and set the local redirect URL to:

```text
http://localhost:3000/auth/callback
```

## Local development

```bash
npx prisma generate
npx prisma migrate dev
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).
