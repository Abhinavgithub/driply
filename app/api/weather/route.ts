import { NextResponse } from "next/server";
import { z } from "zod";

import { withAuth } from "@/lib/api-guard";
import { getServerDateKey } from "@/lib/date-utils";
import { fetchDayWeather } from "@/lib/openMeteo";

const QuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const GET = withAuth(
  async (_user, req) => {
    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      lat: searchParams.get("lat"),
      lon: searchParams.get("lon"),
      date: searchParams.get("date") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query params. Expected lat, lon, optional date=YYYY-MM-DD." },
        { status: 400 },
      );
    }

    const { lat, lon, date } = parsed.data;

    try {
      return NextResponse.json(await fetchDayWeather(lat, lon, date ?? getServerDateKey()));
    } catch {
      return NextResponse.json({ error: "Failed to fetch weather" }, { status: 502 });
    }
  },
  { key: (u) => `weather:get:${u.appUser.id}`, max: 30 },
);
