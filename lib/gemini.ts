import sharp from "sharp";
import type { ColorFamily, Formality, Pattern, StyleProfile, WarmthLevel } from "@prisma/client";
import { z } from "zod";

import { getConfig } from "@/lib/appConfig";
import { getGeminiApiKey } from "@/lib/env";

import {
  colorFamilies,
  formalities,
  formatEnumLabel,
  getDefaultSubtypeForKind,
  isValidSubtypeForKind,
  itemKinds,
  patterns,
  styleProfiles,
  warmthLevels,
  type ItemKindValue,
  type ItemSubtypeValue,
  type ItemAttributeValues,
} from "@/lib/itemAttributes";

const DEFAULT_CLASSIFIER_MODEL = "gemini-2.5-flash-lite";
const DEFAULT_RECOMMENDER_MODEL = "gemini-2.5-flash-lite";
const CLASSIFIER_PROMPT_VERSION = "wardrobe-classifier-v1";
const RECOMMENDER_PROMPT_VERSION = "outfit-reranker-v1";
const CLASSIFIER_TIMEOUT_MS = 8000;
const RECOMMENDER_TIMEOUT_MS = 4500;
const MAX_IMAGE_DIMENSION = 384;

type GeminiUsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
};

type GeminiApiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  usageMetadata?: GeminiUsageMetadata;
};

const classifierResponseSchema = z.object({
  kind: z.enum(itemKinds),
  subtype: z.string().trim().min(1),
  colorFamily: z.enum(colorFamilies),
  pattern: z.enum(patterns),
  styleProfile: z.enum(styleProfiles),
  formality: z.enum(formalities),
  warmthLevel: z.enum(warmthLevels),
  visualSummary: z.string().trim().max(80).nullable(),
  confidence: z.number().min(0).max(1),
});

const rerankResponseSchema = z.object({
  chosenCandidateId: z.string().min(1),
  orderedCandidateIds: z.array(z.string().min(1)).min(1),
  reason: z.string().trim().min(1).max(220),
  confidence: z.number().min(0).max(1),
});

export type GeminiWardrobeClassification = z.infer<typeof classifierResponseSchema> & {
  model: string;
  promptVersion: string;
};

export type GeminiRerankedChoice = z.infer<typeof rerankResponseSchema> & {
  model: string;
  promptVersion: string;
};

export type RerankCandidate = {
  candidateId: string;
  weatherScore: number;
  recentWearCount: number;
  top: {
    subtype: string;
    colorFamily: ColorFamily;
    pattern: Pattern;
    styleProfile: StyleProfile;
    formality: Formality;
    warmthLevel: WarmthLevel;
    visualSummary: string | null;
  };
  bottom: {
    subtype: string;
    colorFamily: ColorFamily;
    pattern: Pattern;
    styleProfile: StyleProfile;
    formality: Formality;
    warmthLevel: WarmthLevel;
    visualSummary: string | null;
  };
  shoe: {
    subtype: string;
    colorFamily: ColorFamily;
    pattern: Pattern;
    styleProfile: StyleProfile;
    formality: Formality;
    warmthLevel: WarmthLevel;
    visualSummary: string | null;
  };
};

class GeminiApiError extends Error {
  status?: number;
  code: string;

  constructor(message: string, code: string, status?: number) {
    super(message);
    this.name = "GeminiApiError";
    this.status = status;
    this.code = code;
  }
}

