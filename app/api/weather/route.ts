import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { fetchWeather } from "@/lib/openMeteo";

const QuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
});

export async function GET(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    lat: searchParams.get("lat"),
    lon: searchParams.get("lon"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid lat/lon. Expected numbers in range." },
      { status: 400 },
    );
  }

  const { lat, lon } = parsed.data;

  try {
    return NextResponse.json(await fetchWeather(lat, lon));
  } catch {
    return NextResponse.json({ error: "Failed to fetch weather" }, { status: 502 });
  }
}
