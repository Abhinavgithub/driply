import { NextRequest, NextResponse } from "next/server";

import { fetchWeather } from "@/lib/openMeteo";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const latRaw = searchParams.get("lat");
  const lonRaw = searchParams.get("lon");

  const lat = latRaw ? Number(latRaw) : NaN;
  const lon = lonRaw ? Number(lonRaw) : NaN;

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json(
      { error: "Invalid lat/lon. Expected numbers." },
      { status: 400 },
    );
  }

  let out;
  try {
    out = await fetchWeather(lat, lon);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch weather" },
      { status: 502 },
    );
  }
  return NextResponse.json(out);
}
