import OpenAI, { toFile } from "openai";
import sharp from "sharp";

import { TryOnApiError, type TryOnResult } from "@/lib/gemini-tryon";
import { getConfig } from "@/lib/appConfig";

const DEFAULT_MODEL = "gpt-image-2";
const TRYON_TIMEOUT_MS = 120000; // gpt-image-2 with 4 input images can take 60-90s
const MAX_TRYON_PHOTO_DIMENSION = 768;
const MAX_CLOTHING_DIMENSION = 384;

function isEnabledFlag(v: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(v?.trim().toLowerCase() ?? "");
}

export async function isOpenAITryOnEnabled(): Promise<boolean> {
  return isEnabledFlag(await getConfig("ENABLE_AI_TRYON")) && Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function getOpenAITryOnModel(): string {
  return process.env.OPENAI_TRYON_MODEL?.trim() || DEFAULT_MODEL;
}

async function resizeToJpegBuffer(bytes: Buffer, maxDim: number): Promise<Buffer> {
  return sharp(bytes, { animated: false })
    .rotate()
    .resize({ width: maxDim, height: maxDim, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();
}

export async function generateOpenAITryOnImage(args: {
  tryOnPhotoBytes: Buffer;
  clothingImages: Array<{ bytes: Buffer }>;
  prompt: string;
}): Promise<TryOnResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new TryOnApiError("Missing OpenAI API key.", "MISSING_API_KEY");

  const model = getOpenAITryOnModel();
  // Pass timeout directly to the client so the SDK properly aborts the HTTP
  // connection on expiry — Promise.race() leaves the request dangling.
  const client = new OpenAI({ apiKey, timeout: TRYON_TIMEOUT_MS, maxRetries: 0 });

  // Resize all images before sending to reduce token cost and latency
  const [tryOnResized, ...clothingResized] = await Promise.all([
    resizeToJpegBuffer(args.tryOnPhotoBytes, MAX_TRYON_PHOTO_DIMENSION),
    ...args.clothingImages.map((img) => resizeToJpegBuffer(img.bytes, MAX_CLOTHING_DIMENSION)),
  ]);

  // Convert Buffers to File-like objects the SDK sends as multipart form data
  // Order: user reference photo first, then clothing items
  const imageFiles = await Promise.all(
    [tryOnResized, ...clothingResized].map((buf, i) =>
      toFile(buf, `image-${i}.jpg`, { type: "image/jpeg" })
    )
  );

  let response: Awaited<ReturnType<typeof client.images.edit>>;
  try {
    response = await client.images.edit({
      model,
      image: imageFiles,
      prompt: args.prompt,
      size: "1024x1536", // portrait — best for full-body try-on
      quality: "medium",
      n: 1,
    });
  } catch (error) {
    if (error instanceof TryOnApiError) throw error;
    const name = error instanceof Error ? error.name : "";
    const msg = error instanceof Error ? error.message : String(error);
    // The SDK throws APIConnectionTimeoutError when the client timeout is reached
    if (name === "APIConnectionTimeoutError" || name === "APIUserAbortError") {
      throw new TryOnApiError("OpenAI try-on timed out.", "TIMEOUT");
    }
    const code = /401|403/.test(msg)
      ? "UNAUTHORIZED"
      : /429/.test(msg)
        ? "RATE_LIMITED"
        : /5\d\d/.test(msg)
          ? "UPSTREAM_ERROR"
          : "UNKNOWN";
    throw new TryOnApiError(`OpenAI image edit failed: ${msg}`, code);
  }

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new TryOnApiError("OpenAI returned no image data.", "EMPTY_RESPONSE");

  console.info("[openai:tryon] image generated", {
    model,
    sizeBytes: Math.round(b64.length * 0.75),
  });

  return { imageBase64: b64, mimeType: "image/png" };
}
