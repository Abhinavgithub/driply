import { NextResponse } from "next/server";
import { z } from "zod";

import { withAuth } from "@/lib/api-guard";
import { validateImageBlob } from "@/lib/file-magic";
import { prisma } from "@/lib/prisma";
import { parseStylePreferences } from "@/lib/style-preferences";
import {
  deleteProfilePhoto,
  getSignedProfilePhotoUrl,
  uploadProfilePhoto,
} from "@/lib/profile-media";

const MAX_PROFILE_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB

const DisplayNameSchema = z.string().trim().min(1).max(80);

export const GET = withAuth(async (currentUser) => {
  const user = await prisma.user.findUnique({
    where: { id: currentUser.appUser.id },
    select: {
      displayName: true,
      uploadedAvatarUrl: true,
      aiTryOnPhotoUrl: true,
      aiTryOnPhotoMimeType: true,
      stylePreferences: true,
    },
  });

  const [avatarSignedUrl, tryOnSignedUrl] = await Promise.all([
    getSignedProfilePhotoUrl(user?.uploadedAvatarUrl),
    getSignedProfilePhotoUrl(user?.aiTryOnPhotoUrl),
  ]);

  return NextResponse.json({
    id: currentUser.appUser.id,
    displayName: user?.displayName ?? null,
    avatarUrl: avatarSignedUrl,
    aiTryOnPhotoUrl: tryOnSignedUrl,
    hasTryOnPhoto: Boolean(user?.aiTryOnPhotoUrl),
    stylePreferences: parseStylePreferences(user?.stylePreferences),
  });
});

export const PATCH = withAuth(
  async (currentUser, req) => {
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
    const rawStylePreferences = formData.get("stylePreferences");

    // Validate display name if provided
    let displayName: string | undefined;
    if (typeof rawDisplayName === "string" && rawDisplayName.trim()) {
      const parsed = DisplayNameSchema.safeParse(rawDisplayName);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Display name must be 1–80 characters." },
          { status: 400 },
        );
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
      const avatarResult = await validateImageBlob(rawAvatar, MAX_PROFILE_PHOTO_BYTES, "avatar");
      if (!avatarResult.ok) {
        return NextResponse.json({ error: avatarResult.error }, { status: 400 });
      }
      const { bytes, mime: avatarMime, ext } = avatarResult;

      const path = await uploadProfilePhoto({
        userId,
        kind: "avatar",
        bytes,
        extension: ext,
        contentType: avatarMime,
      });
      updates.uploadedAvatarUrl = path;

      // Delete previous avatar only after successful upload of new one
      if (existingUser?.uploadedAvatarUrl && existingUser.uploadedAvatarUrl !== path) {
        await deleteProfilePhoto(existingUser.uploadedAvatarUrl);
      }
    }

    // Handle AI try-on photo upload
    if (rawTryOnPhoto instanceof Blob && rawTryOnPhoto.size > 0) {
      const tryOnResult = await validateImageBlob(
        rawTryOnPhoto,
        MAX_PROFILE_PHOTO_BYTES,
        "try-on photo",
      );
      if (!tryOnResult.ok) {
        return NextResponse.json({ error: tryOnResult.error }, { status: 400 });
      }
      const { bytes, mime: tryOnMime, ext } = tryOnResult;

      const path = await uploadProfilePhoto({
        userId,
        kind: "tryon",
        bytes,
        extension: ext,
        contentType: tryOnMime,
      });
      updates.aiTryOnPhotoUrl = path;
      updates.aiTryOnPhotoMimeType = tryOnMime;

      if (existingUser?.aiTryOnPhotoUrl && existingUser.aiTryOnPhotoUrl !== path) {
        await deleteProfilePhoto(existingUser.aiTryOnPhotoUrl);
      }
    }

    // Handle style preferences
    if (typeof rawStylePreferences === "string") {
      if (rawStylePreferences.length > 10 * 1024) {
        return NextResponse.json(
          { error: "Style preferences payload too large." },
          { status: 413 },
        );
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawStylePreferences);
      } catch {
        return NextResponse.json({ error: "Invalid style preferences JSON." }, { status: 400 });
      }
      const validated = parseStylePreferences(parsed);
      if (!validated) {
        return NextResponse.json({ error: "Invalid style preferences." }, { status: 400 });
      }
      updates.stylePreferences = validated;
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
  },
  { key: (u) => `profile:patch:${u.appUser.id}`, max: 10 },
);
