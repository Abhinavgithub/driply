import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { generateTryOnImage, isAiTryOnEnabled, normalizeTryOnErrorCode } from "@/lib/gemini-tryon";
import { generateFluxTryOnImage, getTryOnProvider, isFluxTryOnEnabled } from "@/lib/flux-tryon";
import { prisma } from "@/lib/prisma";
import { downloadStorageObject } from "@/lib/profile-media";
import { buildFluxTryOnPrompt, buildTryOnPrompt } from "@/lib/tryon-prompt";

const RequestSchema = z.object({
  topItemId: z.string().min(1),
  bottomItemId: z.string().min(1),
  shoeItemId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const provider = getTryOnProvider();

  const enabled = provider === "flux" ? isFluxTryOnEnabled() : isAiTryOnEnabled();
  if (!enabled) {
    return NextResponse.json({ ok: false, reason: "tryon_disabled" });
  }

  const json = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Expected topItemId, bottomItemId, shoeItemId." }, { status: 400 });
  }

  const userId = currentUser.appUser.id;

  const userRecord = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true, aiTryOnPhotoUrl: true },
  });

  // FLUX is text-only — no reference photo needed. Gemini requires it.
  if (provider === "gemini" && !userRecord?.aiTryOnPhotoUrl) {
    return NextResponse.json({ ok: false, reason: "no_try_on_photo" });
  }

  const { topItemId, bottomItemId, shoeItemId } = parsed.data;
  const items = await prisma.item.findMany({
    where: {
      id: { in: [topItemId, bottomItemId, shoeItemId] },
      userId,
    },
    select: {
      id: true,
      kind: true,
      subtype: true,
      colorFamily: true,
      visualSummary: true,
      photoUrl: true,
    },
  });

  if (items.length !== 3) {
    return NextResponse.json({ error: "One or more items not found." }, { status: 404 });
  }

  const top = items.find((i) => i.id === topItemId);
  const bottom = items.find((i) => i.id === bottomItemId);
  const shoe = items.find((i) => i.id === shoeItemId);

  if (!top || !bottom || !shoe) {
    return NextResponse.json({ error: "Item mismatch." }, { status: 400 });
  }

  const itemMeta = [
    { kind: top.kind, subtype: top.subtype, colorFamily: top.colorFamily, visualSummary: top.visualSummary },
    { kind: bottom.kind, subtype: bottom.subtype, colorFamily: bottom.colorFamily, visualSummary: bottom.visualSummary },
    { kind: shoe.kind, subtype: shoe.subtype, colorFamily: shoe.colorFamily, visualSummary: shoe.visualSummary },
  ] as const;

  try {
    if (provider === "flux") {
      const prompt = buildFluxTryOnPrompt({ items: itemMeta });
      const result = await generateFluxTryOnImage({ prompt });
      return NextResponse.json({ ok: true, imageBase64: result.imageBase64, mimeType: result.mimeType, provider: "flux" });
    }

    // Gemini — download reference photo + clothing images
    const [tryOnPhotoBytes, topBytes, bottomBytes, shoeBytes] = await Promise.all([
      downloadStorageObject(userRecord!.aiTryOnPhotoUrl),
      downloadStorageObject(top.photoUrl),
      downloadStorageObject(bottom.photoUrl),
      downloadStorageObject(shoe.photoUrl),
    ]);

    if (!tryOnPhotoBytes) {
      return NextResponse.json({ ok: false, reason: "try_on_photo_unavailable" });
    }

    const clothingImages = [
      topBytes ? { bytes: topBytes } : null,
      bottomBytes ? { bytes: bottomBytes } : null,
      shoeBytes ? { bytes: shoeBytes } : null,
    ].filter((x): x is { bytes: Buffer } => x !== null);

    if (clothingImages.length === 0) {
      return NextResponse.json({ ok: false, reason: "clothing_images_unavailable" });
    }

    const prompt = buildTryOnPrompt({ displayName: userRecord!.displayName, items: itemMeta });
    const result = await generateTryOnImage({ tryOnPhotoBytes, clothingImages, prompt });
    return NextResponse.json({ ok: true, imageBase64: result.imageBase64, mimeType: result.mimeType, provider: "gemini" });
  } catch (error) {
    const code = normalizeTryOnErrorCode(error);
    console.warn("[api/tryon] generation failed", { provider, code, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ ok: false, reason: "generation_failed", code });
  }
}
