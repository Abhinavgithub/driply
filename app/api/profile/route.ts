import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  deleteProfilePhoto,
  getSignedProfilePhotoUrl,
  uploadProfilePhoto,
} from "@/lib/profile-media";

const MAX_PROFILE_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB

const DisplayNameSchema = z.string().trim().min(1).max(80);

function mimeToExt(mimeType: string): string | null {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return null;
  }
}

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: currentUser.appUser.id },
    select: {
      displayName: true,
      uploadedAvatarUrl: true,
      aiTryOnPhotoUrl: true,
      aiTryOnPhotoMimeType: true,
    },
  });

  const [avatarSignedUrl, tryOnSignedUrl] = await Promise.all([
    getSignedProfilePhotoUrl(user?.uploadedAvatarUrl),
    getSignedProfilePhotoUrl(user?.aiTryOnPhotoUrl),
  ]);

  return NextResponse.json({
    displayName: user?.displayName ?? null,
    avatarUrl: avatarSignedUrl,
    aiTryOnPhotoUrl: tryOnSignedUrl,
    hasTryOnPhoto: Boolean(user?.aiTryOnPhotoUrl),
  });
}

export async function PATCH(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const userId = currentUser.appUser.id;
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const rawDisplayName = formData.get("displayName");
  const rawAvatar = formData.get("avatar");
  const rawTryOnPhoto = formData.get("aiTryOnPhoto");

  // Validate display name if provided
  let displayName: string | undefined;
  if (typeof rawDisplayName === "string" && rawDisplayName.trim()) {
    const parsed = DisplayNameSchema.safeParse(rawDisplayName);
    if (!parsed.success) {
      return NextResponse.json({ error: "Display name must be 1–80 characters." }, { status: 400 });
    }
    displayName = parsed.data;
  }

  // Fetch current user record for existing paths
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { uploadedAvatarUrl: true, aiTryOnPhotoUrl: true },
  });

  const updates: Record<string, unknown> = {};
  if (displayName !== undefined) updates.displayName = displayName;

  // Handle avatar upload
  if (rawAvatar instanceof Blob && rawAvatar.size > 0) {
    if (rawAvatar.size > MAX_PROFILE_PHOTO_BYTES) {
      return NextResponse.json({ error: "Avatar exceeds 10 MB limit." }, { status: 400 });
    }
    const ext = mimeToExt(rawAvatar.type);
    if (!ext) {
      return NextResponse.json(
        { error: `Unsupported avatar type: ${rawAvatar.type || "unknown"}` },
        { status: 400 },
      );
    }

    const bytes = Buffer.from(await rawAvatar.arrayBuffer());
    const path = await uploadProfilePhoto({ userId, kind: "avatar", bytes, extension: ext, contentType: rawAvatar.type });
    updates.uploadedAvatarUrl = path;

    // Delete previous avatar only after successful upload of new one
    if (existingUser?.uploadedAvatarUrl && existingUser.uploadedAvatarUrl !== path) {
      await deleteProfilePhoto(existingUser.uploadedAvatarUrl);
    }
  }

  // Handle AI try-on photo upload
  if (rawTryOnPhoto instanceof Blob && rawTryOnPhoto.size > 0) {
    if (rawTryOnPhoto.size > MAX_PROFILE_PHOTO_BYTES) {
      return NextResponse.json({ error: "Try-on photo exceeds 10 MB limit." }, { status: 400 });
    }
    const ext = mimeToExt(rawTryOnPhoto.type);
    if (!ext) {
      return NextResponse.json(
        { error: `Unsupported try-on photo type: ${rawTryOnPhoto.type || "unknown"}` },
        { status: 400 },
      );
    }

    const bytes = Buffer.from(await rawTryOnPhoto.arrayBuffer());
    const path = await uploadProfilePhoto({
      userId,
      kind: "tryon",
      bytes,
      extension: ext,
      contentType: rawTryOnPhoto.type,
    });
    updates.aiTryOnPhotoUrl = path;
    updates.aiTryOnPhotoMimeType = rawTryOnPhoto.type;

    if (existingUser?.aiTryOnPhotoUrl && existingUser.aiTryOnPhotoUrl !== path) {
      await deleteProfilePhoto(existingUser.aiTryOnPhotoUrl);
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No changes provided." }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: updates,
    select: {
      displayName: true,
      uploadedAvatarUrl: true,
      aiTryOnPhotoUrl: true,
    },
  });

  const [avatarSignedUrl, tryOnSignedUrl] = await Promise.all([
    getSignedProfilePhotoUrl(updated.uploadedAvatarUrl),
    getSignedProfilePhotoUrl(updated.aiTryOnPhotoUrl),
  ]);

  return NextResponse.json({
    ok: true,
    displayName: updated.displayName ?? null,
    avatarUrl: avatarSignedUrl,
    aiTryOnPhotoUrl: tryOnSignedUrl,
    hasTryOnPhoto: Boolean(updated.aiTryOnPhotoUrl),
  });
}
