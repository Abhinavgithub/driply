"use client";

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import Link from "next/link";

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
  imageBase64: string;
  mimeType: string;
};

// Module-level session cache — survives component remounts within same browser session
const sessionCache = new Map<string, CacheEntry>();

function makeCacheKey(outfit: TryOnPreviewProps["outfit"]): string {
  return `${outfit.top.id}_${outfit.bottom.id}_${outfit.shoe.id}`;
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

export const TryOnPreview = forwardRef<TryOnPreviewHandle, TryOnPreviewProps>(
  function TryOnPreview({ outfit, hasTryOnPhoto, displayName, embedded }, ref) {
    const [phase, setPhase] = useState<Phase>("idle");
    const [imageBase64, setImageBase64] = useState<string | null>(null);
    const [imageMimeType, setImageMimeType] = useState<string>("image/png");
    const [fallbackNote, setFallbackNote] = useState<string | null>(null);
    const failCountRef = useRef(0);

    const generate = useCallback(async () => {
      const cacheKey = makeCacheKey(outfit);
      const cached = sessionCache.get(cacheKey);
      if (cached) {
        setImageBase64(cached.imageBase64);
        setImageMimeType(cached.mimeType);
        setPhase("success");
        return;
      }

      setPhase("loading");
      setFallbackNote(null);

      try {
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

        if (!res.ok || !json.ok) {
          throw new Error(json?.reason || json?.error || "generation_failed");
        }

        sessionCache.set(cacheKey, { imageBase64: json.imageBase64, mimeType: json.mimeType });
        setImageBase64(json.imageBase64);
        setImageMimeType(json.mimeType);
        setPhase("success");
      } catch {
        failCountRef.current += 1;
        if (failCountRef.current === 1) {
          // One automatic retry
          try {
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
            if (!res.ok || !json.ok) throw new Error(json?.reason || "generation_failed");

            sessionCache.set(makeCacheKey(outfit), { imageBase64: json.imageBase64, mimeType: json.mimeType });
            setImageBase64(json.imageBase64);
            setImageMimeType(json.mimeType);
            setPhase("success");
            return;
          } catch {
            failCountRef.current += 1;
          }
        }
        setFallbackNote("Couldn't generate your look right now — here's your outfit recommendation.");
        setPhase("fallback");
      }
    }, [outfit]);

    const regenerate = useCallback(() => {
      sessionCache.delete(makeCacheKey(outfit));
      void generate();
    }, [outfit, generate]);

    useImperativeHandle(ref, () => ({ generate: () => void generate() }), [generate]);

    function onDownload() {
      if (!imageBase64 || !imageMimeType) return;
      const ext = imageMimeType.split("/")[1] ?? "png";
      const link = document.createElement("a");
      link.href = `data:${imageMimeType};base64,${imageBase64}`;
      link.download = `driply-look.${ext}`;
      link.click();
    }

    const title = displayName?.trim() ? `${displayName}'s look` : "Your look";
    const canRetry = phase === "fallback" && failCountRef.current < 3;

    // ── Embedded mode (inside AI chat card) ──
    if (embedded) {
      if (phase === "idle" || !hasTryOnPhoto) return null;

      if (phase === "loading") {
        return <div className="shimmer h-[280px] bg-surface-subtle sm:h-[360px]" />;
      }

      if (phase === "success" && imageBase64) {
        return (
          <div className="border-t border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:${imageMimeType};base64,${imageBase64}`}
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
                style={{ background: "oklch(75% 0.18 200)", color: "oklch(9% 0.008 240)", borderRadius: 999 }}
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
            <p className="text-xs muted-copy">{fallbackNote ?? "Couldn't generate your look right now."}</p>
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
              <div style={{
                width: 44, height: 44, borderRadius: 14, flexShrink: 0,
                background: "oklch(75% 0.18 200 / 0.1)",
                border: "1px solid oklch(75% 0.18 200 / 0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20, color: "oklch(75% 0.18 200)",
              }}>
                ✦
              </div>
              <div>
                <p style={{ fontFamily: "var(--lp-font-display, 'Space Grotesk', sans-serif)", fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em", marginBottom: 2 }} className="text-foreground">
                  AI outfit preview
                </p>
                <p className="text-xs muted-copy">Upload a photo to see this outfit on you.</p>
              </div>
            </div>
            <Link
              href="/profile"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "oklch(75% 0.18 200)", color: "oklch(9% 0.008 240)",
                fontFamily: "var(--lp-font-display, 'Space Grotesk', sans-serif)",
                fontSize: 12, fontWeight: 700, padding: "8px 16px",
                borderRadius: 100, letterSpacing: "0.04em", textTransform: "uppercase",
                textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0,
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
              <div style={{
                width: 44, height: 44, borderRadius: 14, flexShrink: 0,
                background: "oklch(75% 0.18 200 / 0.1)",
                border: "1px solid oklch(75% 0.18 200 / 0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20, color: "oklch(75% 0.18 200)",
              }}>
                ✦
              </div>
              <div>
                <p style={{ fontFamily: "var(--lp-font-display, 'Space Grotesk', sans-serif)", fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em", marginBottom: 2 }} className="text-foreground">
                  AI outfit preview
                </p>
                <p className="text-xs muted-copy">See this outfit on you.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void generate()}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "oklch(75% 0.18 200)", color: "oklch(9% 0.008 240)",
                fontFamily: "var(--lp-font-display, 'Space Grotesk', sans-serif)",
                fontSize: 12, fontWeight: 700, padding: "8px 16px",
                borderRadius: 100, border: "none", cursor: "pointer",
                letterSpacing: "0.04em", textTransform: "uppercase",
                transition: "opacity 0.2s, transform 0.2s", whiteSpace: "nowrap",
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
    if (phase === "success" && imageBase64) {
      return (
        <section className="app-card overflow-hidden rounded-3xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:${imageMimeType};base64,${imageBase64}`}
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
              style={{ background: "oklch(75% 0.18 200)", color: "oklch(9% 0.008 240)", borderRadius: 999 }}
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
            {fallbackNote ?? "Couldn't generate your look right now — here's your outfit recommendation."}
          </p>
          {canRetry ? (
            <button
              type="button"
              onClick={regenerate}
              className="button-ghost text-sm"
            >
              Try again
            </button>
          ) : null}
        </div>
      </section>
    );
  }
);
