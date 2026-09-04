"use client";

import { useRef, useState } from "react";

import { useApiFetch } from "@/lib/hooks/use-api-fetch";
import type { ProfileResponse } from "@/lib/types/wardrobe";

type ProfilePhotoImgProps = {
  src: string;
  /** Which profile URL to refresh with on expiry (mirrors ItemImage's pattern). */
  pick: "avatar" | "tryon";
  alt: string;
  className?: string;
};

/**
 * Profile photo that survives signed-URL expiry (10 minutes). When the image
 * fails to load on a long-lived tab, it refetches GET /api/profile once and
 * swaps in the freshly signed URL — the same re-sign-on-error behavior as
 * ItemImage for wardrobe photos (P2).
 */
export function ProfilePhotoImg({ src, pick, alt, className }: ProfilePhotoImgProps) {
  const apiFetch = useApiFetch();
  const [freshSrc, setFreshSrc] = useState<string | null>(null);
  const attemptedForSrcRef = useRef<string | null>(null);

  async function onError() {
    const failedSrc = freshSrc ?? src;
    if (attemptedForSrcRef.current === failedSrc) return;
    attemptedForSrcRef.current = failedSrc;
    try {
      const json = await apiFetch<ProfileResponse>("/api/profile");
      const next = pick === "avatar" ? json.avatarUrl : json.aiTryOnPhotoUrl;
      if (next && next !== failedSrc) setFreshSrc(next);
    } catch {
      // Single attempt only — a second failure (e.g. photo deleted) is left alone.
    }
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={freshSrc ?? src} onError={() => void onError()} alt={alt} className={className} />
  );
}
