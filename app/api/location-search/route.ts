import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { searchLocations } from "@/lib/openMeteo";

const QuerySchema = z.object({
  q: z.string().trim().min(1),
});

export async function GET(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

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
}
