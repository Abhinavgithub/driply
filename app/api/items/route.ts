import { z } from "zod";
import { NextResponse } from "next/server";

import { withAuth } from "@/lib/api-guard";
import { validateImageBlob } from "@/lib/file-magic";
import {
  buildFallbackVisualSummary,
  classifyWardrobeImage,
  getAiClassificationDisabledReason,
  getClassifierModel,
  getClassifierPromptVersion,
  getGeminiErrorCode,
  getGeminiErrorMessage,
  isAiClassificationEnabled,
} from "@/lib/gemini";
import { deleteWardrobePhoto, attachSignedPhotoUrls, uploadWardrobePhoto } from "@/lib/item-media";
import {
  getDefaultSubtypeForKind,
  hasUnknownAttributes,
  isValidSubtypeForKind,
  itemKindSchema,
  itemAttributePatchSchema,
  MAX_UPLOAD_PHOTOS,
  mergeItemAttributes,
  pickProvidedItemAttributes,
  type ItemKindValue,
  type ItemAttributeValues,
} from "@/lib/itemAttributes";
import { prisma } from "@/lib/prisma";

const DeleteBodySchema = z.object({
  itemId: z.string().min(1),
});
const UpdateBodySchema = z
  .object({
    itemId: z.string().min(1),
    kind: itemKindSchema.optional(),
    subtype: z.string().trim().min(1).optional(),
  })
  .extend(itemAttributePatchSchema.shape)
  .refine(
    (value) =>
      value.kind !== undefined ||
      value.subtype !== undefined ||
      value.colorFamily !== undefined ||
      value.pattern !== undefined ||
      value.styleProfile !== undefined ||
      value.formality !== undefined ||
      value.warmthLevel !== undefined,
    { message: "Expected at least one editable field." },
  );
const ITEM_ATTRIBUTE_KEYS = [
  "colorFamily",
  "pattern",
  "styleProfile",
  "formality",
  "warmthLevel",
] as const;

type UploadResolution = {
  kind: ItemKindValue;
  subtype: string;
  analysisStatus: "PENDING" | "READY" | "FAILED" | "SKIPPED";
  metadataSource: "MANUAL" | "AI" | "MIXED";
  visualSummary: string | null;
  analysisConfidence: number | null;
  analysisModel: string | null;
  analysisPromptVersion: string | null;
  analysisErrorCode: string | null;
  attributes: ItemAttributeValues;
};


function mergeUnknownAttributes(
  currentAttributes: ItemAttributeValues,
  aiAttributes: ItemAttributeValues,
): ItemAttributeValues {
  const next = { ...currentAttributes };

  for (const key of ITEM_ATTRIBUTE_KEYS) {
    if (next[key] === "UNKNOWN" && aiAttributes[key] !== "UNKNOWN") {
      switch (key) {
        case "colorFamily":
          next.colorFamily = aiAttributes.colorFamily;
          break;
        case "pattern":
          next.pattern = aiAttributes.pattern;
          break;
        case "styleProfile":
          next.styleProfile = aiAttributes.styleProfile;
          break;
        case "formality":
          next.formality = aiAttributes.formality;
          break;
        case "warmthLevel":
          next.warmthLevel = aiAttributes.warmthLevel;
          break;
      }
    }
  }

  return next;
}

function countAiFilledAttributes(
  currentAttributes: ItemAttributeValues,
  nextAttributes: ItemAttributeValues,
) {
  return ITEM_ATTRIBUTE_KEYS.filter(
    (key) => currentAttributes[key] === "UNKNOWN" && nextAttributes[key] !== "UNKNOWN",
  ).length;
}

function normalizeKindInput(rawKind: FormDataEntryValue | null) {
  if (typeof rawKind !== "string") return undefined;

  const normalized = rawKind.trim().toUpperCase();
  return itemKindSchema.safeParse(normalized).success ? (normalized as ItemKindValue) : undefined;
}

function normalizeSubtypeInput(rawSubtype: FormDataEntryValue | null) {
  if (typeof rawSubtype !== "string") return undefined;
  const trimmed = rawSubtype.trim().toLowerCase();
  return trimmed.length ? trimmed : undefined;
}

