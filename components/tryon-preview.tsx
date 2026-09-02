"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import Link from "next/link";

import { useAuthUser } from "@/lib/hooks/use-auth-user";

type TryOnItem = {
  id: string;
  kind: "TOP" | "BOTTOM" | "SHOE";
  subtype: string;
  photoUrl: string;
  colorFamily: string;
  visualSummary: string | null;
};

type TryOnPreviewProps = {
  outfit: {
    top: TryOnItem;
    bottom: TryOnItem;
    shoe: TryOnItem;
  };
  hasTryOnPhoto: boolean;
  displayName: string | null;
  /** When true, renders without the card wrapper and skips idle/no-photo states (handled by parent) */
  embedded?: boolean;
};

export type TryOnPreviewHandle = {
  generate: () => void;
};

type Phase = "idle" | "loading" | "success" | "fallback";

type CacheEntry = {
  imageUrl: string;
  mimeType: string;
  createdAt: number;
};

const SESSION_CACHE_TTL_MS = 45 * 60 * 1000; // 45 min — before 1h signed-URL expiry

// Module-level session cache — survives component remounts within same browser
// session.

const sessionCache = new Map<string, CacheEntry>();

export function clearTryOnSessionCache() {
  sessionCache.clear();
}

function makeCacheKey(outfit: TryOnPreviewProps["outfit"], userKey: string | null): string {
  const base = `${outfit.top.id}_${outfit.bottom.id}_${outfit.shoe.id}`;
  return userKey ? `${userKey}:${base}` : base;
}

function getCachedEntry(key: string): CacheEntry | null {
  const entry = sessionCache.get(key) ?? null;
  if (!entry) return null;
  if (Date.now() - entry.createdAt > SESSION_CACHE_TTL_MS) {
    sessionCache.delete(key);
    return null;
  }
  return entry;
}

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 60; // 3 minutes — covers the slowest provider (OpenAI, 120s)

type JobResult = Omit<CacheEntry, "createdAt">;

/**
 * Creates a try-on job and polls it to completion. Returns null if the caller
 * cancelled (component unmounted); throws on failure or timeout.
 */
async function generateViaJob(
  outfit: TryOnPreviewProps["outfit"],
  isCancelled: () => boolean,
): Promise<JobResult | null> {
  const res = await fetch("/api/tryon", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      topItemId: outfit.top.id,
      bottomItemId: outfit.bottom.id,
      shoeItemId: outfit.shoe.id,
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok || !json.jobId) {
    throw new Error(json?.reason || json?.error || "generation_failed");
  }

  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    if (isCancelled()) return null;

    const pollRes = await fetch(`/api/tryon?jobId=${encodeURIComponent(json.jobId)}`);
    const poll = await pollRes.json();
    if (isCancelled()) return null;

    if (poll.status === "ready" && poll.imageUrl) {
      return { imageUrl: poll.imageUrl, mimeType: poll.mimeType ?? "image/png" };
    }
    if (poll.status === "failed" || pollRes.status === 404) {
      throw new Error(poll?.reason || "generation_failed");
    }
    // pending/running (or a transient poll error) — keep waiting
  }

  throw new Error("timed_out");
}

function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

