import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { fetchWeather } from "@/lib/openMeteo";

export async function GET(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

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

  try {
    return NextResponse.json(await fetchWeather(lat, lon));
  } catch {
    return NextResponse.json({ error: "Failed to fetch weather" }, { status: 502 });
  }
}
