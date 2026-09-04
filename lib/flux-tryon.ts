import { InferenceClient } from "@huggingface/inference";

import { getConfig, isEnabledFlag } from "@/lib/appConfig";
import { getHfToken } from "@/lib/env";

import { TryOnApiError } from "@/lib/gemini-tryon";
import type { TryOnResult } from "@/lib/gemini-tryon";

const FLUX_MODEL = "black-forest-labs/FLUX.1-schnell";
const FLUX_INFERENCE_STEPS = 5;
const FLUX_TIMEOUT_MS = 60000;

export type { TryOnResult };

export type TryOnProvider = "gemini" | "flux" | "openai";

export async function getTryOnProvider(): Promise<TryOnProvider> {
  const raw = (await getConfig("TRYON_PROVIDER"))?.trim().toLowerCase();
  if (raw === "flux") return "flux";
  if (raw === "openai") return "openai";
  return "gemini";
}

export async function isFluxTryOnEnabled(): Promise<boolean> {
  return isEnabledFlag(await getConfig("ENABLE_AI_TRYON")) && Boolean(getHfToken());
}

export async function generateFluxTryOnImage(args: { prompt: string }): Promise<TryOnResult> {
  const token = getHfToken();
  if (!token) {
    throw new TryOnApiError("Missing HuggingFace token.", "MISSING_API_KEY");
  }

  const client = new InferenceClient(token);

  // The HF SDK exposes no abort signal, so bound our wait with a race —
  // without this a hung upstream request outlives the job and leaves it
  // RUNNING until the poller times out (T-02).
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new TryOnApiError("FLUX request timed out.", "TIMEOUT")),
      FLUX_TIMEOUT_MS,
    );
  });
  let blob: Blob;
  try {
    blob = await Promise.race([
      client.textToImage(
        {
          provider: "nscale",
          model: FLUX_MODEL,
          inputs: args.prompt,
          parameters: { num_inference_steps: FLUX_INFERENCE_STEPS },
        },
        { outputType: "blob" },
      ),
      timeoutPromise,
    ]);
  } catch (error) {
    if (error instanceof TryOnApiError) throw error;
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      throw new TryOnApiError("FLUX request timed out.", "TIMEOUT");
    }
    const msg = error instanceof Error ? error.message : String(error);
    // Prefer the SDK's numeric status when present; fall back to message scan.
    const status = (error as { status?: unknown; httpStatusCode?: unknown })?.status;
    const httpStatus =
      typeof status === "number"
        ? status
        : typeof (error as { httpStatusCode?: unknown })?.httpStatusCode === "number"
          ? ((error as { httpStatusCode?: unknown }).httpStatusCode as number)
          : undefined;
    const code =
      httpStatus === 429 || msg.includes("429")
        ? "RATE_LIMITED"
        : httpStatus === 401 || httpStatus === 403 || msg.includes("401") || msg.includes("403")
          ? "UNAUTHORIZED"
          : httpStatus !== undefined && httpStatus >= 500
            ? "UPSTREAM_ERROR"
            : /5\d\d/.test(msg)
              ? "UPSTREAM_ERROR"
              : "UNKNOWN";
    throw new TryOnApiError(`FLUX generation failed: ${msg}`, code, httpStatus);
  } finally {
    if (timeout) clearTimeout(timeout);
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
