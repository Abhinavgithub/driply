import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";

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
  const items = await prisma.item.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
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

  const kindEnum = kindToEnum[parse.data];

  if (!rawPhotos || rawPhotos.length === 0) {
    return NextResponse.json({ error: "Missing photo file(s)." }, { status: 400 });
  }
  if (rawPhotos.length > MAX_UPLOAD_PHOTOS) {
    return NextResponse.json(
      { error: `Too many photos. Max ${MAX_UPLOAD_PHOTOS} per upload.` },
      { status: 400 },
    );
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "items");
  await fs.mkdir(uploadDir, { recursive: true });
  const createdItems = [];

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
    const filename = `${itemId}.${ext}`;
    const relUrl = `/uploads/items/${filename}`;
    const absPath = path.join(uploadDir, filename);

    const bytes = Buffer.from(await rawPhoto.arrayBuffer());
    await fs.writeFile(absPath, bytes);

    const item = await prisma.item.create({
      data: {
        kind: kindEnum,
        subtype: subtype.trim(),
        ...attributeParse.data,
        photoUrl: relUrl,
      },
    });
    createdItems.push(item);
  }

  return NextResponse.json({ items: createdItems });
}

export async function DELETE(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = DeleteBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload: expected itemId." }, { status: 400 });
  }

  const { itemId } = parsed.data;

  // Remove item itself.
  // Photos are intentionally not deleted from disk for this MVP (see UI setting).
  await prisma.outfitHistory.deleteMany({
    where: {
      OR: [
        { topItemId: itemId },
        { bottomItemId: itemId },
        { shoeItemId: itemId },
      ],
    },
  });

  const deleted = await prisma.item.delete({
    where: { id: itemId },
  });

  return NextResponse.json({ ok: true, deleted });
}

export async function PATCH(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = UpdateBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload: expected itemId plus editable attributes or subtype." },
      { status: 400 },
    );
  }

  const { itemId, subtype, ...attributes } = parsed.data;
  const updated = await prisma.item.update({
    where: { id: itemId },
    data: {
      ...(subtype ? { subtype: subtype.trim() } : {}),
      ...attributes,
    },
  });

  return NextResponse.json({ ok: true, item: updated });
}
