import { after } from "next/server";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { withAuth } from "@/lib/api-guard";
import { parseStylePreferences } from "@/lib/style-preferences";
import { generateStyleDnaForUser } from "@/lib/style-dna";
import { prisma } from "@/lib/prisma";

const REGEN_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

class DnaInProgressError extends Error {}
class DnaCooldownError extends Error {
  constructor(public readonly retryAfter: number) {
    super();
  }
}

export const POST = withAuth(async (currentUser) => {
  const userId = currentUser.appUser.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stylePreferences: true },
  });

  if (!parseStylePreferences(user?.stylePreferences)) {
    return NextResponse.json(
      { error: "Complete the style quiz before regenerating your Style DNA." },
      { status: 400 },
    );
  }

  // Atomic check-then-write: serializable isolation prevents two concurrent
  // requests from both passing the in-progress / cooldown guards before either writes.
  try {
    await prisma.$transaction(
      async (tx) => {
        const [txUser, txExisting] = await Promise.all([
          tx.user.findUnique({
            where: { id: userId },
            select: { lastDnaRegenAt: true },
          }),
          tx.styleDNA.findUnique({
            where: { userId },
            select: { textStatus: true },
          }),
        ]);

        if (txExisting?.textStatus === "PENDING" || txExisting?.textStatus === "GENERATING") {
          throw new DnaInProgressError();
        }

        // Skip cooldown only if the previous run explicitly failed.
        const bypassCooldown = txExisting?.textStatus === "FAILED";
        if (!bypassCooldown && txUser?.lastDnaRegenAt) {
          const elapsed = Date.now() - txUser.lastDnaRegenAt.getTime();
          if (elapsed < REGEN_COOLDOWN_MS) {
            throw new DnaCooldownError(Math.ceil((REGEN_COOLDOWN_MS - elapsed) / 1000));
          }
        }

        await Promise.all([
          tx.user.update({
            where: { id: userId },
            data: { lastDnaRegenAt: new Date() },
          }),
          tx.styleDNA.upsert({
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
          }),
        ]);
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
    if (err instanceof DnaCooldownError) {
      return NextResponse.json(
        {
          error: "You can regenerate your Style DNA once every 24 hours.",
          retryAfter: err.retryAfter,
        },
        { status: 429, headers: { "Retry-After": String(err.retryAfter) } },
      );
    }
    throw err;
  }

  after(async () => {
    await generateStyleDnaForUser(userId, "manual");
  });

  return NextResponse.json({ status: "generating" });
});
