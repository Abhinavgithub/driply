import { Prisma, TryOnProvider } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { withAuth } from "@/lib/api-guard";
import { isAiTryOnEnabled } from "@/lib/gemini-tryon";
import { getTryOnProvider, isFluxTryOnEnabled } from "@/lib/flux-tryon";
import { isOpenAITryOnEnabled } from "@/lib/openai-tryon";
import { prisma } from "@/lib/prisma";
import { getSignedTryOnResultUrl, pruneOldTryOnJobs } from "@/lib/tryon-job";
import { triggerTryOnJobProcessing } from "@/lib/tryon-trigger";

const CreateSchema = z.object({
  topItemId: z.string().min(1),
  bottomItemId: z.string().min(1),
  shoeItemId: z.string().min(1),
});

// Generation takes 45–120s depending on provider; a job stuck in
// PENDING/RUNNING for longer than this is reported as failed to the client.
const JOB_STALE_AFTER_MS = 4 * 60 * 1000;

/**
 * Creates an async try-on job and returns its id immediately. Generation runs
 * in a background worker (see lib/tryon-job.ts); poll GET /api/tryon?jobId=…
 * for the result.
 */
export const POST = withAuth(
  async (currentUser, req) => {
    const provider = await getTryOnProvider();

    const enabled =
      provider === "flux"
        ? await isFluxTryOnEnabled()
        : provider === "openai"
          ? await isOpenAITryOnEnabled()
          : await isAiTryOnEnabled();
    if (!enabled) {
      return NextResponse.json({ ok: false, reason: "tryon_disabled" });
    }

    const json = await req.json().catch(() => null);
    const parsed = CreateSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Expected topItemId, bottomItemId, shoeItemId." },
        { status: 400 },
      );
    }

    const userId = currentUser.appUser.id;
    const { topItemId, bottomItemId, shoeItemId } = parsed.data;
    // Prisma enum (P1-3); the lib provider is already constrained to the
    // three known values by getTryOnProvider().
    const providerEnum = TryOnProvider[provider.toUpperCase() as keyof typeof TryOnProvider];

    const userRecord = await prisma.user.findUnique({
      where: { id: userId },
      select: { aiTryOnPhotoUrl: true },
    });

    // FLUX is text-only — no reference photo needed. Gemini and OpenAI require it.
    if ((provider === "gemini" || provider === "openai") && !userRecord?.aiTryOnPhotoUrl) {
      return NextResponse.json({ ok: false, reason: "no_try_on_photo" });
    }

    const ownedCount = await prisma.item.count({
      where: { id: { in: [topItemId, bottomItemId, shoeItemId] }, userId },
    });
    if (ownedCount !== 3) {
      return NextResponse.json({ error: "One or more items not found." }, { status: 404 });
    }

    // Release dead workers' slots first: a PENDING/RUNNING job older than the
    // stale threshold will never complete (GET reports timed_out without
    // changing status), and the partial unique index would otherwise make
    // every retry collide and return the same unusable row forever (P1).
    const staleCutoff = new Date(Date.now() - JOB_STALE_AFTER_MS);
    await prisma.tryOnJob.updateMany({
      where: {
        userId,
        topItemId,
        bottomItemId,
        shoeItemId,
        provider: providerEnum,
        status: { in: ["PENDING", "RUNNING"] },
        createdAt: { lt: staleCutoff },
      },
      data: { status: "FAILED", errorCode: "timed_out", completedAt: new Date() },
    });

    // The client retries on failure; reuse an in-flight job for the same
    // outfit instead of spawning a duplicate generation.
    const existing = await prisma.tryOnJob.findFirst({
      where: {
        userId,
        topItemId,
        bottomItemId,
        shoeItemId,
        provider: providerEnum,
        status: { in: ["PENDING", "RUNNING"] },
        createdAt: { gte: new Date(Date.now() - JOB_STALE_AFTER_MS) },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ ok: true, jobId: existing.id, status: "pending" });
    }

    await pruneOldTryOnJobs(userId).catch(() => {});

    // Race-proof: concurrent POSTs that both miss `existing` collide on the
    // partial unique index (TryOnJob_inflight_outfit_idx); the loser reuses
    // the winner instead of spawning a duplicate generation (P1-4).
    let jobId: string;
    try {
      const job = await prisma.tryOnJob.create({
        data: { userId, topItemId, bottomItemId, shoeItemId, provider: providerEnum },
        select: { id: true },
      });
      jobId = job.id;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const winner = await prisma.tryOnJob.findFirst({
          where: {
            userId,
            topItemId,
            bottomItemId,
            shoeItemId,
            provider: providerEnum,
            status: { in: ["PENDING", "RUNNING"] },
          },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
        if (winner) {
          return NextResponse.json({ ok: true, jobId: winner.id, status: "pending" });
        }
      }
      throw err;
    }

    await triggerTryOnJobProcessing(jobId);

    return NextResponse.json({ ok: true, jobId, status: "pending" });
  },
  { key: (u) => `tryon:post:${u.appUser.id}`, max: 10, failClosed: true },
);

/** Poll a try-on job. Returns a signed image URL once the job is READY. */
export const GET = withAuth(
  async (currentUser, req) => {
    const jobId = new URL(req.url).searchParams.get("jobId");
    if (!jobId) {
      return NextResponse.json({ error: "Expected jobId query parameter." }, { status: 400 });
    }

    const job = await prisma.tryOnJob.findFirst({
      where: { id: jobId, userId: currentUser.appUser.id },
    });
    if (!job) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    if (job.status === "READY" && job.resultPath) {
      const imageUrl = await getSignedTryOnResultUrl(job.resultPath);
      if (!imageUrl) {
        return NextResponse.json({ ok: false, status: "failed", reason: "result_unavailable" });
      }
      return NextResponse.json({
        ok: true,
        status: "ready",
        imageUrl,
        mimeType: job.resultMimeType ?? "image/png",
        // Lowercase keeps the pre-enum API shape stable for clients.
        provider: job.provider.toLowerCase(),
      });
    }

    if (job.status === "FAILED") {
      return NextResponse.json({
        ok: false,
        status: "failed",
        reason: job.errorCode ?? "generation_failed",
      });
    }

    // A worker that died mid-job leaves the row PENDING/RUNNING forever;
    // report it as failed once it is clearly past any provider timeout.
    if (job.createdAt.getTime() < Date.now() - JOB_STALE_AFTER_MS) {
      return NextResponse.json({ ok: false, status: "failed", reason: "timed_out" });
    }

    return NextResponse.json({
      ok: true,
      status: job.status === "RUNNING" ? "running" : "pending",
    });
  },
  { key: (u) => `tryon:get:${u.appUser.id}`, max: 60 },
);
