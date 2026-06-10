// Netlify background function (the "-background" suffix is significant):
// acknowledges with 202 immediately and may run for up to 15 minutes, which
// is what try-on generation (45–120s) needs. Triggered server-side by
// POST /api/tryon via lib/tryon-trigger.ts with a shared secret.
import { processTryOnJob } from "../../lib/tryon-job";

const handler = async (req: Request): Promise<Response> => {
  const secret = process.env.TRYON_WORKER_SECRET?.trim();
  if (!secret || req.headers.get("x-tryon-worker-secret") !== secret) {
    return new Response("Forbidden", { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const jobId = typeof body?.jobId === "string" ? body.jobId : null;
  if (!jobId) {
    return new Response("Expected jobId.", { status: 400 });
  }

  await processTryOnJob(jobId);
  return new Response("ok");
};

export default handler;
