import type { User as SupabaseUser } from "@supabase/supabase-js";

import { prisma } from "@/lib/prisma";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function readUserMetadata(user: SupabaseUser) {
  const metadata = user.user_metadata;
  const name =
    typeof metadata?.full_name === "string"
      ? metadata.full_name
      : typeof metadata?.name === "string"
        ? metadata.name
        : null;
  const avatarUrl =
    typeof metadata?.avatar_url === "string"
      ? metadata.avatar_url
      : typeof metadata?.picture === "string"
        ? metadata.picture
        : null;

  return { name, avatarUrl };
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

export async function getCurrentUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  const appUser = await syncAuthUser(user);
  return { authUser: user, appUser };
}
