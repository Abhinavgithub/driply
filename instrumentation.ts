/**
 * Runs once when a new server instance starts (Node runtime only). We validate
 * environment configuration here so a misconfigured deploy fails at boot — with
 * the complete list of missing vars — instead of throwing mid-request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { validateEnv } = await import("@/lib/env");
  try {
    const { warnings } = validateEnv();
    for (const warning of warnings) {
      console.warn(`[env] ${warning}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[env] ${message}`);
    if (process.env.NODE_ENV === "production") throw err;
    for (const line of message.split("\n")) {
      console.warn(`[env] ${line}`);
    }
  }
}
