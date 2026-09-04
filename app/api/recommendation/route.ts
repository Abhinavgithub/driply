import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withAuth } from "@/lib/api-guard";
import { applyAiRecommendationRerank } from "@/lib/aiRecommendation";
import { attachSignedPhotoUrls } from "@/lib/item-media";
import { prisma } from "@/lib/prisma";
import { fetchWeather } from "@/lib/openMeteo";
import { formatOutfitExplanation, rankOutfits } from "@/lib/recommendation";
import { getServerDateKey, dateKeyToUtcStart } from "@/lib/date-utils";

const QuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const GET = withAuth(
  async (currentUser, req: NextRequest) => {
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
    if (!date) {
      console.warn("[recommendation] missing date param, falling back to server date (deprecated)");
    }

    const [tops, bottoms, shoes] = await Promise.all([
      prisma.item.findMany({
        where: { userId: currentUser.appUser.id, kind: "TOP", analysisStatus: { not: "PENDING" } },
      }),
      prisma.item.findMany({
        where: {
          userId: currentUser.appUser.id,
          kind: "BOTTOM",
          analysisStatus: { not: "PENDING" },
        },
      }),
      prisma.item.findMany({
        where: { userId: currentUser.appUser.id, kind: "SHOE", analysisStatus: { not: "PENDING" } },
      }),
    ]);

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
    cutoff.setUTCDate(cutoff.getUTCDate() - 7);

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

    // Item ids are null when the item was deleted after the outfit was worn.
    const wornItemIds = new Set<string>();
    for (const outfit of recent) {
      if (outfit.topItemId) wornItemIds.add(outfit.topItemId);
      if (outfit.bottomItemId) wornItemIds.add(outfit.bottomItemId);
      if (outfit.shoeItemId) wornItemIds.add(outfit.shoeItemId);
    }

    const rankedOptions = rankOutfits({
      dateKey,
      temperatureC,
      precipitationMm,
      tops,
      bottoms,
      shoes,
      wornItemIds,
      offset: 0,
      limit: 6,
    });

    const decision = await applyAiRecommendationRerank({
      temperatureC,
      precipitationMm,
      rankedOptions,
    });
    const recommendation = decision.options[0];

    if (!recommendation) {
      return NextResponse.json(
        { error: "Missing wardrobe items to form an outfit." },
        { status: 400 },
      );
    }

    const signedItems = await attachSignedPhotoUrls([
      recommendation.top,
      recommendation.bottom,
      recommendation.shoe,
    ]);
    const signedById = new Map(signedItems.map((item) => [item.id, item]));

    return NextResponse.json({
      dateKey,
      top: signedById.get(recommendation.top.id) ?? recommendation.top,
      bottom: signedById.get(recommendation.bottom.id) ?? recommendation.bottom,
      shoe: signedById.get(recommendation.shoe.id) ?? recommendation.shoe,
      debugScores: recommendation.debugScores,
      explanation:
        decision.decisionSource === "ai" && decision.aiReason
          ? decision.aiReason
          : formatOutfitExplanation({
              temperatureC: weather.temperatureC,
              precipitationMm: weather.precipitationMm,
              top: recommendation.top,
              bottom: recommendation.bottom,
              shoe: recommendation.shoe,
            }),
      decisionSource: decision.decisionSource,
      decisionConfidence: decision.decisionConfidence,
      aiReason: decision.aiReason,
    });
  },
  { key: (u) => `recommendation:get:${u.appUser.id}`, max: 20 },
);
