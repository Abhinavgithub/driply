import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

const BodySchema = z.object({
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  topItemId: z.string().min(1),
  bottomItemId: z.string().min(1),
  shoeItemId: z.string().min(1),
});

function dateKeyToUtcStart(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload. Expected dateKey and item ids." },
      { status: 400 },
    );
  }

  const { dateKey, topItemId, bottomItemId, shoeItemId } = parsed.data;

  // Avoid spamming identical history entries for the same date.
  const existing = await prisma.outfitHistory.findFirst({
    where: {
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
      date: dateKeyToUtcStart(dateKey),
      topItemId,
      bottomItemId,
      shoeItemId,
    },
  });

  return NextResponse.json({ ok: true, history });
}

