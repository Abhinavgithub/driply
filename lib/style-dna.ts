import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { parseStylePreferences } from "@/lib/style-preferences";
import { getGeminiApiKey } from "@/lib/env";
import {
  buildRuleBasedDna,
  buildStyleDnaTextPrompt,
  type WardrobeSummary,
} from "@/lib/style-dna-prompt";

const GEMINI_DNA_MODEL = "gemini-2.5-flash-lite";
const GEMINI_TIMEOUT_MS = 12000;

const dnaTextSchema = z.object({
  archetypeName: z.string().trim().min(1).max(40),
  description: z.string().trim().min(1).max(300),
  traits: z.array(z.string().trim().max(20)).min(3).max(5),
  colorPalette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).length(5),
  imagePromptHints: z.array(z.string().trim().max(60)).min(3).max(5),
});

export type StyleDnaText = z.infer<typeof dnaTextSchema>;

export type StyleDnaStatus = {
  textStatus: string;
  archetypeName: string | null;
  description: string | null;
  traits: string[] | null;
  colorPalette: string[] | null;
  version: number;
};

async function computeWardrobeSummary(userId: string): Promise<WardrobeSummary | undefined> {
  const items = await prisma.item.findMany({
    where: { userId, analysisStatus: "READY" },
    select: { colorFamily: true, styleProfile: true, formality: true },
  });
  if (items.length < 3) return undefined;

  function topValues<T extends string>(arr: T[]): T[] {
    const counts = arr.reduce<Record<string, number>>((acc, v) => {
      acc[v] = (acc[v] ?? 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k]) => k) as T[];
  }

  const colors = items.map((i) => i.colorFamily).filter((c) => c !== "UNKNOWN");
  const styles = items.map((i) => i.styleProfile).filter((s) => s !== "UNKNOWN");
  const formalities = items.map((i) => i.formality).filter((f) => f !== "UNKNOWN");

  return {
    dominantColors: topValues(colors),
    dominantStyles: topValues(styles),
    dominantFormality: topValues(formalities)[0] ?? null,
    itemCount: items.length,
  };
}

async function generateDnaTextWithGemini(prompt: string): Promise<StyleDnaText> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error("Missing Gemini API key");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_DNA_MODEL)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.7,
          topP: 0.9,
          maxOutputTokens: 600,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini request failed with ${response.status}`);
  }

  type GeminiResponse = { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const json = (await response.json()) as GeminiResponse;
  let text =
    json.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim() ?? "";
  text = text
    .replace(/^```json\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last !== -1) text = text.slice(first, last + 1);

  const parsed = dnaTextSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error("Invalid Gemini DNA response shape");
  return parsed.data;
}

export async function getStyleDnaStatus(userId: string): Promise<StyleDnaStatus | null> {
  const record = await prisma.styleDNA.findUnique({
    where: { userId },
    select: {
      textStatus: true,
      archetypeName: true,
      description: true,
      traits: true,
      colorPalette: true,
      version: true,
    },
  });
  if (!record) return null;

  return {
    textStatus: record.textStatus,
    archetypeName: record.textStatus === "READY" ? record.archetypeName : null,
    description: record.textStatus === "READY" ? record.description : null,
    traits: record.textStatus === "READY" ? record.traits : null,
    colorPalette: record.textStatus === "READY" ? record.colorPalette : null,
    version: record.version,
  };
}

export async function generateStyleDnaForUser(
  userId: string,
  trigger: "onboarding" | "manual" | "wardrobe_update" = "manual",
  // Pre-handoff status captured by the calling endpoint BEFORE it writes
  // PENDING (rule 9): reading it here would only ever see the endpoint's own
  // write. Falls back to an internal read for direct callers.
  preStatus: string | null = null,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stylePreferences: true, styleDna: { select: { version: true } } },
  });

  const prefs = parseStylePreferences(user?.stylePreferences);
  if (!prefs) {
    console.warn(`[style-dna] User ${userId} has no valid stylePreferences — skipping`);
    return;
  }

  // Atomic version bump (no read-modify-write lost update) and keep-old:
  // regenerating must not wipe prior READY data — getStyleDnaStatus hides
  // non-READY rows, so clearing fields here would blank the UI on failure.
  // NOTE: preStatus must come from the caller (see param) — by the time this
  // runs, the endpoint has already written PENDING.
  let restoreStatus = preStatus;
  const prev = await prisma.styleDNA.findUnique({
    where: { userId },
    select: { textStatus: true },
  });
  if (restoreStatus === null) restoreStatus = prev?.textStatus ?? null;
  if (prev) {
    await prisma.styleDNA.update({
      where: { userId },
      data: {
        version: { increment: 1 },
        textStatus: "GENERATING",
        moodboardStatus: "PENDING",
        moodboardUrl: null,
        generatedAt: null,
        moodboardGeneratedAt: null,
        generationTrigger: trigger,
      },
    });
  } else {
    await prisma.styleDNA.create({
      data: {
        userId,
        version: 1,
        archetypeName: "",
        description: "",
        traits: [],
        colorPalette: [],
        imagePromptHints: [],
        textStatus: "GENERATING",
        moodboardStatus: "PENDING",
        generationTrigger: trigger,
      },
    });
  }

  try {
    const wardrobeSummary = await computeWardrobeSummary(userId);
    const textPrompt = buildStyleDnaTextPrompt(prefs, wardrobeSummary);

    let dnaText: StyleDnaText;
    try {
      dnaText = await generateDnaTextWithGemini(textPrompt);
    } catch (err) {
      console.warn("[style-dna] Gemini text generation failed, using rule-based fallback:", err);
      dnaText = buildRuleBasedDna(prefs);
    }

    await prisma.styleDNA.update({
      where: { userId },
      data: {
        archetypeName: dnaText.archetypeName,
        description: dnaText.description,
        traits: dnaText.traits,
        colorPalette: dnaText.colorPalette,
        imagePromptHints: dnaText.imagePromptHints,
        textStatus: "READY",
        moodboardStatus: "READY",
        generatedAt: new Date(),
        promptSnapshot: { prefs, wardrobeSummary: wardrobeSummary ?? null },
      },
    });
  } catch (err) {
    console.error("[style-dna] Generation failed for user", userId, err);
    // Restore the prior status so a failed regen doesn't hide previously
    // READY data (kept intact above). Surface errors instead of swallowing.
    await prisma.styleDNA.update({
      where: { userId },
      data: { textStatus: restoreStatus === "READY" ? "READY" : "FAILED" },
    });
    await prisma.user.update({ where: { id: userId }, data: { lastDnaRegenAt: null } });
  }
}
