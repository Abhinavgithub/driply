import type { User as SupabaseUser } from "@supabase/supabase-js";

import { prisma } from "@/lib/prisma";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const MAX_METADATA_NAME_LENGTH = 120;
const MAX_AVATAR_URL_LENGTH = 2048;

function sanitizeAvatarUrl(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_AVATAR_URL_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  // Only http(s) image URLs — blocks `javascript:`/`data:` persisted-XSS
  // payloads via user_metadata (P1-8). Rendered later as <img src>.
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return trimmed;
}

function readUserMetadata(user: SupabaseUser) {
  const metadata = user.user_metadata;
  const rawName =
    typeof metadata?.full_name === "string"
      ? metadata.full_name
      : typeof metadata?.name === "string"
        ? metadata.name
        : null;
  const name = rawName?.trim().slice(0, MAX_METADATA_NAME_LENGTH) || null;
  const rawAvatarUrl =
    typeof metadata?.avatar_url === "string"
      ? metadata.avatar_url
      : typeof metadata?.picture === "string"
        ? metadata.picture
        : null;

  return { name, avatarUrl: sanitizeAvatarUrl(rawAvatarUrl) };
}

export async function syncAuthUser(user: SupabaseUser) {
  const profile = readUserMetadata(user);

  return prisma.user.upsert({
    where: { id: user.id },
    update: {
      email: user.email ?? null,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
    },
    create: {
      id: user.id,
      email: user.email ?? null,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
    },
  });
}

export async function syncAuthUserWithCreationFlag(user: SupabaseUser) {
  const existing = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true } });
  const appUser = await syncAuthUser(user);
  return { appUser, wasCreated: !existing };
}

export async function getCurrentUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  // Read-only on the hot path: OAuth metadata is synced at /auth/callback.
  // Upsert only when the row is missing (e.g. password sign-ins that never
  // pass through the callback).
  const appUser =
    (await prisma.user.findUnique({ where: { id: user.id } })) ?? (await syncAuthUser(user));
  return { authUser: user, appUser };
}
