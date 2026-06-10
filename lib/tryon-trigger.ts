import { after } from "next/server";

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
  const secret = process.env.TRYON_WORKER_SECRET?.trim();
  // URL is one of the few read-only env vars Netlify exposes to functions at
  // runtime (NETLIFY, CONTEXT, DEPLOY_URL etc. are build-time only — see
  // docs.netlify.com/functions/environment-variables). It is absent in plain
  // local dev, so this gate also keeps localhost on the after() path; running
  // under `netlify dev` sets it and emulates the worker.
  const base = process.env.URL?.trim();

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
      console.warn("[tryon-trigger] worker unreachable, falling back to after()", {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  after(() => processTryOnJob(jobId));
}
