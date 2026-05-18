import { after } from "next/server";
import { NextResponse } from "next/server";

import { withAuth } from "@/lib/api-guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseStylePreferences } from "@/lib/style-preferences";
import { generateStyleDnaForUser, getStyleDnaStatus } from "@/lib/style-dna";
import { prisma } from "@/lib/prisma";

export const GET = withAuth(async (currentUser) => {
  const userId = currentUser.appUser.id;
  const status = await getStyleDnaStatus(userId);
  if (!status) return NextResponse.json({ exists: false }, { status: 200 });
  return NextResponse.json({ exists: true, ...status });
});

export const POST = withAuth(async (currentUser) => {
  const userId = currentUser.appUser.id;

  if (!checkRateLimit(`style-dna:generate:${userId}`, 5)) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  const [user, existingDna] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { stylePreferences: true },
    }),
    prisma.styleDNA.findUnique({
      where: { userId },
      select: { textStatus: true },
    }),
  ]);

  if (!parseStylePreferences(user?.stylePreferences)) {
    return NextResponse.json(
      { error: "Complete the style quiz before generating your Style DNA." },
      { status: 400 },
    );
  }

  if (existingDna?.textStatus === "PENDING" || existingDna?.textStatus === "GENERATING") {
    return NextResponse.json(
      { error: "Style DNA generation is already in progress." },
      { status: 409 },
    );
  }

  // Create placeholder record immediately so poll can see it
  await prisma.styleDNA.upsert({
    where: { userId },
    create: {
      userId,
      archetypeName: "",
      description: "",
      traits: [],
      colorPalette: [],
      imagePromptHints: [],
      textStatus: "PENDING",
      moodboardStatus: "PENDING",
      generationTrigger: "onboarding",
    },
    update: {
      textStatus: "PENDING",
      moodboardStatus: "PENDING",
      generationTrigger: "onboarding",
    },
  });

  after(async () => {
    await generateStyleDnaForUser(userId, "onboarding");
  });

  return NextResponse.json({ status: "generating" });
});
