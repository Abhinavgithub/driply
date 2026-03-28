import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { deleteWardrobePhoto, attachSignedPhotoUrls, uploadWardrobePhoto } from "@/lib/item-media";
import { itemAttributePatchSchema, itemAttributesSchema } from "@/lib/itemAttributes";
import { prisma } from "@/lib/prisma";

const KindInputSchema = z.enum(["top", "bottom", "shoe"]);
const DeleteBodySchema = z.object({
  itemId: z.string().min(1),
});
const UpdateBodySchema = z
  .object({
    itemId: z.string().min(1),
    subtype: z.string().trim().min(1).optional(),
  })
  .extend(itemAttributePatchSchema.shape)
  .refine(
    (value) =>
      value.subtype !== undefined ||
      value.colorFamily !== undefined ||
      value.pattern !== undefined ||
      value.styleProfile !== undefined ||
      value.formality !== undefined ||
      value.warmthLevel !== undefined,
    { message: "Expected at least one editable field." },
  );
const MAX_UPLOAD_PHOTOS = 10;

const kindToEnum = {
  top: "TOP",
  bottom: "BOTTOM",
  shoe: "SHOE",
} as const;

function mimeToExt(mimeType: string): string | null {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return null;
  }
}

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const items = await prisma.item.findMany({
    where: { userId: currentUser.appUser.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ items: await attachSignedPhotoUrls(items) });
}

export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const formData = await req.formData();

  const rawKind = formData.get("kind");
  const rawSubtype = formData.get("subtype");
  const rawPhotos = formData.getAll("photo");
  const rawAttributes = {
    colorFamily: formData.get("colorFamily"),
    pattern: formData.get("pattern"),
    styleProfile: formData.get("styleProfile"),
    formality: formData.get("formality"),
    warmthLevel: formData.get("warmthLevel"),
  };

  const kind = typeof rawKind === "string" ? rawKind : undefined;
  const subtype = typeof rawSubtype === "string" ? rawSubtype : undefined;
  const attributeParse = itemAttributesSchema.safeParse({
    colorFamily: typeof rawAttributes.colorFamily === "string" ? rawAttributes.colorFamily : undefined,
    pattern: typeof rawAttributes.pattern === "string" ? rawAttributes.pattern : undefined,
    styleProfile: typeof rawAttributes.styleProfile === "string" ? rawAttributes.styleProfile : undefined,
    formality: typeof rawAttributes.formality === "string" ? rawAttributes.formality : undefined,
    warmthLevel: typeof rawAttributes.warmthLevel === "string" ? rawAttributes.warmthLevel : undefined,
  });

  const parse = KindInputSchema.safeParse(kind);
  if (
    !parse.success ||
    typeof subtype !== "string" ||
    subtype.trim().length < 1 ||
    !attributeParse.success
  ) {
    return NextResponse.json(
      { error: "Invalid payload. Expected kind, subtype, attributes, and photo." },
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
  const kindEnum = kindToEnum[parse.data];

  for (const rawPhoto of rawPhotos) {
    if (!(rawPhoto instanceof Blob) || rawPhoto.size === 0) {
      return NextResponse.json(
        { error: "One of the selected photos is invalid." },
        { status: 400 },
      );
    }

    const ext = mimeToExt(rawPhoto.type);
    if (!ext) {
      return NextResponse.json(
        { error: `Unsupported image type: ${rawPhoto.type || "unknown"}` },
        { status: 400 },
      );
    }

    const itemId = crypto.randomUUID();
    const bytes = Buffer.from(await rawPhoto.arrayBuffer());

    let photoPath = "";
    try {
      photoPath = await uploadWardrobePhoto({
        userId: currentUser.appUser.id,
        itemId,
        bytes,
        extension: ext,
        contentType: rawPhoto.type,
      });

      const item = await prisma.item.create({
        data: {
          id: itemId,
          userId: currentUser.appUser.id,
          kind: kindEnum,
          subtype: subtype.trim(),
          ...attributeParse.data,
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
}

export async function DELETE(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = DeleteBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload: expected itemId." }, { status: 400 });
  }

  const existingItem = await prisma.item.findFirst({
    where: { id: parsed.data.itemId, userId: currentUser.appUser.id },
  });

  if (!existingItem) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  await prisma.outfitHistory.deleteMany({
    where: {
      userId: currentUser.appUser.id,
      OR: [
        { topItemId: parsed.data.itemId },
        { bottomItemId: parsed.data.itemId },
        { shoeItemId: parsed.data.itemId },
      ],
    },
  });

  await prisma.item.delete({
    where: { id: parsed.data.itemId },
  });

  await deleteWardrobePhoto(existingItem.photoUrl);

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = UpdateBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload: expected itemId plus editable attributes or subtype." },
      { status: 400 },
    );
  }

  const { itemId, subtype, ...attributes } = parsed.data;
  const existingItem = await prisma.item.findFirst({
    where: { id: itemId, userId: currentUser.appUser.id },
  });

  if (!existingItem) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  const updated = await prisma.item.update({
    where: { id: itemId },
    data: {
      ...(subtype ? { subtype: subtype.trim() } : {}),
      ...attributes,
    },
  });

  const [signedItem] = await attachSignedPhotoUrls([updated]);
  return NextResponse.json({ ok: true, item: signedItem });
}
