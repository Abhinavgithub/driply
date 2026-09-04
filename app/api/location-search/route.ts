import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withAuth } from "@/lib/api-guard";
import { searchLocations } from "@/lib/openMeteo";

const QuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
});

export const GET = withAuth(
  async (_user, req: NextRequest) => {
    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      q: searchParams.get("q"),
    });

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query. Expected q." }, { status: 400 });
    }

    try {
      return NextResponse.json({ results: await searchLocations(parsed.data.q) });
    } catch {
      return NextResponse.json({ error: "Failed to search locations." }, { status: 502 });
    }
  },
  { key: (u) => `location-search:get:${u.appUser.id}`, max: 20 },
);