async function resolveUploadMetadata(args: {
  bytes: Buffer;
  manualKind?: ItemKindValue;
  manualSubtype?: string;
  manualAttributes: ItemAttributeValues;
}) {
  const { bytes, manualKind, manualSubtype, manualAttributes } = args;

  const needsAiForKind = !manualKind || !manualSubtype;
  const needsAiForAttributes = hasUnknownAttributes(manualAttributes);
  const shouldAttemptAi = await isAiClassificationEnabled() && (needsAiForKind || needsAiForAttributes);

  if (!shouldAttemptAi) {
    if (!manualKind) {
      console.info("[gemini:classification] skipped", {
        reason: (await getAiClassificationDisabledReason()) || "Missing manual kind/subtype and AI classification disabled",
        manualKind,
        manualSubtype,
      });
      throw new Error("AI could not infer kind and subtype. Add them in optional details or enable AI classification.");
    }

    // When kind is known but subtype isn't (e.g. onboarding), fall back to the
    // default subtype for that kind rather than throwing — AI would have inferred
    // it, but classification is disabled.
    const resolvedSubtype = manualSubtype ?? getDefaultSubtypeForKind(manualKind);

    return {
      kind: manualKind,
      subtype: resolvedSubtype,
      analysisStatus: hasUnknownAttributes(manualAttributes) ? "SKIPPED" : "READY",
      metadataSource: "MANUAL",
      visualSummary: buildFallbackVisualSummary({
        subtype: resolvedSubtype,
        attributes: manualAttributes,
      }),
      analysisConfidence: null,
      analysisModel: null,
      analysisPromptVersion: null,
      analysisErrorCode: null,
      attributes: manualAttributes,
    } satisfies UploadResolution;
  }

  try {
    const classification = await classifyWardrobeImage({
      imageBytes: bytes,
      manualKind: manualKind ?? null,
      manualSubtype: manualSubtype ?? null,
    });

    const resolvedKind = manualKind ?? classification.kind;
    const resolvedSubtype =
      manualSubtype && isValidSubtypeForKind(resolvedKind, manualSubtype)
        ? manualSubtype
        : classification.kind === resolvedKind && isValidSubtypeForKind(resolvedKind, classification.subtype)
          ? classification.subtype
          : null;

    if (!resolvedSubtype) {
      throw new Error("AI returned an invalid subtype for the resolved kind.");
    }

    const mergedAttributes = mergeUnknownAttributes(manualAttributes, classification);
    const aiFilledCount = countAiFilledAttributes(manualAttributes, mergedAttributes);
    const usedAiKindSubtype = !manualKind || !manualSubtype;
    const usedAiOutput =
      usedAiKindSubtype || aiFilledCount > 0 || Boolean(classification.visualSummary);
    const hasManualOverrides =
      Boolean(manualKind && manualSubtype) || Object.values(manualAttributes).some((value) => value !== "UNKNOWN");

    return {
      kind: resolvedKind,
      subtype: resolvedSubtype,
      analysisStatus: "READY",
      metadataSource: hasManualOverrides
        ? usedAiOutput
          ? "MIXED"
          : "MANUAL"
        : "AI",
      visualSummary:
        classification.visualSummary ||
        buildFallbackVisualSummary({
          subtype: resolvedSubtype,
          attributes: mergedAttributes,
        }),
      analysisConfidence: classification.confidence,
      analysisModel: classification.model,
      analysisPromptVersion: classification.promptVersion,
      analysisErrorCode: null,
      attributes: mergedAttributes,
    } satisfies UploadResolution;
  } catch (error) {
    console.info("[gemini:classification] failed", {
      reason: "Gemini item classification failed",
      code: getGeminiErrorCode(error),
      message: getGeminiErrorMessage(error),
      manualKind,
      manualSubtype,
    });

    if (!manualKind || !manualSubtype) {
      const pendingKind = "TOP" as const;
      return {
        kind: pendingKind,
        subtype: getDefaultSubtypeForKind(pendingKind),
        analysisStatus: "PENDING",
        metadataSource: "MANUAL",
        visualSummary: null,
        analysisConfidence: null,
        analysisModel: await getClassifierModel(),
        analysisPromptVersion: getClassifierPromptVersion(),
        analysisErrorCode: getGeminiErrorCode(error),
        attributes: manualAttributes,
      } satisfies UploadResolution;
    }

    return {
      kind: manualKind,
      subtype: manualSubtype,
      analysisStatus: "FAILED",
      metadataSource: "MANUAL",
      visualSummary: buildFallbackVisualSummary({
        subtype: manualSubtype,
        attributes: manualAttributes,
      }),
      analysisConfidence: null,
      analysisModel: await getClassifierModel(),
      analysisPromptVersion: getClassifierPromptVersion(),
      analysisErrorCode: getGeminiErrorCode(error),
      attributes: manualAttributes,
    } satisfies UploadResolution;
  }
}

