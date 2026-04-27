import { NextResponse } from "next/server";
import { z } from "zod";

import { withAuth } from "@/lib/api-guard";
import { attachSignedPhotoUrls } from "@/lib/item-media";
import { dateKeyToUtcStart } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

const BodySchema = z.object({
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  topItemId: z.string().min(1),
  bottomItemId: z.string().min(1),
  shoeItemId: z.string().min(1),
});

const DeleteSchema = z.object({
  id: z.string().min(1),
});

export const GET = withAuth(async (currentUser, req) => {
  // Accept the client's local date so the 7-day window is anchored to the
  // user's local day, not UTC (avoids off-by-one near UTC midnight).
  const localDate = new URL(req.url).searchParams.get("date");
  const anchorKey = localDate?.match(/^\d{4}-\d{2}-\d{2}$/) ? localDate : new Date().toISOString().slice(0, 10);
  const anchor = dateKeyToUtcStart(anchorKey);
  const sevenDaysAgo = new Date(anchor);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);

  const records = await prisma.outfitHistory.findMany({
    where: {
      userId: currentUser.appUser.id,
      date: { gte: sevenDaysAgo },
    },
    select: { id: true, date: true, topItemId: true, bottomItemId: true, shoeItemId: true },
    orderBy: { date: "asc" },
  });

  const dateKeys = records.map((r) => r.date.toISOString().slice(0, 10));

  // Fetch item photo paths for the history detail bottom sheet
  const allItemIds = [...new Set(records.flatMap((r) => [r.topItemId, r.bottomItemId, r.shoeItemId]))];
  const items = allItemIds.length
    ? await prisma.item.findMany({
        where: { id: { in: allItemIds }, userId: currentUser.appUser.id },
        select: { id: true, photoUrl: true, kind: true },
      })
    : [];
  const signedItems = await attachSignedPhotoUrls(items);
  const photoById = new Map(signedItems.map((i) => [i.id, i.photoUrl]));

  const history = records.map((r) => ({
    id: r.id,
    dateKey: r.date.toISOString().slice(0, 10),
    topPhotoUrl: photoById.get(r.topItemId) ?? null,
    bottomPhotoUrl: photoById.get(r.bottomItemId) ?? null,
    shoePhotoUrl: photoById.get(r.shoeItemId) ?? null,
  }));

  return NextResponse.json({ dateKeys, history });
});

export const POST = withAuth(
  async (currentUser, req) => {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload. Expected dateKey and item ids." },
      { status: 400 },
    );
  }

  const { dateKey, topItemId, bottomItemId, shoeItemId } = parsed.data;
  const ownedItems = await prisma.item.findMany({
    where: {
      userId: currentUser.appUser.id,
      id: { in: [topItemId, bottomItemId, shoeItemId] },
    },
    select: { id: true },
  });

  if (ownedItems.length !== 3) {
    return NextResponse.json({ error: "Invalid outfit items." }, { status: 400 });
  }

  const existing = await prisma.outfitHistory.findFirst({
    where: {
      userId: currentUser.appUser.id,
      date: dateKeyToUtcStart(dateKey),
      topItemId,
      bottomItemId,
      shoeItemId,
    },
  });

  if (existing) {
    return NextResponse.json({ ok: true, history: existing });
  }

  const history = await prisma.outfitHistory.create({
    data: {
      userId: currentUser.appUser.id,
      date: dateKeyToUtcStart(dateKey),
      topItemId,
      bottomItemId,
      shoeItemId,
    },
  });

  return NextResponse.json({ ok: true, history });
  },
  { key: (u) => `outfits:post:${u.appUser.id}`, max: 30 },
);

export const DELETE = withAuth(
  async (currentUser, req) => {
    const json = await req.json().catch(() => null);
    const parsed = DeleteSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload. Expected id." }, { status: 400 });
    }

    const record = await prisma.outfitHistory.findFirst({
      where: { id: parsed.data.id, userId: currentUser.appUser.id },
      select: { id: true },
    });

    if (!record) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    await prisma.outfitHistory.delete({ where: { id: record.id } });
    return NextResponse.json({ ok: true });
  },
  { key: (u) => `outfits:delete:${u.appUser.id}`, max: 20 },
);
