import sharp from "sharp";

const DEFAULT_TRYON_MODEL = "gemini-2.5-flash-image";
const TRYON_TIMEOUT_MS = 45000;
const MAX_TRYON_PHOTO_DIMENSION = 768;
const MAX_CLOTHING_DIMENSION = 384;

type GeminiResponsePart = {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
};

type GeminiImageResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiResponsePart[];
    };
    finishReason?: string;
  }>;
};

export type TryOnResult = {
  imageBase64: string;
  mimeType: string;
};

export class TryOnApiError extends Error {
  code: string;
  status?: number;

  constructor(message: string, code: string, status?: number) {
    super(message);
    this.name = "TryOnApiError";
    this.code = code;
    this.status = status;
  }
}

function isEnabledFlag(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function isAiTryOnEnabled(): boolean {
  return isEnabledFlag(process.env.ENABLE_AI_TRYON) && Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function getTryOnModel(): string {
  return process.env.GEMINI_TRYON_MODEL?.trim() || DEFAULT_TRYON_MODEL;
}

export function normalizeTryOnErrorCode(error: unknown): string {
  if (error instanceof TryOnApiError) return error.code;
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return "TIMEOUT";
  return "UNKNOWN";
}

async function resizeToJpeg(bytes: Buffer, maxDimension: number): Promise<string> {
  const resized = await sharp(bytes, { animated: false })
    .rotate()
    .resize({
      width: maxDimension,
      height: maxDimension,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();

  return resized.toString("base64");
}

export async function generateTryOnImage(args: {
  tryOnPhotoBytes: Buffer;
  clothingImages: Array<{ bytes: Buffer }>;
  prompt: string;
}): Promise<TryOnResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new TryOnApiError("Missing Gemini API key.", "MISSING_API_KEY");
  }

  const model = getTryOnModel();

  const [tryOnBase64, ...clothingBase64List] = await Promise.all([
    resizeToJpeg(args.tryOnPhotoBytes, MAX_TRYON_PHOTO_DIMENSION),
    ...args.clothingImages.map((img) => resizeToJpeg(img.bytes, MAX_CLOTHING_DIMENSION)),
  ]);

  const imageParts = [tryOnBase64, ...clothingBase64List].map((data) => ({
    inline_data: { mime_type: "image/jpeg", data },
  }));

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: args.prompt },
              ...imageParts,
            ],
          },
        ],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(TRYON_TIMEOUT_MS),
    },
  );

  if (!response.ok) {
    const code =
      response.status === 401 || response.status === 403
        ? "UNAUTHORIZED"
        : response.status === 429
          ? "RATE_LIMITED"
          : response.status >= 500
            ? "UPSTREAM_ERROR"
            : "BAD_REQUEST";
    throw new TryOnApiError(`Gemini image generation failed: ${response.status}`, code, response.status);
  }

  const json = (await response.json()) as GeminiImageResponse;
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData?.data && p.inlineData?.mimeType);

  if (!imagePart?.inlineData) {
    const finishReason = json.candidates?.[0]?.finishReason;
    const code = finishReason === "SAFETY" ? "SAFETY_BLOCKED" : "EMPTY_RESPONSE";
    throw new TryOnApiError("Gemini returned no image output.", code);
  }

  console.info("[gemini:tryon] image generated", {
    model,
    mimeType: imagePart.inlineData.mimeType,
    sizeBytes: Math.round((imagePart.inlineData.data.length * 3) / 4),
  });

  return {
    imageBase64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType,
  };
}