export const GET = withAuth(async (user, req) => {
  // ?ids=a,b,c narrows the result — used to mint fresh signed photo URLs when
  // a long-lived page's URLs expire.
  const idsParam = new URL(req.url).searchParams.get("ids");
  const ids = idsParam
    ? [...new Set(idsParam.split(",").filter(Boolean))].slice(0, 50)
    : null;

  const items = await prisma.item.findMany({
    where: { userId: user.appUser.id, ...(ids ? { id: { in: ids } } : {}) },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ items: await attachSignedPhotoUrls(items) });
});

const MAX_WARDROBE_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB

export const POST = withAuth(
  async (user, req) => {
  const formData = await req.formData();

  const userId = user.appUser.id;
  const manualKind = normalizeKindInput(formData.get("kind"));
  const manualSubtype = normalizeSubtypeInput(formData.get("subtype"));
  const rawPhotos = formData.getAll("photo");
  const rawAttributes = {
    colorFamily: formData.get("colorFamily"),
    pattern: formData.get("pattern"),
    styleProfile: formData.get("styleProfile"),
    formality: formData.get("formality"),
    warmthLevel: formData.get("warmthLevel"),
  };

  const attributeParse = itemAttributePatchSchema.safeParse({
    colorFamily: typeof rawAttributes.colorFamily === "string" ? rawAttributes.colorFamily : undefined,
    pattern: typeof rawAttributes.pattern === "string" ? rawAttributes.pattern : undefined,
    styleProfile: typeof rawAttributes.styleProfile === "string" ? rawAttributes.styleProfile : undefined,
    formality: typeof rawAttributes.formality === "string" ? rawAttributes.formality : undefined,
    warmthLevel: typeof rawAttributes.warmthLevel === "string" ? rawAttributes.warmthLevel : undefined,
  });

  if (!attributeParse.success) {
    return NextResponse.json(
      { error: "Invalid payload. Expected optional kind, subtype, attributes, and photo." },
      { status: 400 },
    );
  }

  if ((manualKind && !manualSubtype) || (!manualKind && manualSubtype)) {
    return NextResponse.json(
      { error: "Kind and subtype must be provided together when added as optional details." },
      { status: 400 },
    );
  }

  if (manualKind && manualSubtype && !isValidSubtypeForKind(manualKind, manualSubtype)) {
    return NextResponse.json(
      { error: "Subtype does not match the selected kind." },
      { status: 400 },
    );
  }

  if (!rawPhotos || rawPhotos.length === 0) {
    return NextResponse.json({ error: "Missing photo file(s)." }, { status: 400 });
  }
  if (rawPhotos.length > MAX_UPLOAD_PHOTOS) {
    return NextResponse.json(
      { error: `Too many photos. Max ${MAX_UPLOAD_PHOTOS} per upload.` },
      { status: 400 },
    );
  }

  const createdItems = [];
  const providedManualAttributes = pickProvidedItemAttributes(attributeParse.data);
  const manualAttributes = mergeItemAttributes(providedManualAttributes);

  for (const rawPhoto of rawPhotos) {
    if (!(rawPhoto instanceof Blob) || rawPhoto.size === 0) {
      return NextResponse.json(
        { error: "One of the selected photos is invalid." },
        { status: 400 },
      );
    }

    const photoResult = await validateImageBlob(rawPhoto, MAX_WARDROBE_PHOTO_BYTES, "photo");
    if (!photoResult.ok) {
      return NextResponse.json({ error: photoResult.error }, { status: 400 });
    }

    const itemId = crypto.randomUUID();
    const { bytes, mime: verifiedMime, ext } = photoResult;

    let photoPath = "";
    try {
      photoPath = await uploadWardrobePhoto({
        userId,
        itemId,
        bytes,
        extension: ext,
        contentType: verifiedMime,
      });

      const resolved = await resolveUploadMetadata({
        bytes,
        manualKind,
        manualSubtype,
        manualAttributes,
      });

      const item = await prisma.item.create({
        data: {
          id: itemId,
          userId,
          kind: resolved.kind,
          subtype: resolved.subtype,
          ...resolved.attributes,
          analysisStatus: resolved.analysisStatus,
          metadataSource: resolved.metadataSource,
          visualSummary: resolved.visualSummary,
          analysisConfidence: resolved.analysisConfidence,
          analysisModel: resolved.analysisModel,
          analysisPromptVersion: resolved.analysisPromptVersion,
          analysisErrorCode: resolved.analysisErrorCode,
          photoUrl: photoPath,
        },
      });
      createdItems.push(item);
    } catch (error) {
      if (photoPath) {
        await deleteWardrobePhoto(photoPath);
      }
      throw error;
    }
  }

  return NextResponse.json({ items: await attachSignedPhotoUrls(createdItems) });
  },
  { key: (u) => `items:post:${u.appUser.id}`, max: 20 },
);

