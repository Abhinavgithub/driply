import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Liveness probe: never touches DB/storage, always 200 if runtime is up.
export function GET() {
  return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() }, { status: 200 });
}
