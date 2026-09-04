import { generateTryOnImage, normalizeTryOnErrorCode } from "@/lib/gemini-tryon";
import { generateFluxTryOnImage } from "@/lib/flux-tryon";
import { generateOpenAITryOnImage } from "@/lib/openai-tryon";
import { prisma } from "@/lib/prisma";
import { downloadStorageObject } from "@/lib/profile-media";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseStorageBucket } from "@/lib/supabase/env";
import {
  buildFluxTryOnPrompt,
  buildOpenAITryOnPrompt,
  buildTryOnPrompt,
  type TryOnPromptItem,
} from "@/lib/tryon-prompt";

// 10-minute TTL (tradeoff-2): bounds the exposure window of leaked URLs;
// the client re-signs on poll and ItemImage refreshes on expiry.
const SIGNED_RESULT_TTL_SECONDS = 10 * 60;
const JOB_RETENTION_DAYS = 7;

function tryOnResultPath(userId: string, jobId: string, mimeType: string) {
  const ext = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
  return `tryon/${userId}/${jobId}.${ext}`;
}

export async function getSignedTryOnResultUrl(path: string): Promise<string | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from(getSupabaseStorageBucket())
    .createSignedUrl(path, SIGNED_RESULT_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Deletes this user's try-on jobs older than the retention window, including
 * their generated images in Storage. Called opportunistically on job creation.
 */
export async function pruneOldTryOnJobs(userId: string): Promise<void> {
  const cutoff = new Date(Date.now() - JOB_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  // Bounded batch: called opportunistically on creation, so one pass per
  // creation is enough; an uncapped findMany could OOM on abuse.
  const stale = await prisma.tryOnJob.findMany({
    where: { userId, createdAt: { lt: cutoff } },
    select: { id: true, resultPath: true },
    take: 100,
  });
  if (stale.length === 0) return;

  const paths = stale.map((job) => job.resultPath).filter((p): p is string => Boolean(p));
  if (paths.length > 0) {
    const { error } = await getSupabaseAdminClient()
      .storage.from(getSupabaseStorageBucket())
      .remove(paths);
    if (error) {
      console.warn("[tryon-job] prune storage remove failed (rows still deleted)", {
        error: error.message,
      });
    }
  }
  await prisma.tryOnJob.deleteMany({ where: { id: { in: stale.map((job) => job.id) } } });
}

/**
 * Runs a try-on job end to end: claims it, downloads source photos, calls the
 * configured provider, stores the result image in Storage, and records the
 * outcome on the job row. Safe to call multiple times — the atomic
 * PENDING→RUNNING claim makes duplicate invocations no-ops.
 */
export async function processTryOnJob(jobId: string): Promise<void> {
  const claimed = await prisma.tryOnJob.updateMany({
    where: { id: jobId, status: "PENDING" },
    data: { status: "RUNNING", startedAt: new Date() },
  });
  if (claimed.count === 0) return;

  const job = await prisma.tryOnJob.findUnique({ where: { id: jobId } });
  if (!job) return;

  try {
    const [user, items] = await Promise.all([
      prisma.user.findUnique({
        where: { id: job.userId },
        select: { displayName: true, aiTryOnPhotoUrl: true },
      }),
      prisma.item.findMany({
        where: {
          id: { in: [job.topItemId, job.bottomItemId, job.shoeItemId] },
          userId: job.userId,
        },
        select: {
          id: true,
          kind: true,
          subtype: true,
          colorFamily: true,
          visualSummary: true,
          photoUrl: true,
        },
      }),
    ]);

    const top = items.find((i) => i.id === job.topItemId);
    const bottom = items.find((i) => i.id === job.bottomItemId);
    const shoe = items.find((i) => i.id === job.shoeItemId);
    if (!user || !top || !bottom || !shoe) {
      await failJob(jobId, "items_unavailable");
      return;
    }

    const itemMeta: readonly TryOnPromptItem[] = [
      {
        kind: top.kind,
        subtype: top.subtype,
        colorFamily: top.colorFamily,
        visualSummary: top.visualSummary,
      },
      {
        kind: bottom.kind,
        subtype: bottom.subtype,
        colorFamily: bottom.colorFamily,
        visualSummary: bottom.visualSummary,
      },
      {
        kind: shoe.kind,
        subtype: shoe.subtype,
        colorFamily: shoe.colorFamily,
        visualSummary: shoe.visualSummary,
      },
    ];

    let result: { imageBase64: string; mimeType: string };

    if (job.provider === "FLUX") {
      result = await generateFluxTryOnImage({ prompt: buildFluxTryOnPrompt({ items: itemMeta }) });
    } else {
      const [tryOnPhotoBytes, topBytes, bottomBytes, shoeBytes] = await Promise.all([
        downloadStorageObject(user.aiTryOnPhotoUrl),
        downloadStorageObject(top.photoUrl),
        downloadStorageObject(bottom.photoUrl),
        downloadStorageObject(shoe.photoUrl),
      ]);

      if (!tryOnPhotoBytes) {
        await failJob(jobId, "try_on_photo_unavailable");
        return;
      }

      // P0-5: require the full outfit — generating from a partial set
      // produces a misleading image (e.g. top only).
      if (!topBytes || !bottomBytes || !shoeBytes) {
        await failJob(jobId, "clothing_images_unavailable");
        return;
      }
      const clothingImages = [topBytes, bottomBytes, shoeBytes].map((bytes) => ({ bytes }));

      result =
        job.provider === "OPENAI"
          ? await generateOpenAITryOnImage({
              tryOnPhotoBytes,
              clothingImages,
              prompt: buildOpenAITryOnPrompt({ displayName: user.displayName, items: itemMeta }),
            })
          : await generateTryOnImage({
              tryOnPhotoBytes,
              clothingImages,
              prompt: buildTryOnPrompt({ displayName: user.displayName, items: itemMeta }),
            });
    }

    const resultPath = tryOnResultPath(job.userId, job.id, result.mimeType);
    const { error: uploadError } = await getSupabaseAdminClient()
      .storage.from(getSupabaseStorageBucket())
      .upload(resultPath, Buffer.from(result.imageBase64, "base64"), {
        contentType: result.mimeType,
        // No upsert: jobId paths are unique; overwriting would mask a
        // collision/retry bug instead of surfacing it.
        upsert: false,
      });
    if (uploadError) throw new Error(`Result upload failed: ${uploadError.message}`);

    // Status-guarded so a concurrent failJob can't overwrite READY (P1-4).
    const completed = await prisma.tryOnJob.updateMany({
      where: { id: jobId, status: "RUNNING" },
      data: {
        status: "READY",
        resultPath,
        resultMimeType: result.mimeType,
        errorCode: null,
        completedAt: new Date(),
      },
    });
    if (completed.count === 0) {
      console.warn("[tryon-job] job left RUNNING by a concurrent update", { jobId });
    }
  } catch (error) {
    const code = normalizeTryOnErrorCode(error);
    console.warn("[tryon-job] generation failed", {
      jobId,
      provider: job.provider,
      code,
      error: error instanceof Error ? error.message : String(error),
    });
    await failJob(jobId, code);
  }
}

async function failJob(jobId: string, errorCode: string): Promise<void> {
  // Status-guarded so a late failure can't overwrite a concurrent READY (P1-4).
  await prisma.tryOnJob.updateMany({
    where: { id: jobId, status: { in: ["PENDING", "RUNNING"] } },
    data: { status: "FAILED", errorCode, completedAt: new Date() },
  });
}
