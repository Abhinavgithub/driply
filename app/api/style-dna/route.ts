import { after } from "next/server";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { withAuth } from "@/lib/api-guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseStylePreferences } from "@/lib/style-preferences";
import { generateStyleDnaForUser, getStyleDnaStatus } from "@/lib/style-dna";
import { prisma } from "@/lib/prisma";

class DnaInProgressError extends Error {}

export const GET = withAuth(async (currentUser) => {
  const userId = currentUser.appUser.id;
  const status = await getStyleDnaStatus(userId);
  if (!status) return NextResponse.json({ exists: false }, { status: 200 });
  return NextResponse.json({ exists: true, ...status });
});

export const POST = withAuth(async (currentUser) => {
  const userId = currentUser.appUser.id;

  if (!(await checkRateLimit(`style-dna:generate:${userId}`, 5, { failClosed: true }))) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stylePreferences: true },
  });

  if (!parseStylePreferences(user?.stylePreferences)) {
    return NextResponse.json(
      { error: "Complete the style quiz before generating your Style DNA." },
      { status: 400 },
    );
  }

  // Atomic check-then-upsert: serializable isolation prevents two concurrent
  // requests from both passing the in-progress guard before either writes.
  // Capture the pre-write status for the worker: it restores READY on failure,
  // but can only see our own PENDING write by the time it runs (rule 9).
  let preStatus: string | null = null;
  try {
    await prisma.$transaction(
      async (tx) => {
        const existing = await tx.styleDNA.findUnique({
          where: { userId },
          select: { textStatus: true },
        });
        if (existing?.textStatus === "PENDING" || existing?.textStatus === "GENERATING") {
          throw new DnaInProgressError();
        }
        preStatus = existing?.textStatus ?? null;
        await tx.styleDNA.upsert({
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
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (err) {
    if (
      err instanceof DnaInProgressError ||
      (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034")
    ) {
      return NextResponse.json(
        { error: "Style DNA generation is already in progress." },
        { status: 409 },
      );
    }
    throw err;
  }

  after(async () => {
    await generateStyleDnaForUser(userId, "onboarding", preStatus);
  });

  return NextResponse.json({ status: "generating" });
});
