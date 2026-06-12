"use client";

import { useRef, useState, type ImgHTMLAttributes } from "react";

import { useApiFetch } from "@/lib/hooks/use-api-fetch";

type ItemImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> & {
  itemId: string;
  src: string;
};

/**
 * Wardrobe item photo that survives signed-URL expiry (1 hour). When the
 * image fails to load on a long-lived tab, it fetches a fresh signed URL for
 * the item once and swaps it in. A second failure (e.g. item deleted) is
 * left alone.
 */
export function ItemImage({ itemId, src, alt, loading, ...imgProps }: ItemImageProps) {
  const apiFetch = useApiFetch();
  // Keyed by the src they were fetched for, so a parent passing a new src
  // automatically discards stale refresh state — no reset effect needed.
  const [refreshed, setRefreshed] = useState<{ forSrc: string; url: string } | null>(null);
  const attemptedForSrcRef = useRef<string | null>(null);

  const freshSrc = refreshed?.forSrc === src ? refreshed.url : null;

  function onError() {
    if (attemptedForSrcRef.current === src) return;
    attemptedForSrcRef.current = src;
    void apiFetch<{ items?: { id: string; photoUrl: string }[] }>(
      `/api/items?ids=${encodeURIComponent(itemId)}`,
    )
      .then((data) => {
        const fresh = data.items?.find((item) => item.id === itemId)?.photoUrl;
        if (fresh) setRefreshed({ forSrc: src, url: fresh });
      })
      .catch(() => {
        // Image stays broken; nothing more we can do client-side.
      });
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...imgProps}
      src={freshSrc ?? src}
      alt={alt}
      loading={loading ?? "lazy"}
      onError={onError}
    />
  );
}