function isEnabledFlag(value: string | undefined) {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export async function isAiClassificationEnabled() {
  return isEnabledFlag(await getConfig("ENABLE_AI_CLASSIFICATION")) && Boolean(getGeminiApiKey());
}

export async function isAiRecommenderEnabled() {
  return isEnabledFlag(await getConfig("ENABLE_AI_RECOMMENDER")) && Boolean(getGeminiApiKey());
}

export async function getAiClassificationDisabledReason() {
  if (!isEnabledFlag(await getConfig("ENABLE_AI_CLASSIFICATION")))
    return "ENABLE_AI_CLASSIFICATION is not enabled";
  if (!getGeminiApiKey()) return "GEMINI_API_KEY is missing";
  return null;
}

export async function getAiRecommenderDisabledReason() {
  if (!isEnabledFlag(await getConfig("ENABLE_AI_RECOMMENDER")))
    return "ENABLE_AI_RECOMMENDER is not enabled";
  if (!getGeminiApiKey()) return "GEMINI_API_KEY is missing";
  return null;
}

export async function getClassifierModel() {
  return (await getConfig("GEMINI_CLASSIFIER_MODEL"))?.trim() || DEFAULT_CLASSIFIER_MODEL;
}

export async function getRecommenderModel() {
  return (await getConfig("GEMINI_RECOMMENDER_MODEL"))?.trim() || DEFAULT_RECOMMENDER_MODEL;
}

export function getClassifierPromptVersion() {
  return CLASSIFIER_PROMPT_VERSION;
}

export function getRecommenderPromptVersion() {
  return RECOMMENDER_PROMPT_VERSION;
}

export function buildFallbackVisualSummary(args: {
  subtype: string;
  attributes: Partial<ItemAttributeValues>;
}) {
  const parts = [
    args.attributes.colorFamily && args.attributes.colorFamily !== "UNKNOWN"
      ? formatEnumLabel(args.attributes.colorFamily).toLowerCase()
      : null,
    args.attributes.pattern &&
    args.attributes.pattern !== "UNKNOWN" &&
    args.attributes.pattern !== "SOLID"
      ? formatEnumLabel(args.attributes.pattern).toLowerCase()
      : null,
    args.attributes.styleProfile && args.attributes.styleProfile !== "UNKNOWN"
      ? formatEnumLabel(args.attributes.styleProfile).toLowerCase()
      : null,
    args.attributes.formality && args.attributes.formality !== "UNKNOWN"
      ? formatEnumLabel(args.attributes.formality).toLowerCase()
      : null,
    args.subtype.replaceAll("_", " ").toLowerCase(),
  ].filter((value): value is string => Boolean(value));

  return parts.join(" ").slice(0, 80);
}

function logUsage(
  task: "classification" | "rerank",
  model: string,
  usageMetadata?: GeminiUsageMetadata,
) {
  if (!usageMetadata) return;
  console.info(
    `[gemini:${task}]`,
    JSON.stringify({
      model,
      promptTokens: usageMetadata.promptTokenCount,
      outputTokens: usageMetadata.candidatesTokenCount,
      totalTokens: usageMetadata.totalTokenCount,
    }),
  );
}

function getTextResponse(json: GeminiApiResponse, task?: string) {
  let text = json.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new GeminiApiError("Gemini returned no text.", "EMPTY_RESPONSE");
  }

  text = text
    .replace(/^```json\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/^```\s*/i, "")
    .trim();

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    text = text.slice(firstBrace, lastBrace + 1);
  }

  if (process.env.DEBUG_GEMINI === "1" || process.env.NODE_ENV !== "production") {
    console.info(`[gemini:${task ?? "unknown"}] raw_response:`, text.slice(0, 500));
  }

  return text;
}

function normalizeErrorCode(error: unknown) {
  if (error instanceof GeminiApiError) return error.code;
  if (error instanceof Error && error.name === "TimeoutError") return "TIMEOUT";
  if (error instanceof Error && error.name === "AbortError") return "TIMEOUT";
  return "UNKNOWN";
}

export function getGeminiErrorCode(error: unknown) {
  return normalizeErrorCode(error);
}

export function getGeminiErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function generateStructuredJson<T>(args: {
  model: string;
  timeoutMs: number;
  contents: Array<{
    parts: Array<
      | { text: string }
      | {
          inline_data: {
            mime_type: string;
            data: string;
          };
          media_resolution?: {
            level: "MEDIA_RESOLUTION_LOW";
          };
        }
    >;
  }>;
  responseJsonSchema: Record<string, unknown>;
  task: "classification" | "rerank";
}) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new GeminiApiError("Missing Gemini API key.", "MISSING_API_KEY");
  }

  const RATE_LIMIT_RETRY_DELAYS_MS = [800, 2000];
  let lastError: GeminiApiError | undefined;

  for (let attempt = 0; attempt <= RATE_LIMIT_RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_RETRY_DELAYS_MS[attempt - 1]));
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(args.model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: args.contents,
          generationConfig: {
            responseMimeType: "application/json",
            responseJsonSchema: args.responseJsonSchema,
            temperature: 0.1,
            topP: 0.1,
            maxOutputTokens: args.task === "classification" ? 220 : 600,
            thinkingConfig: {
              thinkingBudget: 0,
            },
          },
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(args.timeoutMs),
      },
    );

    if (response.ok) {
      const json = (await response.json()) as GeminiApiResponse;
      logUsage(args.task, args.model, json.usageMetadata);
      return JSON.parse(getTextResponse(json, args.task)) as T;
    }

    const code =
      response.status === 401 || response.status === 403
        ? "UNAUTHORIZED"
        : response.status === 408
          ? "TIMEOUT"
          : response.status === 429
            ? "RATE_LIMITED"
            : response.status >= 500
              ? "UPSTREAM_ERROR"
              : "BAD_REQUEST";
    const err = new GeminiApiError(
      `Gemini request failed with ${response.status}.`,
      code,
      response.status,
    );

    if (code !== "RATE_LIMITED") throw err;
    lastError = err;
  }

  throw lastError!;
}

