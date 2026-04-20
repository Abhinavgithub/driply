import { InferenceClient } from "@huggingface/inference";

import { TryOnApiError } from "@/lib/gemini-tryon";
import type { TryOnResult } from "@/lib/gemini-tryon";

const FLUX_MODEL = "black-forest-labs/FLUX.1-schnell";
const FLUX_INFERENCE_STEPS = 5;
const FLUX_TIMEOUT_MS = 60000;

export type { TryOnResult };

export type TryOnProvider = "gemini" | "flux";

export function getTryOnProvider(): TryOnProvider {
  const raw = process.env.TRYON_PROVIDER?.trim().toLowerCase();
  return raw === "flux" ? "flux" : "gemini";
}

function isEnabledFlag(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function isFluxTryOnEnabled(): boolean {
  return isEnabledFlag(process.env.ENABLE_AI_TRYON) && Boolean(process.env.HF_TOKEN?.trim());
}

export async function generateFluxTryOnImage(args: { prompt: string }): Promise<TryOnResult> {
  const token = process.env.HF_TOKEN?.trim();
  if (!token) {
    throw new TryOnApiError("Missing HuggingFace token.", "MISSING_API_KEY");
  }

  const client = new InferenceClient(token);

  let blob: Blob;
  try {
    const timer = setTimeout(() => { /* no-op; HF SDK has its own timeout */ }, FLUX_TIMEOUT_MS);
    try {
      blob = await client.textToImage(
        {
          provider: "nscale",
          model: FLUX_MODEL,
          inputs: args.prompt,
          parameters: { num_inference_steps: FLUX_INFERENCE_STEPS },
        },
        { outputType: "blob" },
      );
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      throw new TryOnApiError("FLUX request timed out.", "TIMEOUT");
    }
    const msg = error instanceof Error ? error.message : String(error);
    const code = msg.includes("429") ? "RATE_LIMITED" : msg.includes("401") || msg.includes("403") ? "UNAUTHORIZED" : "UPSTREAM_ERROR";
    throw new TryOnApiError(`FLUX generation failed: ${msg}`, code);
  }

  const arrayBuffer = await blob.arrayBuffer();
  const imageBase64 = Buffer.from(arrayBuffer).toString("base64");
  const mimeType = blob.type || "image/jpeg";

  console.info("[flux:tryon] image generated", {
    model: FLUX_MODEL,
    mimeType,
    sizeBytes: arrayBuffer.byteLength,
  });

  return { imageBase64, mimeType };
}
