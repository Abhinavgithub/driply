import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type CheckResult = { ok: boolean; latencyMs: number; error?: string };

async function withTiming<T>(fn: () => Promise<T>): Promise<{ result: T; latencyMs: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, latencyMs: Date.now() - start };
}

export async function GET() {
  const checks: Record<string, CheckResult> = {};
  let overallOk = true;

  // 1) DB: SELECT 1 — catches P1001 IPv6 partition and general DB down
  try {
    const { latencyMs } = await withTiming(() => prisma.$queryRaw`SELECT 1`);
    checks.db = { ok: true, latencyMs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    checks.db = { ok: false, latencyMs: 0, error: message.slice(0, 200) };
    overallOk = false;
  }

  // 2) Storage: getBucket — verifies Supabase Storage + service-role key valid, bucket exists and is not misconfigured
  // Does not create objects; read-only metadata fetch.
  try {
    const { latencyMs } = await withTiming(async () => {
      const admin = getSupabaseAdminClient();
      const { data, error } = await admin.storage.getBucket(
        process.env.SUPABASE_STORAGE_BUCKET ?? "wardrobe",
      );
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Bucket not found");
      return data;
    });
    checks.storage = { ok: true, latencyMs };
    // Optional: surface public vs private without failing - useful for signed-URL TTL tradeoff
    // but not a readiness gate.
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    checks.storage = { ok: false, latencyMs: 0, error: message.slice(0, 200) };
    overallOk = false;
  }

  const status = overallOk ? 200 : 503;
  return NextResponse.json(
    {
      status: overallOk ? "ready" : "degraded",
      timestamp: new Date().toISOString(),
      checks,
    },
    { status },
  );
}