async function toGeminiThumbnail(imageBytes: Buffer) {
  const resized = await sharp(imageBytes, { animated: false })
    .rotate()
    .resize({
      width: MAX_IMAGE_DIMENSION,
      height: MAX_IMAGE_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer();

  return {
    mimeType: "image/jpeg",
    base64: resized.toString("base64"),
  };
}

export async function classifyWardrobeImage(args: {
  imageBytes: Buffer;
  manualKind?: ItemKindValue | null;
  manualSubtype?: string | null;
}) {
  const model = await getClassifierModel();
  const thumbnail = await toGeminiThumbnail(args.imageBytes);

  const json = await generateStructuredJson<z.infer<typeof classifierResponseSchema>>({
    model,
    timeoutMs: CLASSIFIER_TIMEOUT_MS,
    task: "classification",
    responseJsonSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: itemKinds },
        subtype: { type: "string" },
        colorFamily: { type: "string", enum: colorFamilies },
        pattern: { type: "string", enum: patterns },
        styleProfile: { type: "string", enum: styleProfiles },
        formality: { type: "string", enum: formalities },
        warmthLevel: { type: "string", enum: warmthLevels },
        visualSummary: {
          type: ["string", "null"],
          description: "Short literal description. Max 12 words.",
        },
        confidence: { type: "number" },
      },
      required: [
        "kind",
        "subtype",
        "colorFamily",
        "pattern",
        "styleProfile",
        "formality",
        "warmthLevel",
        "visualSummary",
        "confidence",
      ],
    },
    contents: [
      {
        parts: [
          {
            text:
              `Classify one wardrobe item image for a fashion app. ` +
              `Respect these fixed labels only. If uncertain, use UNKNOWN. ` +
              `Allowed kinds: ${itemKinds.join(", ")}. ` +
              `Allowed subtypes for TOP: tshirt, shirt, long_sleeve, hoodie, sweater, jacket. ` +
              `Allowed subtypes for BOTTOM: shorts, jeans. ` +
              `Allowed subtypes for SHOE: sneakers, boots, sandals. ` +
              (args.manualKind ? `The user suggested kind=${args.manualKind}. ` : "") +
              (args.manualSubtype ? `The user suggested subtype=${args.manualSubtype}. ` : "") +
              `Do not guess brand, gender, or occasion. ` +
              `visualSummary must be short, literal, and under 12 words.`,
          },
          {
            inline_data: {
              mime_type: thumbnail.mimeType,
              data: thumbnail.base64,
            },
            media_resolution: {
              level: "MEDIA_RESOLUTION_LOW",
            },
          },
        ],
      },
    ],
  });

  const parsed = classifierResponseSchema.parse({
    ...json,
    subtype: json.subtype?.trim().toLowerCase() || "",
    visualSummary: json.visualSummary?.trim() || null,
  });

  const safeSubtype = isValidSubtypeForKind(parsed.kind, parsed.subtype)
    ? (parsed.subtype as ItemSubtypeValue)
    : getDefaultSubtypeForKind(parsed.kind);

  return {
    ...parsed,
    subtype: safeSubtype,
    model,
    promptVersion: CLASSIFIER_PROMPT_VERSION,
  } satisfies GeminiWardrobeClassification;
}

export async function rerankOutfitCandidates(args: {
  weather: {
    temperatureC: number;
    precipitationMm: number;
  };
  candidates: RerankCandidate[];
}) {
  const model = await getRecommenderModel();

  const json = await generateStructuredJson<z.infer<typeof rerankResponseSchema>>({
    model,
    timeoutMs: RECOMMENDER_TIMEOUT_MS,
    task: "rerank",
    responseJsonSchema: {
      type: "object",
      properties: {
        chosenCandidateId: {
          type: "string",
          enum: args.candidates.map((candidate) => candidate.candidateId),
        },
        orderedCandidateIds: {
          type: "array",
          description: "Full ordered list of all provided candidates.",
          items: {
            type: "string",
            enum: args.candidates.map((candidate) => candidate.candidateId),
          },
        },
        reason: {
          type: "string",
          description:
            "Why this outfit works, written in a fun Gen-Z tone. 1 sentence, casual and punchy.",
        },
        confidence: { type: "number" },
      },
      required: ["chosenCandidateId", "orderedCandidateIds", "reason", "confidence"],
    },
    contents: [
      {
        parts: [
          {
            text:
              "Choose the best outfit candidate for today. " +
              "Priority order: weather fit first, then cohesive style/color/formality, then avoid recently worn pieces. " +
              "Write the reason in a fun, confident Gen-Z tone — casual, punchy, 1 sentence, no cringe. Think how a stylish friend texts, not a fashion magazine. No hashtags. " +
              "Output ONLY valid JSON matching the schema \u2014 no markdown, no explanation, no extra text. " +
              "Return the full ordered list of all provided candidates. " +
              `Example: ${JSON.stringify({
                chosenCandidateId: args.candidates[0]?.candidateId || "ID_1",
                orderedCandidateIds: [
                  args.candidates[0]?.candidateId || "ID_1",
                  args.candidates[1]?.candidateId || "ID_2",
                  args.candidates[2]?.candidateId || "ID_3",
                ],
                reason:
                  "This fit is giving effortless — the colors just work and it's lowkey perfect for the weather.",
                confidence: 0.85,
              })}`,
          },
          {
            text: JSON.stringify({
              weather: args.weather,
              candidates: args.candidates,
            }),
          },
        ],
      },
    ],
  });

  const parsed = rerankResponseSchema.parse(json);
  return {
    ...parsed,
    model,
    promptVersion: RECOMMENDER_PROMPT_VERSION,
  } satisfies GeminiRerankedChoice;
}
