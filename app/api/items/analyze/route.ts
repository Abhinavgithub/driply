import { NextResponse } from "next/server";
import { z } from "zod";

import { withAuth } from "@/lib/api-guard";
import {
  buildFallbackVisualSummary,
  classifyWardrobeImage,
  getGeminiErrorCode,
  getGeminiErrorMessage,
} from "@/lib/gemini";
import { downloadWardrobePhoto } from "@/lib/item-media";
import {
  getDefaultSubtypeForKind,
  isValidSubtypeForKind,
  type ItemAttributeValues,
} from "@/lib/itemAttributes";
import { prisma } from "@/lib/prisma";

const BodySchema = z.object({
  itemId: z.string().min(1),
});

export const POST = withAuth(
  async (currentUser, req) => {
    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload: expected itemId." }, { status: 400 });
    }

    const item = await prisma.item.findFirst({
      where: { id: parsed.data.itemId, userId: currentUser.appUser.id },
    });
    if (!item) {
      return NextResponse.json({ error: "Item not found." }, { status: 404 });
    }
    if (item.analysisStatus !== "PENDING") {
      return NextResponse.json({ error: "Item is not pending analysis." }, { status: 400 });
    }

    const bytes = await downloadWardrobePhoto(item.photoUrl);
    if (!bytes) {
      return NextResponse.json(
        { error: "Could not download photo for re-analysis." },
        { status: 500 },
      );
    }

    try {
      const classification = await classifyWardrobeImage({
        imageBytes: bytes,
        manualKind: null,
        manualSubtype: null,
      });

      const resolvedKind = classification.kind;
      const resolvedSubtype = isValidSubtypeForKind(resolvedKind, classification.subtype)
        ? classification.subtype
        : getDefaultSubtypeForKind(resolvedKind);

      const mergedAttributes: ItemAttributeValues = {
        colorFamily:
          item.colorFamily === "UNKNOWN" && classification.colorFamily !== "UNKNOWN"
            ? classification.colorFamily
            : item.colorFamily,
        pattern:
          item.pattern === "UNKNOWN" && classification.pattern !== "UNKNOWN"
            ? classification.pattern
            : item.pattern,
        styleProfile:
          item.styleProfile === "UNKNOWN" && classification.styleProfile !== "UNKNOWN"
            ? classification.styleProfile
            : item.styleProfile,
        formality:
          item.formality === "UNKNOWN" && classification.formality !== "UNKNOWN"
            ? classification.formality
            : item.formality,
        warmthLevel:
          item.warmthLevel === "UNKNOWN" && classification.warmthLevel !== "UNKNOWN"
            ? classification.warmthLevel
            : item.warmthLevel,
      };

      // Guarded write: a concurrent analyze that won the race already moved
      // the row out of PENDING — return the winner instead of overwriting.
      // userId scoping is defense-in-depth (the findFirst above already
      // constrains ownership).
      const claimed = await prisma.item.updateMany({
        where: { id: item.id, userId: currentUser.appUser.id, analysisStatus: "PENDING" },
        data: {
          kind: resolvedKind,
          subtype: resolvedSubtype,
          ...mergedAttributes,
          analysisStatus: "READY",
          metadataSource: "AI",
          visualSummary:
            classification.visualSummary ||
            buildFallbackVisualSummary({ subtype: resolvedSubtype, attributes: mergedAttributes }),
          analysisConfidence: classification.confidence,
          analysisModel: classification.model,
          analysisPromptVersion: classification.promptVersion,
          analysisErrorCode: null,
        },
      });
      const updated = await prisma.item.findFirst({
        where: { id: item.id, userId: currentUser.appUser.id },
      });
      if (!updated) {
        return NextResponse.json({ error: "Item not found." }, { status: 404 });
      }
      if (claimed.count === 0) {
        // Lost the race — the concurrent request's result stands.
        return NextResponse.json({ ok: true, item: updated, deduped: true });
      }

      return NextResponse.json({ ok: true, item: updated });
    } catch (error) {
      const code = getGeminiErrorCode(error);
      console.info("[gemini:reanalyze] failed", {
        itemId: item.id,
        code,
        message: getGeminiErrorMessage(error),
      });

      await prisma.item.updateMany({
        where: { id: item.id, userId: currentUser.appUser.id },
        data: { analysisErrorCode: code },
      });

      return NextResponse.json({ ok: false, reason: code });
    }
  },
  { key: (user) => `analyze:${user.appUser.id}`, max: 3, failClosed: true },
);
