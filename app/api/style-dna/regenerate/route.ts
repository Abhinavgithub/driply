import { after } from "next/server";
import { NextResponse } from "next/server";

import { withAuth } from "@/lib/api-guard";
import { parseStylePreferences } from "@/lib/style-preferences";
import { generateStyleDnaForUser } from "@/lib/style-dna";
import { prisma } from "@/lib/prisma";

const REGEN_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

export const POST = withAuth(async (currentUser) => {
  const userId = currentUser.appUser.id;

  const [user, existingDna] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { stylePreferences: true, lastDnaRegenAt: true },
    }),
    prisma.styleDNA.findUnique({
      where: { userId },
      select: { textStatus: true },
    }),
  ]);

  if (!parseStylePreferences(user?.stylePreferences)) {
    return NextResponse.json(
      { error: "Complete the style quiz before regenerating your Style DNA." },
      { status: 400 },
    );
  }

  // Block if a generation is already in progress to prevent duplicate jobs.
  if (existingDna?.textStatus === "GENERATING") {
    return NextResponse.json(
      { error: "Style DNA generation is already in progress." },
      { status: 409 },
    );
  }

  // Skip cooldown only if the previous run explicitly failed — the user shouldn't
  // be locked out just because a failed run stamped lastDnaRegenAt.
  const bypassCooldown = existingDna?.textStatus === "FAILED";

  if (!bypassCooldown && user?.lastDnaRegenAt) {
    const elapsed = Date.now() - user.lastDnaRegenAt.getTime();
    if (elapsed < REGEN_COOLDOWN_MS) {
      const retryAfter = Math.ceil((REGEN_COOLDOWN_MS - elapsed) / 1000);
      return NextResponse.json(
        { error: "You can regenerate your Style DNA once every 24 hours.", retryAfter },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { lastDnaRegenAt: new Date() },
  });

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
      generationTrigger: "manual",
    },
    update: {
      textStatus: "PENDING",
      moodboardStatus: "PENDING",
      generationTrigger: "manual",
    },
  });

  after(async () => {
    await generateStyleDnaForUser(userId, "manual");
  });

  return NextResponse.json({ status: "generating" });
});
