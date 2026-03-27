import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { searchLocations } from "@/lib/openMeteo";

const QuerySchema = z.object({
  q: z.string().trim().min(1),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    q: searchParams.get("q"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query. Expected q." },
      { status: 400 },
    );
  }

  try {
    const results = await searchLocations(parsed.data.q);
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json(
      { error: "Failed to search locations." },
      { status: 502 },
    );
  }
}
