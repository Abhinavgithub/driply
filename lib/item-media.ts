import type { Item } from "@prisma/client";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseStorageBucket } from "@/lib/supabase/env";

type ItemWithPath = Pick<Item, "photoUrl">;

export async function attachSignedPhotoUrls<T extends ItemWithPath>(items: T[]): Promise<T[]> {
  if (!items.length) return items;

  const uniquePaths = [...new Set(items.map((item) => item.photoUrl).filter(Boolean))];
  if (!uniquePaths.length) return items;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from(getSupabaseStorageBucket())
    .createSignedUrls(uniquePaths, 60 * 60);

  if (error || !data) {
    return items.map((item) => ({ ...item, photoUrl: "" }));
  }

  const signedUrlByPath = new Map<string, string>();
  for (const entry of data) {
    if (entry.path && entry.signedUrl) {
      signedUrlByPath.set(entry.path, entry.signedUrl);
    }
  }

  return items.map((item) => ({
    ...item,
    photoUrl: signedUrlByPath.get(item.photoUrl) ?? "",
  }));
}

export async function uploadWardrobePhoto(args: {
  userId: string;
  itemId: string;
  bytes: Buffer;
  extension: string;
  contentType: string;
}) {
  const { userId, itemId, bytes, extension, contentType } = args;
  const path = `${userId}/${itemId}.${extension}`;
  const supabase = getSupabaseAdminClient();

  const { error } = await supabase.storage.from(getSupabaseStorageBucket()).upload(path, bytes, {
    contentType,
    upsert: false,
  });

  if (error) {
    throw new Error(error.message);
  }

  return path;
}

export async function deleteWardrobePhoto(photoPath: string) {
  if (!photoPath) return;

  const supabase = getSupabaseAdminClient();
  await supabase.storage.from(getSupabaseStorageBucket()).remove([photoPath]);
}
