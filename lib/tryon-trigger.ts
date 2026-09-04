import { after } from "next/server";

import { getAppUrl, getTryOnWorkerSecret } from "@/lib/env";
import { processTryOnJob } from "@/lib/tryon-job";

// Kept separate from lib/tryon-job.ts so the Netlify background function can
// import the job processor without dragging next/server into its bundle.

/**
 * Hands a freshly created job to the background worker. On Netlify this POSTs
 * to the dedicated background function (15-minute limit); locally — or if the
 * worker is unreachable/unconfigured — it falls back to best-effort
 * post-response processing via after().
 */
export async function triggerTryOnJobProcessing(jobId: string): Promise<void> {
  const secret = getTryOnWorkerSecret();
  // Prefer the canonical app URL (custom domain); fall back to Netlify's
  // runtime deploy URL. Absent in plain local dev, so the gate below also
  // keeps localhost on the after() path; `netlify dev` sets URL and emulates
  // the worker. (NETLIFY, CONTEXT, DEPLOY_URL etc. are build-time only.)
  let base: string | undefined;
  try {
    base = getAppUrl();
  } catch {
    base = undefined;
  }
  if (!base) base = process.env.URL?.trim() || undefined;

  if (secret && base) {
    try {
      const res = await fetch(`${base}/.netlify/functions/tryon-process-background`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-tryon-worker-secret": secret },
        body: JSON.stringify({ jobId }),
        signal: AbortSignal.timeout(5000),
      });
      // Background functions acknowledge with 202 before doing the work.
      if (res.status === 202 || res.ok) return;
      console.warn("[tryon-trigger] worker rejected job, falling back to after()", {
        jobId,
        status: res.status,
      });
    } catch (error) {
      const timedOut =
        error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      console.warn(
        timedOut
          ? "[tryon-trigger] worker ack timed out after 5s, falling back to after()"
          : "[tryon-trigger] worker unreachable, falling back to after()",
        {
          jobId,
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  } else if (!secret) {
    console.warn("[tryon-trigger] TRYON_WORKER_SECRET unset, using after() fallback", { jobId });
  }

  after(() => processTryOnJob(jobId));
}