export const DELETE = withAuth(
  async (user, req) => {
  const json = await req.json().catch(() => null);
  const parsed = DeleteBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload: expected itemId." }, { status: 400 });
  }

  const existingItem = await prisma.item.findFirst({
    where: { id: parsed.data.itemId, userId: user.appUser.id },
  });

  if (!existingItem) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  await prisma.outfitHistory.deleteMany({
    where: {
      userId: user.appUser.id,
      OR: [
        { topItemId: parsed.data.itemId },
        { bottomItemId: parsed.data.itemId },
        { shoeItemId: parsed.data.itemId },
      ],
    },
  });

  await prisma.item.delete({
    where: { id: parsed.data.itemId, userId: user.appUser.id },
  });

  await deleteWardrobePhoto(existingItem.photoUrl);

  return NextResponse.json({ ok: true });
  },
  { key: (u) => `items:delete:${u.appUser.id}`, max: 30 },
);

export const PATCH = withAuth(
  async (user, req) => {
  const json = await req.json().catch(() => null);
  const parsed = UpdateBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload: expected itemId plus editable attributes or subtype." },
      { status: 400 },
    );
  }

  const { itemId, kind, subtype, ...attributes } = parsed.data;
  const existingItem = await prisma.item.findFirst({
    where: { id: itemId, userId: user.appUser.id },
  });

  if (!existingItem) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  const nextKind = kind ?? existingItem.kind;
  const nextSubtype = subtype?.trim() ?? existingItem.subtype;
  if (!isValidSubtypeForKind(nextKind, nextSubtype)) {
    return NextResponse.json(
      { error: "Subtype does not match the selected kind." },
      { status: 400 },
    );
  }

  const updated = await prisma.item.update({
    where: { id: itemId, userId: user.appUser.id },
    data: {
      ...(kind ? { kind } : {}),
      ...(subtype ? { subtype: nextSubtype } : {}),
      ...attributes,
      analysisStatus: hasUnknownAttributes(
        mergeItemAttributes({
          colorFamily: attributes.colorFamily ?? existingItem.colorFamily,
          pattern: attributes.pattern ?? existingItem.pattern,
          styleProfile: attributes.styleProfile ?? existingItem.styleProfile,
          formality: attributes.formality ?? existingItem.formality,
          warmthLevel: attributes.warmthLevel ?? existingItem.warmthLevel,
        }),
      )
        ? "SKIPPED"
        : "READY",
      metadataSource: "MANUAL",
      visualSummary: buildFallbackVisualSummary({
        subtype: nextSubtype,
        attributes: {
          colorFamily: attributes.colorFamily ?? existingItem.colorFamily,
          pattern: attributes.pattern ?? existingItem.pattern,
          styleProfile: attributes.styleProfile ?? existingItem.styleProfile,
          formality: attributes.formality ?? existingItem.formality,
          warmthLevel: attributes.warmthLevel ?? existingItem.warmthLevel,
        },
      }),
      analysisConfidence: null,
      analysisModel: null,
      analysisPromptVersion: null,
      analysisErrorCode: null,
    },
  });

  const [signedItem] = await attachSignedPhotoUrls([updated]);
  return NextResponse.json({ ok: true, item: signedItem });
  },
  { key: (u) => `items:patch:${u.appUser.id}`, max: 30 },
);
