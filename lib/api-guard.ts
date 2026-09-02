import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAppUrl } from "@/lib/env";

export const MAX_JSON_BODY_BYTES = 100 * 1024; // 100 KB for JSON payloads
export const MAX_MULTIPART_BODY_BYTES = 15 * 1024 * 1024; // 15 MB for multipart uploads (10MB file + overhead)

async function readBodyWithByteLimit(
  req: NextRequest,
  limit: number,
): Promise<{ text: string; tooLarge: boolean }> {
  const body = req.body;
  if (!body) return { text: "", tooLarge: false };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > limit) {
          try {
            await reader.cancel();
          } catch {}
          return { text: "", tooLarge: true };
        }
        chunks.push(value);
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {}
  }
  if (chunks.length === 0) return { text: "", tooLarge: false };
  const concat = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    concat.set(c, off);
    off += c.byteLength;
  }
  return { text: new TextDecoder().decode(concat), tooLarge: false };
}

async function readRawBodyWithByteLimit(
  req: NextRequest,
  limit: number,
): Promise<{ bytes: Uint8Array | null; tooLarge: boolean }> {
  const body = req.body;
  if (!body) return { bytes: null, tooLarge: false };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > limit) {
          try {
            await reader.cancel();
          } catch {}
          return { bytes: null, tooLarge: true };
        }
        chunks.push(value);
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {}
  }
  if (chunks.length === 0) return { bytes: null, tooLarge: false };
  const concat = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    concat.set(c, off);
    off += c.byteLength;
  }
  return { bytes: concat, tooLarge: false };
}

export async function readLimitedJson(req: NextRequest, limit = MAX_JSON_BODY_BYTES) {
  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > limit) {
    throw new Error(`Payload too large: ${contentLength} > ${limit}`);
  }
  // If no Content-Length, enforce byte limit by streaming to avoid buffering unbounded bodies.
  if (!contentLength) {
    const { text, tooLarge } = await readBodyWithByteLimit(req, limit);
    if (tooLarge) throw new Error(`Payload too large: > ${limit} bytes`);
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > limit) {
    throw new Error(`Payload too large: > ${limit} bytes`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isAllowedOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const allowedOrigin = (() => {
    try {
      return new URL(getAppUrl()).origin;
    } catch {
      return null;
    }
  })();
  if (!allowedOrigin) return true;
  if (origin) return origin === allowedOrigin;
  if (referer) {
    try {
      return new URL(referer).origin === allowedOrigin;
    } catch {
      return false;
    }
  }
  // No Origin/Referer — allow (e.g. server-to-server, curl); CSRF requires browser to send Origin.
  return true;
}

type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
type AuthedHandler = (user: CurrentUser, req: NextRequest) => Promise<NextResponse>;

/**
 * Wraps a Next.js route handler with authentication and optional rate limiting.
 * Returns 401 if the session is missing, 429 if the rate limit is exceeded.
 *
 * Usage:
 *   export const GET = withAuth(async (user, req) => { ... });
 *   export const POST = withAuth(
 *     async (user, req) => { ... },
 *     { key: (u) => `items:post:${u.appUser.id}`, max: 20 },
 *   );
 */
export function withAuth(
  handler: AuthedHandler,
  rateLimit?: { key: (user: CurrentUser) => string; max: number },
): (req: NextRequest) => Promise<NextResponse> {
  return async (req) => {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    // CSRF: state-changing requests must originate from allowed app origin.
    if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method) && !isAllowedOrigin(req)) {
      return NextResponse.json({ error: "Forbidden: invalid origin." }, { status: 403 });
    }
    if (rateLimit && !(await checkRateLimit(rateLimit.key(user), rateLimit.max))) {
      const res = NextResponse.json(
        { error: "Too many requests. Try again in a minute." },
        { status: 429 },
      );
      res.headers.set("Retry-After", "60");
      res.headers.set("Vary", "Origin");
      return res;
    }
    // Body size guard (M4): enforce actual bytes for all non-multipart state-changing requests,
    // independent of Content-Type. Handlers call req.json() regardless of header (text/plain bypass),
    // and case variants like Application/JSON must also be capped. Multipart is allowed only for
    // upload routes (photo uploads, 10MB per file via validateImageBlob).
    const rawContentType = req.headers.get("content-type") ?? "";
    const contentType = rawContentType.toLowerCase();
    const isMultipart = contentType.includes("multipart/form-data");
    const isStateChanging = ["POST", "PATCH", "PUT", "DELETE"].includes(req.method);
    const pathname = ((req as unknown as { nextUrl?: { pathname: string } }).nextUrl?.pathname ??
      new URL(req.url).pathname) as string;
    const MULTIPART_UPLOAD_ROUTES = new Set<string>(["POST /api/items", "PATCH /api/profile"]);
    const routeKey = `${req.method} ${pathname}`;
    const isUploadRoute = isMultipart && MULTIPART_UPLOAD_ROUTES.has(routeKey);
    // Multipart upload routes: cap total envelope before req.formData() parses it
    if (isUploadRoute) {
      const lenHeader = req.headers.get("content-length");
      if (lenHeader && Number(lenHeader) > MAX_MULTIPART_BODY_BYTES) {
        return NextResponse.json({ error: "Payload too large." }, { status: 413 });
      }
      // Enforce actual byte size via streaming (handles missing or lying Content-Length)
      if (req.body) {
        const { bytes, tooLarge } = await readRawBodyWithByteLimit(req, MAX_MULTIPART_BODY_BYTES);
        if (tooLarge) {
          return NextResponse.json({ error: "Payload too large." }, { status: 413 });
        }
        if (bytes) {
          const forwarded = new NextRequest(req.url, {
            method: req.method,
            headers: req.headers,
            body: bytes as unknown as BodyInit,
          });
          return handler(user, forwarded);
        }
      }
      return handler(user, req);
    }
    if (isStateChanging && !isUploadRoute) {
      const lenHeader = req.headers.get("content-length");
      if (lenHeader && Number(lenHeader) > MAX_JSON_BODY_BYTES) {
        return NextResponse.json({ error: "Payload too large." }, { status: 413 });
      }
      // Enforce actual byte size for chunked/missing Content-Length by streaming with a cap.
      // Prevents buffering multi-MB bodies via req.text() before the check (P1) and counts UTF-8 bytes (P2).
      let bodyText: string;
      if (!lenHeader) {
        let tooLarge = false;
        try {
          const res = await readBodyWithByteLimit(req, MAX_JSON_BODY_BYTES);
          tooLarge = res.tooLarge;
          bodyText = res.text;
        } catch {
          return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
        }
        if (tooLarge) {
          return NextResponse.json({ error: "Payload too large." }, { status: 413 });
        }
      } else {
        try {
          bodyText = await req.text();
        } catch {
          return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
        }
        if (new TextEncoder().encode(bodyText).byteLength > MAX_JSON_BODY_BYTES) {
          return NextResponse.json({ error: "Payload too large." }, { status: 413 });
        }
      }
      const forwarded = new NextRequest(req.url, {
        method: req.method,
        headers: req.headers,
        body: bodyText! || undefined,
      });
      return handler(user, forwarded);
    }
    return handler(user, req);
  };
}
