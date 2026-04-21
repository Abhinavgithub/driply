import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseStorageBucket } from "@/lib/supabase/env";

export type ProfilePhotoKind = "avatar" | "tryon";

function profilePhotoPath(userId: string, kind: ProfilePhotoKind, extension: string) {
  return `profiles/${userId}/${kind}.${extension}`;
}

export async function uploadProfilePhoto(args: {
  userId: string;
  kind: ProfilePhotoKind;
  bytes: Buffer;
  extension: string;
  contentType: string;
}): Promise<string> {
  const { userId, kind, bytes, extension, contentType } = args;
  const path = profilePhotoPath(userId, kind, extension);
  const supabase = getSupabaseAdminClient();

  const { error } = await supabase.storage.from(getSupabaseStorageBucket()).upload(path, bytes, {
    contentType,
    upsert: true,
  });

  if (error) throw new Error(error.message);
  return path;
}

export async function deleteProfilePhoto(path: string | null | undefined) {
  if (!path) return;
  const supabase = getSupabaseAdminClient();
  await supabase.storage.from(getSupabaseStorageBucket()).remove([path]);
}

export async function getSignedProfilePhotoUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from(getSupabaseStorageBucket())
    .createSignedUrl(path, 60 * 60);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024; // 20 MB

export async function downloadStorageObject(path: string | null | undefined): Promise<Buffer | null> {
  if (!path) return null;
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.storage.from(getSupabaseStorageBucket()).download(path);
  if (error || !data) return null;
  if (data.size > MAX_DOWNLOAD_BYTES) throw new Error("Storage object exceeds maximum download size.");
  return Buffer.from(await data.arrayBuffer());
}
