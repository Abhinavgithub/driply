import { NextResponse } from "next/server";
import { z } from "zod";

import { applyAiRecommendationRerank } from "@/lib/aiRecommendation";
import { withAuth } from "@/lib/api-guard";
import { attachSignedPhotoUrls } from "@/lib/item-media";
import { prisma } from "@/lib/prisma";
import { fetchWeather } from "@/lib/openMeteo";
import { formatOutfitExplanation, rankOutfits } from "@/lib/recommendation";
import { parseStylePreferences } from "@/lib/style-preferences";
import { getServerDateKey, dateKeyToUtcStart } from "@/lib/date-utils";

const QuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(12).default(6),
});

export const GET = withAuth(
  async (currentUser, req) => {
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
    if (!date) {
      console.warn(
        "[recommendations] missing date param, falling back to server date (deprecated)",
      );
    }
    const stylePreferences = parseStylePreferences(currentUser.appUser.stylePreferences);

    const todayStart = dateKeyToUtcStart(dateKey);
    const cutoff = new Date(todayStart);
    cutoff.setUTCDate(cutoff.getUTCDate() - 7);

    const [[tops, bottoms, shoes], weatherResult, recent] = await Promise.all([
      Promise.all([
        prisma.item.findMany({
          where: {
            userId: currentUser.appUser.id,
            kind: "TOP",
            analysisStatus: { not: "PENDING" },
          },
        }),
        prisma.item.findMany({
          where: {
            userId: currentUser.appUser.id,
            kind: "BOTTOM",
            analysisStatus: { not: "PENDING" },
          },
        }),
        prisma.item.findMany({
          where: {
            userId: currentUser.appUser.id,
            kind: "SHOE",
            analysisStatus: { not: "PENDING" },
          },
        }),
      ]),
      fetchWeather(lat, lon).catch(() => null),
      prisma.outfitHistory
        .findMany({
          where: { userId: currentUser.appUser.id, date: { gte: cutoff, lt: todayStart } },
          take: 50,
          orderBy: { createdAt: "desc" },
        })
        .catch(() => []),
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

    if (!weatherResult) {
      return NextResponse.json({ error: "Failed to fetch weather." }, { status: 502 });
    }

    const weather = weatherResult;
    const temperatureC = Math.round(weather.temperatureC * 2) / 2;
    const precipitationMm = Math.round(weather.precipitationMm * 10) / 10;

    // Item ids are null when the item was deleted after the outfit was worn.
    const wornItemIds = new Set<string>();
    for (const outfit of recent) {
      if (outfit.topItemId) wornItemIds.add(outfit.topItemId);
      if (outfit.bottomItemId) wornItemIds.add(outfit.bottomItemId);
      if (outfit.shoeItemId) wornItemIds.add(outfit.shoeItemId);
    }

    const baseRankedOptions = rankOutfits({
      dateKey,
      temperatureC,
      precipitationMm,
      tops,
      bottoms,
      shoes,
      wornItemIds,
      offset: 0,
      limit: offset === 0 ? Math.max(limit, 6) : offset + limit,
      stylePreferences,
    });

    const decision =
      offset === 0
        ? await applyAiRecommendationRerank({
            temperatureC,
            precipitationMm,
            rankedOptions: baseRankedOptions,
          })
        : {
            options: baseRankedOptions,
            decisionSource: "algorithm_fallback" as const,
            decisionConfidence: null,
            aiReason: null,
          };

    const rankedOptions: NonNullable<(typeof decision.options)[number]>[] = [];
    for (const option of decision.options.slice(offset, offset + limit)) {
      if (option) rankedOptions.push(option);
    }

    const signedItems = await attachSignedPhotoUrls(
      rankedOptions.flatMap((option) => [option.top, option.bottom, option.shoe]),
    );
    const signedById = new Map(signedItems.map((item) => [item.id, item]));

    const options = rankedOptions.map((option) => ({
      ...option,
      top: signedById.get(option.top.id) ?? option.top,
      bottom: signedById.get(option.bottom.id) ?? option.bottom,
      shoe: signedById.get(option.shoe.id) ?? option.shoe,
      explanation:
        decision.decisionSource === "ai" &&
        decision.aiReason &&
        option === rankedOptions[0] &&
        offset === 0
          ? decision.aiReason
          : formatOutfitExplanation({
              temperatureC,
              precipitationMm,
              top: option.top,
              bottom: option.bottom,
              shoe: option.shoe,
            }),
      decisionSource:
        decision.decisionSource === "ai" && option === rankedOptions[0] && offset === 0
          ? "ai"
          : "algorithm_fallback",
      decisionConfidence:
        decision.decisionSource === "ai" && option === rankedOptions[0] && offset === 0
          ? decision.decisionConfidence
          : null,
      aiReason:
        decision.decisionSource === "ai" && option === rankedOptions[0] && offset === 0
          ? decision.aiReason
          : null,
    }));

    return NextResponse.json({
      dateKey,
      options,
      offset,
      limit,
      decisionSource: decision.decisionSource,
      decisionConfidence: decision.decisionConfidence,
      aiReason: decision.aiReason,
    });
  },
  { key: (u) => `recommendations:get:${u.appUser.id}`, max: 20 },
);
