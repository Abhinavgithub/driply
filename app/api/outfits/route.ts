import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { dateKeyToUtcStart } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

const BodySchema = z.object({
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  topItemId: z.string().min(1),
  bottomItemId: z.string().min(1),
  shoeItemId: z.string().min(1),
});

export async function GET(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

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
    select: { date: true },
    orderBy: { date: "asc" },
  });

  const dateKeys = records.map((r) => r.date.toISOString().slice(0, 10));
  return NextResponse.json({ dateKeys });
}

export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

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
}
