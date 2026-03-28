import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { attachSignedPhotoUrls } from "@/lib/item-media";
import { prisma } from "@/lib/prisma";
import { fetchWeather } from "@/lib/openMeteo";
import { formatOutfitExplanation, rankOutfits } from "@/lib/recommendation";

const QuerySchema = z.object({
  lat: z.coerce.number().finite(),
  lon: z.coerce.number().finite(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(12).default(6),
});

function getServerDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function dateKeyToUtcStart(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

export async function GET(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    lat: searchParams.get("lat"),
    lon: searchParams.get("lon"),
    date: searchParams.get("date") ?? undefined,
    offset: searchParams.get("offset"),
    limit: searchParams.get("limit"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query params. Expected lat, lon, optional date=YYYY-MM-DD." },
      { status: 400 },
    );
  }

  const { lat, lon, date, offset, limit } = parsed.data;
  const dateKey = date ?? getServerDateKey();

  const items = await prisma.item.findMany({
    where: { userId: currentUser.appUser.id },
    orderBy: { createdAt: "desc" },
  });
  const tops = items.filter((i) => i.kind === "TOP");
  const bottoms = items.filter((i) => i.kind === "BOTTOM");
  const shoes = items.filter((i) => i.kind === "SHOE");

  if (!tops.length || !bottoms.length || !shoes.length) {
    return NextResponse.json(
      {
        error: "Add at least one item in each category: top, bottom, and shoe.",
        needs: {
          top: tops.length === 0,
          bottom: bottoms.length === 0,
          shoe: shoes.length === 0,
        },
      },
      { status: 400 },
    );
  }

  let weather: Awaited<ReturnType<typeof fetchWeather>>;
  try {
    weather = await fetchWeather(lat, lon);
  } catch {
    return NextResponse.json({ error: "Failed to fetch weather." }, { status: 502 });
  }

  const temperatureC = Math.round(weather.temperatureC * 2) / 2;
  const precipitationMm = Math.round(weather.precipitationMm * 10) / 10;

  const todayStart = dateKeyToUtcStart(dateKey);
  const cutoff = new Date(todayStart);
  cutoff.setUTCDate(cutoff.getUTCDate() - 3);

  const recent = await prisma.outfitHistory.findMany({
    where: {
      userId: currentUser.appUser.id,
      date: {
        gte: cutoff,
        lt: todayStart,
      },
    },
    take: 50,
    orderBy: { createdAt: "desc" },
  });

  const wornItemIds = new Set<string>();
  for (const outfit of recent) {
    wornItemIds.add(outfit.topItemId);
    wornItemIds.add(outfit.bottomItemId);
    wornItemIds.add(outfit.shoeItemId);
  }

  const rankedOptions = rankOutfits({
    dateKey,
    temperatureC,
    precipitationMm,
    tops,
    bottoms,
    shoes,
    wornItemIds,
    offset,
    limit,
  });

  const signedItems = await attachSignedPhotoUrls(
    rankedOptions.flatMap((option) => [option.top, option.bottom, option.shoe]),
  );
  const signedById = new Map(signedItems.map((item) => [item.id, item]));

  const options = rankedOptions.map((option) => ({
    ...option,
    top: signedById.get(option.top.id) ?? option.top,
    bottom: signedById.get(option.bottom.id) ?? option.bottom,
    shoe: signedById.get(option.shoe.id) ?? option.shoe,
    explanation: formatOutfitExplanation({
      temperatureC,
      precipitationMm,
      top: option.top,
      bottom: option.bottom,
      shoe: option.shoe,
    }),
  }));

  return NextResponse.json({
    dateKey,
    options,
    offset,
    limit,
  });
}
