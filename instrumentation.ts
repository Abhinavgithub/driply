/**
 * Runs once when a new server instance starts (Node runtime only). We validate
 * environment configuration here so a misconfigured deploy fails at boot — with
 * the complete list of missing vars — instead of throwing mid-request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { validateEnv } = await import("@/lib/env");
  const { warnings } = validateEnv();
  for (const warning of warnings) {
    console.warn(`[env] ${warning}`);
  }
}
