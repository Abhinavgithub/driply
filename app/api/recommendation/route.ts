import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Item } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { fetchWeather } from "@/lib/openMeteo";
import { formatOutfitExplanation, recommendOutfit } from "@/lib/recommendation";

const QuerySchema = z.object({
  lat: z.coerce.number().finite(),
  lon: z.coerce.number().finite(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

function getServerDateKey() {
  // Deterministic daily choice (server-side default if client doesn't supply a date).
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function dateKeyToUtcStart(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    lat: searchParams.get("lat"),
    lon: searchParams.get("lon"),
    date: searchParams.get("date") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query params. Expected lat, lon, optional date=YYYY-MM-DD." },
      { status: 400 },
    );
  }

  const { lat, lon, date } = parsed.data;
  const dateKey = date ?? getServerDateKey();

  const items: Item[] = await prisma.item.findMany({
    orderBy: { createdAt: "desc" },
  });
  const tops = items.filter((i) => i.kind === "TOP");
  const bottoms = items.filter((i) => i.kind === "BOTTOM");
  const shoes = items.filter((i) => i.kind === "SHOE");

  if (!tops.length || !bottoms.length || !shoes.length) {
    const needs = {
      top: tops.length === 0,
      bottom: bottoms.length === 0,
      shoe: shoes.length === 0,
    };
    return NextResponse.json(
      {
        error: "Add at least one item in each category: top, bottom, and shoe.",
        needs,
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

  // Reduce tiny weather fluctuations so a refresh doesn't "wildly" change results.
  const temperatureC = Math.round(weather.temperatureC * 2) / 2; // 0.5°C
  const precipitationMm = Math.round(weather.precipitationMm * 10) / 10; // 0.1mm

  // Penalize recently worn items for variety (within last 3 days).
  const todayStart = dateKeyToUtcStart(dateKey);
  const cutoff = new Date(todayStart);
  cutoff.setUTCDate(cutoff.getUTCDate() - 3);

  const recent = await prisma.outfitHistory.findMany({
    where: {
      date: {
        gte: cutoff,
        lt: todayStart,
      },
    },
    take: 50,
    orderBy: { createdAt: "desc" },
  });

  const wornItemIds = new Set<string>();
  for (const o of recent) {
    wornItemIds.add(o.topItemId);
    wornItemIds.add(o.bottomItemId);
    wornItemIds.add(o.shoeItemId);
  }

  const recommendation = recommendOutfit({
    dateKey,
    temperatureC,
    precipitationMm,
    tops,
    bottoms,
    shoes,
    wornItemIds,
  });

  const explanation = formatOutfitExplanation({
    temperatureC: weather.temperatureC,
    precipitationMm: weather.precipitationMm,
    top: recommendation.top,
    bottom: recommendation.bottom,
    shoe: recommendation.shoe,
  });

  return NextResponse.json({
    dateKey,
    top: recommendation.top,
    bottom: recommendation.bottom,
    shoe: recommendation.shoe,
    debugScores: recommendation.debugScores,
    explanation,
  });
}
