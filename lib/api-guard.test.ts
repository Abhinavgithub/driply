import { describe, it, expect, vi, beforeEach } from "vitest";

import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  getAppUrl: vi.fn(() => "http://localhost:3000"),
}));

import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { withAuth, MAX_JSON_BODY_BYTES } from "@/lib/api-guard";

const mockUser = {
  appUser: { id: "user-1", stylePreferences: null },
  supabaseUser: { id: "user-1" },
} as unknown as Awaited<ReturnType<typeof getCurrentUser>>;

function makeHandler(status = 200, body: unknown = { ok: true }) {
  return vi.fn(async (_user: unknown, req: NextRequest) => {
    // Echo back parsed json to prove forwarding works
    const json = await req.json().catch(() => null);
    const { NextResponse } = await import("next/server");
    return NextResponse.json({ ...((body as object) ?? {}), echoed: json }, { status });
  });
}

function makeRequest(url: string, method: string, headers: Record<string, string>, body?: string) {
  const req = new NextRequest(url, {
    method,
    headers,
    body: body as unknown as BodyInit | undefined,
  });
  return req;
}

describe("withAuth body cap", () => {
  beforeEach(() => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(checkRateLimit).mockResolvedValue(true);
  });

  it("rejects when Content-Length header exceeds limit (fast-path)", async () => {
    const handler = makeHandler();
    const guarded = withAuth(handler);
    const body = JSON.stringify({ a: 1 });
    const req = makeRequest(
      "http://localhost:3000/api/outfits",
      "POST",
      {
        "content-type": "application/json",
        "content-length": String(MAX_JSON_BODY_BYTES + 1),
      },
      body,
    );

    const res = await guarded(req);
    expect(res.status).toBe(413);
    expect(handler).not.toHaveBeenCalled();
  });

  it("streams chunked body without Content-Length and rejects at >100KB (P1)", async () => {
    const handler = makeHandler();
    const guarded = withAuth(handler);
    const large = "a".repeat(MAX_JSON_BODY_BYTES + 1);
    const body = JSON.stringify({ data: large });
    const req = makeRequest(
      "http://localhost:3000/api/outfits",
      "POST",
      {
        "content-type": "application/json",
      },
      body,
    );
    // Force headerless to hit streaming path
    req.headers.delete("content-length");

    const res = await guarded(req);
    expect(res.status).toBe(413);
    expect(handler).not.toHaveBeenCalled();
  });

  it("allows chunked body under limit via streaming path", async () => {
    const handler = makeHandler();
    const guarded = withAuth(handler);
    const small = "a".repeat(100);
    const body = JSON.stringify({ data: small });
    const req = makeRequest(
      "http://localhost:3000/api/outfits",
      "POST",
      {
        "content-type": "application/json",
      },
      body,
    );
    req.headers.delete("content-length");

    const res = await guarded(req);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("counts UTF-8 bytes not UTF-16 length (emoji P2) — 30k emoji ~120KB bytes but 60k chars", async () => {
    const handler = makeHandler();
    const guarded = withAuth(handler);
    const emoji = "😀".repeat(30000); // 60k code units, 120KB bytes
    const body = JSON.stringify({ data: emoji });
    // Sanity: ensure byte length > limit but char length < limit
    expect(new TextEncoder().encode(body).byteLength).toBeGreaterThan(MAX_JSON_BODY_BYTES);
    expect(body.length).toBeLessThan(MAX_JSON_BODY_BYTES + 50000); // still > but ensure bytes > chars logic

    const req = makeRequest(
      "http://localhost:3000/api/outfits",
      "POST",
      {
        "content-type": "application/json",
      },
      body,
    );
    req.headers.delete("content-length");

    const res = await guarded(req);
    expect(res.status).toBe(413);
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects text/plain with large JSON body (Content-Type bypass P1)", async () => {
    const handler = makeHandler();
    const guarded = withAuth(handler);
    const large = "a".repeat(MAX_JSON_BODY_BYTES + 10);
    const body = JSON.stringify({ data: large });

    const req = makeRequest(
      "http://localhost:3000/api/outfits",
      "POST",
      {
        "content-type": "text/plain",
      },
      body,
    );
    // Keep header to also test byte path with content-length present
    // but also test that text/plain is now capped (previously bypassed)
    const res = await guarded(req);
    expect(res.status).toBe(413);
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects Application/JSON case variant (case-insensitive)", async () => {
    const handler = makeHandler();
    const guarded = withAuth(handler);
    const large = "a".repeat(MAX_JSON_BODY_BYTES + 10);
    const body = JSON.stringify({ data: large });

    const req = makeRequest(
      "http://localhost:3000/api/outfits",
      "POST",
      {
        "content-type": "Application/JSON",
      },
      body,
    );

    const res = await guarded(req);
    expect(res.status).toBe(413);
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not cap multipart/form-data for upload routes (photo uploads allowed)", async () => {
    const handler = makeHandler();
    const guarded = withAuth(handler);
    // Upload route /api/items with multipart should not be capped at 100KB
    const large = "a".repeat(MAX_JSON_BODY_BYTES + 5000);
    const req = makeRequest(
      "http://localhost:3000/api/items",
      "POST",
      {
        "content-type": "multipart/form-data; boundary=----WebKitFormBoundary",
      },
      large,
    );

    const res = await guarded(req);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("caps multipart/form-data spoof to JSON routes (P1 header-spoof)", async () => {
    const handler = makeHandler();
    const guarded = withAuth(handler);
    // JSON route /api/outfits with multipart header and large JSON body should be capped
    const large = "a".repeat(MAX_JSON_BODY_BYTES + 5000);
    const body = JSON.stringify({ data: large });
    const req = makeRequest(
      "http://localhost:3000/api/outfits",
      "POST",
      {
        "content-type": "multipart/form-data; boundary=----WebKitFormBoundary",
      },
      body,
    );

    const res = await guarded(req);
    expect(res.status).toBe(413);
    expect(handler).not.toHaveBeenCalled();
  });

  it("caps multipart spoof to /api/tryon as well", async () => {
    const handler = makeHandler();
    const guarded = withAuth(handler);
    const large = "a".repeat(MAX_JSON_BODY_BYTES + 5000);
    const body = JSON.stringify({ data: large });
    const req = makeRequest(
      "http://localhost:3000/api/tryon",
      "POST",
      {
        "content-type": "multipart/form-data; boundary=----WebKitFormBoundary",
      },
      body,
    );

    const res = await guarded(req);
    expect(res.status).toBe(413);
    expect(handler).not.toHaveBeenCalled();
  });

  it("forwards valid JSON correctly under limit (handler can parse)", async () => {
    const handler = makeHandler();
    const guarded = withAuth(handler);
    const payload = {
      dateKey: "2026-01-01",
      topItemId: "t1",
      bottomItemId: "b1",
      shoeItemId: "s1",
    };
    const body = JSON.stringify(payload);
    const req = makeRequest(
      "http://localhost:3000/api/outfits",
      "POST",
      {
        "content-type": "application/json",
      },
      body,
    );

    const res = await guarded(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { echoed: unknown };
    expect(json.echoed).toEqual(payload);
  });

  it("rejects missing Content-Type with large body (no header bypass)", async () => {
    const handler = makeHandler();
    const guarded = withAuth(handler);
    const large = "a".repeat(MAX_JSON_BODY_BYTES + 10);
    const body = JSON.stringify({ data: large });
    const req = new NextRequest("http://localhost:3000/api/tryon", {
      method: "POST",
      body: body as unknown as BodyInit,
    });
    // No content-type set
    const res = await guarded(req);
    expect(res.status).toBe(413);
    expect(handler).not.toHaveBeenCalled();
  });
});
