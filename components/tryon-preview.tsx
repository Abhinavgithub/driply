"use client";

import { useCallback, useRef, useState } from "react";
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

export function TryOnPreview({ outfit, hasTryOnPhoto, displayName }: TryOnPreviewProps) {
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

  // User hasn't uploaded a try-on photo yet
  if (!hasTryOnPhoto) {
    return (
      <section className="app-card rounded-3xl p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">AI outfit preview</p>
            <p className="mt-1 text-sm muted-copy">
              Upload your AI try-on photo to preview this outfit on you.
            </p>
            <p className="mt-1 text-xs muted-copy">
              This is different from your profile picture — it&apos;s a full-body photo used only for AI previews.
            </p>
          </div>
          <Link href="/profile" className="button-secondary flex-shrink-0 text-sm">
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
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">AI outfit preview</p>
            <p className="mt-1 text-sm muted-copy">See this outfit on you.</p>
          </div>
          <button type="button" onClick={() => void generate()} className="button-secondary flex-shrink-0">
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
        <div className="shimmer h-[420px] bg-surface-subtle" />
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
        <div className="relative bg-surface-subtle">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:${imageMimeType};base64,${imageBase64}`}
            alt={title}
            className="mx-auto max-h-[520px] w-full object-contain"
          />
        </div>
        <div className="space-y-3 p-4">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => void generate()}
              className="button-secondary flex w-full items-center justify-center gap-2"
            >
              <RefreshIcon />
              Regenerate
            </button>
            <button
              type="button"
              onClick={onDownload}
              className="button-ghost flex w-full items-center justify-center gap-2"
            >
              <DownloadIcon />
              Save image
            </button>
          </div>
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
            onClick={() => void generate()}
            className="button-ghost text-sm"
          >
            Try again
          </button>
        ) : null}
      </div>
    </section>
  );
}