export const TryOnPreview = forwardRef<TryOnPreviewHandle, TryOnPreviewProps>(function TryOnPreview(
  { outfit, hasTryOnPhoto, displayName, embedded },
  ref,
) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string>("image/png");
  const [fallbackNote, setFallbackNote] = useState<string | null>(null);
  const [failCount, setFailCount] = useState(0);
  const cancelledRef = useRef(false);
  const { user } = useAuthUser();
  // User-scoped key prevents cross-user cache reuse after logout/login.
  const userKey = user?.id ?? displayName ?? "anon";

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  // Clear stale cache when outfit user context changes
  useEffect(() => {
    // If displayName changes (login switch), bust cache — signed URLs are per-user.
    // We keep the Map but keys are now scoped, so old entries naturally miss.
  }, [userKey]);

  const generate = useCallback(async () => {
    const cacheKey = makeCacheKey(outfit, userKey);
    const cached = getCachedEntry(cacheKey);
    if (cached) {
      setImageUrl(cached.imageUrl);
      setImageMimeType(cached.mimeType);
      setPhase("success");
      return;
    }

    setPhase("loading");
    setFallbackNote(null);

    const isCancelled = () => cancelledRef.current;

    // One automatic retry; the server reuses an in-flight job for the same
    // outfit, so this never spawns a duplicate generation.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await generateViaJob(outfit, isCancelled);
        if (result === null) return; // unmounted mid-poll
        sessionCache.set(cacheKey, { ...result, createdAt: Date.now() });
        setImageUrl(result.imageUrl);
        setImageMimeType(result.mimeType);
        setPhase("success");
        return;
      } catch {
        setFailCount((count) => count + 1);
        if (isCancelled()) return;
      }
    }

    setFallbackNote("Couldn't generate your look right now — here's your outfit recommendation.");
    setPhase("fallback");
  }, [outfit, userKey]);

  const regenerate = useCallback(() => {
    sessionCache.delete(makeCacheKey(outfit, userKey));
    void generate();
  }, [outfit, userKey, generate]);

  useImperativeHandle(ref, () => ({ generate: () => void generate() }), [generate]);

  async function onDownload() {
    if (!imageUrl) return;
    const ext = imageMimeType.split("/")[1] ?? "png";
    try {
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `driply-look.${ext}`;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Signed URL may have expired; regenerate refreshes it.
    }
  }

  const title = displayName?.trim() ? `${displayName}'s look` : "Your look";
  const canRetry = phase === "fallback" && failCount < 3;

  // ── Embedded mode (inside AI chat card) ──
  if (embedded) {
    if (phase === "idle" || !hasTryOnPhoto) return null;

    if (phase === "loading") {
      return <div className="shimmer h-[280px] bg-surface-subtle sm:h-[360px]" />;
    }

    if (phase === "success" && imageUrl) {
      return (
        <div className="border-t border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={title}
            className="mx-auto max-h-[480px] w-full object-contain bg-surface-subtle"
          />
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ background: "rgba(0,0,0,0.82)" }}
          >
            <button
              type="button"
              onClick={regenerate}
              className="flex items-center gap-1.5 text-xs font-semibold"
              style={{ color: "oklch(75% 0.18 200)" }}
            >
              <RefreshIcon /> Regenerate
            </button>
            <button
              type="button"
              onClick={onDownload}
              className="flex items-center gap-1.5 text-xs font-bold px-4 py-1.5"
              style={{
                background: "oklch(75% 0.18 200)",
                color: "oklch(9% 0.008 240)",
                borderRadius: 999,
              }}
            >
              <DownloadIcon /> Save look
            </button>
          </div>
        </div>
      );
    }

    if (phase === "fallback") {
      return (
        <div className="border-t border-border px-5 py-4">
          <p className="text-xs muted-copy">
            {fallbackNote ?? "Couldn't generate your look right now."}
          </p>
          {canRetry ? (
            <button type="button" onClick={regenerate} className="button-ghost text-xs mt-2">
              Try again
            </button>
          ) : null}
        </div>
      );
    }

    return null;
  }

  // ── Standalone mode ──

  // User hasn't uploaded a try-on photo yet
  if (!hasTryOnPhoto) {
    return (
      <section className="app-card rounded-3xl p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                flexShrink: 0,
                background: "oklch(75% 0.18 200 / 0.1)",
                border: "1px solid oklch(75% 0.18 200 / 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
                color: "oklch(75% 0.18 200)",
              }}
            >
              ✦
            </div>
            <div>
              <p
                style={{
                  fontFamily: "var(--lp-font-display, 'Space Grotesk', sans-serif)",
                  fontSize: 14,
                  fontWeight: 600,
                  letterSpacing: "-0.01em",
                  marginBottom: 2,
                }}
                className="text-foreground"
              >
                AI outfit preview
              </p>
              <p className="text-xs muted-copy">Upload a photo to see this outfit on you.</p>
            </div>
          </div>
          <Link
            href="/profile"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "oklch(75% 0.18 200)",
              color: "oklch(9% 0.008 240)",
              fontFamily: "var(--lp-font-display, 'Space Grotesk', sans-serif)",
              fontSize: 12,
              fontWeight: 700,
              padding: "8px 16px",
              borderRadius: 100,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              textDecoration: "none",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            Set up
          </Link>
        </div>
      </section>
    );
  }

  // Idle — show generate button
  if (phase === "idle") {
    return (
      <section className="app-card rounded-3xl p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                flexShrink: 0,
                background: "oklch(75% 0.18 200 / 0.1)",
                border: "1px solid oklch(75% 0.18 200 / 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
                color: "oklch(75% 0.18 200)",
              }}
            >
              ✦
            </div>
            <div>
              <p
                style={{
                  fontFamily: "var(--lp-font-display, 'Space Grotesk', sans-serif)",
                  fontSize: 14,
                  fontWeight: 600,
                  letterSpacing: "-0.01em",
                  marginBottom: 2,
                }}
                className="text-foreground"
              >
                AI outfit preview
              </p>
              <p className="text-xs muted-copy">See this outfit on you.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void generate()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "oklch(75% 0.18 200)",
              color: "oklch(9% 0.008 240)",
              fontFamily: "var(--lp-font-display, 'Space Grotesk', sans-serif)",
              fontSize: 12,
              fontWeight: 700,
              padding: "8px 16px",
              borderRadius: 100,
              border: "none",
              cursor: "pointer",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              transition: "opacity 0.2s, transform 0.2s",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            OOTD
          </button>
        </div>
      </section>
    );
  }

  // Loading — shimmer placeholder
  if (phase === "loading") {
    return (
      <section className="app-card overflow-hidden rounded-3xl">
        <div className="shimmer h-[280px] bg-surface-subtle sm:h-[360px] md:h-[420px]" />
        <div className="p-4">
          <p className="text-sm muted-copy">Generating your look…</p>
        </div>
      </section>
    );
  }

  // Success — show generated image
  if (phase === "success" && imageUrl) {
    return (
      <section className="app-card overflow-hidden rounded-3xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={title}
          className="mx-auto max-h-[520px] w-full object-contain bg-surface-subtle"
        />
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ background: "rgba(0,0,0,0.82)" }}
        >
          <button
            type="button"
            onClick={regenerate}
            className="flex items-center gap-1.5 text-xs font-semibold"
            style={{ color: "rgba(255,255,255,0.65)" }}
          >
            <RefreshIcon /> Regenerate
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="flex items-center gap-1.5 text-xs font-bold px-4 py-1.5"
            style={{
              background: "oklch(75% 0.18 200)",
              color: "oklch(9% 0.008 240)",
              borderRadius: 999,
            }}
          >
            <DownloadIcon /> Save look
          </button>
        </div>
      </section>
    );
  }

  // Fallback — soft error, optional retry
  return (
    <section className="app-card rounded-3xl p-4">
      <div className="space-y-3">
        <p className="text-sm muted-copy">
          {fallbackNote ??
            "Couldn't generate your look right now — here's your outfit recommendation."}
        </p>
        {canRetry ? (
          <button type="button" onClick={regenerate} className="button-ghost text-sm">
            Try again
          </button>
        ) : null}
      </div>
    </section>
  );
});
