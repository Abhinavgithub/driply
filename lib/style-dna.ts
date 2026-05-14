import crypto from "crypto";
import OpenAI from "openai";
import sharp from "sharp";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseStorageBucket } from "@/lib/supabase/env";
import { parseStylePreferences } from "@/lib/style-preferences";
import {
  buildRuleBasedDna,
  buildStyleDnaImagePrompt,
  buildStyleDnaTextPrompt,
  type WardrobeSummary,
} from "@/lib/style-dna-prompt";

const GEMINI_DNA_MODEL = "gemini-2.5-flash-lite";
const GEMINI_TIMEOUT_MS = 12000;
const OPENAI_IMAGE_TIMEOUT_MS = 90000;

const dnaTextSchema = z.object({
  archetypeName: z.string().trim().min(1).max(40),
  description: z.string().trim().min(1).max(300),
  traits: z.array(z.string().trim().max(20)).min(3).max(5),
  colorPalette: z
    .array(z.string().regex(/^#[0-9a-fA-F]{6}$/))
    .length(5),
  imagePromptHints: z.array(z.string().trim().max(60)).min(3).max(5),
});

export type StyleDnaText = z.infer<typeof dnaTextSchema>;

export type StyleDnaStatus = {
  textStatus: string;
  moodboardStatus: string;
  archetypeName: string | null;
  description: string | null;
  traits: string[] | null;
  colorPalette: string[] | null;
  moodboardUrl: string | null;
  version: number;
};

function moodboardStoragePath(userId: string, version: number) {
  return `profiles/${userId}/style-dna-v${version}.webp`;
}

async function getSignedMoodboardUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from(getSupabaseStorageBucket())
    .createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

async function uploadMoodboard(userId: string, version: number, bytes: Buffer): Promise<string> {
  const path = moodboardStoragePath(userId, version);
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.storage.from(getSupabaseStorageBucket()).upload(path, bytes, {
    contentType: "image/webp",
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return path;
}

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
  const apiKey = process.env.GEMINI_API_KEY?.trim();
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
  let text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
  text = text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last !== -1) text = text.slice(first, last + 1);

  const parsed = dnaTextSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error("Invalid Gemini DNA response shape");
  return parsed.data;
}

async function generateMoodboardWithOpenAI(imagePrompt: string): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("Missing OpenAI API key");

  const client = new OpenAI({ apiKey, timeout: OPENAI_IMAGE_TIMEOUT_MS, maxRetries: 0 });
  const response = await client.images.generate({
    model: "gpt-image-2",
    prompt: imagePrompt,
    n: 1,
    size: "1024x1024",
    quality: "standard",
    response_format: "b64_json",
  });

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no image data");

  const pngBuffer = Buffer.from(b64, "base64");
  return sharp(pngBuffer).webp({ quality: 85 }).toBuffer();
}

async function generateMoodboardWithFlux(imagePrompt: string): Promise<Buffer> {
  const token = process.env.HF_TOKEN?.trim();
  if (!token) throw new Error("Missing HuggingFace token");

  const { InferenceClient } = await import("@huggingface/inference");
  const client = new InferenceClient(token);
  const blob = await client.textToImage(
    {
      model: "black-forest-labs/FLUX.1-schnell",
      inputs: imagePrompt,
      parameters: { num_inference_steps: 5 },
    },
    { outputType: "blob" },
  );
  const arrayBuffer = await blob.arrayBuffer();
  const rawBuffer = Buffer.from(arrayBuffer);
  return sharp(rawBuffer).webp({ quality: 85 }).toBuffer();
}

export async function getStyleDnaStatus(userId: string): Promise<StyleDnaStatus | null> {
  const record = await prisma.styleDNA.findUnique({
    where: { userId },
    select: {
      textStatus: true,
      moodboardStatus: true,
      archetypeName: true,
      description: true,
      traits: true,
      colorPalette: true,
      moodboardUrl: true,
      version: true,
    },
  });
  if (!record) return null;

  const moodboardSignedUrl =
    record.moodboardStatus === "READY" ? await getSignedMoodboardUrl(record.moodboardUrl) : null;

  return {
    textStatus: record.textStatus,
    moodboardStatus: record.moodboardStatus,
    archetypeName: record.textStatus === "READY" ? record.archetypeName : null,
    description: record.textStatus === "READY" ? record.description : null,
    traits: record.textStatus === "READY" ? record.traits : null,
    colorPalette: record.textStatus === "READY" ? record.colorPalette : null,
    moodboardUrl: moodboardSignedUrl,
    version: record.version,
  };
}

export async function generateStyleDnaForUser(
  userId: string,
  trigger: "onboarding" | "manual" | "wardrobe_update" = "manual",
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

  const currentVersion = user?.styleDna?.version ?? 0;
  const nextVersion = currentVersion + 1;

  // Upsert record with GENERATING status
  await prisma.styleDNA.upsert({
    where: { userId },
    create: {
      userId,
      version: nextVersion,
      archetypeName: "",
      description: "",
      traits: [],
      colorPalette: [],
      imagePromptHints: [],
      textStatus: "GENERATING",
      moodboardStatus: "PENDING",
      generationTrigger: trigger,
    },
    update: {
      version: nextVersion,
      archetypeName: "",
      description: "",
      traits: [],
      colorPalette: [],
      imagePromptHints: [],
      textStatus: "GENERATING",
      moodboardStatus: "PENDING",
      moodboardUrl: null,
      generatedAt: null,
      moodboardGeneratedAt: null,
      generationTrigger: trigger,
    },
  });

  // Phase 1: Text generation
  let dnaText: StyleDnaText;
  const wardrobeSummary = await computeWardrobeSummary(userId);
  const textPrompt = buildStyleDnaTextPrompt(prefs, wardrobeSummary);
  const promptHash = crypto.createHash("sha256").update(textPrompt).digest("hex");

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
      promptHash,
      textStatus: "READY",
      moodboardStatus: "GENERATING",
      generatedAt: new Date(),
      promptSnapshot: { prefs, wardrobeSummary: wardrobeSummary ?? null },
    },
  });

  // Phase 2: Image generation
  const imagePrompt = buildStyleDnaImagePrompt(dnaText);

  // Check if an identical image was previously generated (cache hit)
  const imagePromptHash = crypto.createHash("sha256").update(imagePrompt).digest("hex");
  const cachedDna = await prisma.styleDNA.findFirst({
    where: {
      promptHash: imagePromptHash,
      moodboardStatus: "READY",
      moodboardUrl: { not: null },
      userId: { not: userId },
    },
    select: { moodboardUrl: true },
  });

  if (cachedDna?.moodboardUrl) {
    // Reuse the existing moodboard from another user with identical archetype
    await prisma.styleDNA.update({
      where: { userId },
      data: {
        moodboardUrl: cachedDna.moodboardUrl,
        moodboardStatus: "READY",
        moodboardGeneratedAt: new Date(),
        promptHash: imagePromptHash,
      },
    });
    return;
  }

  let moodboardBuffer: Buffer | null = null;
  try {
    moodboardBuffer = await generateMoodboardWithOpenAI(imagePrompt);
  } catch (openAiErr) {
    console.warn("[style-dna] OpenAI image generation failed, trying FLUX:", openAiErr);
    try {
      moodboardBuffer = await generateMoodboardWithFlux(imagePrompt);
    } catch (fluxErr) {
      console.warn("[style-dna] FLUX image generation failed:", fluxErr);
    }
  }

  if (moodboardBuffer) {
    try {
      const storagePath = await uploadMoodboard(userId, nextVersion, moodboardBuffer);
      await prisma.styleDNA.update({
        where: { userId },
        data: {
          moodboardUrl: storagePath,
          moodboardStatus: "READY",
          moodboardGeneratedAt: new Date(),
          promptHash: imagePromptHash,
        },
      });
    } catch (uploadErr) {
      console.error("[style-dna] Moodboard upload failed:", uploadErr);
      await prisma.styleDNA.update({
        where: { userId },
        data: { moodboardStatus: "FAILED" },
      });
    }
  } else {
    await prisma.styleDNA.update({
      where: { userId },
      data: { moodboardStatus: "FAILED" },
    });
  }
}
