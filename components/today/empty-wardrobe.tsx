"use client";

import Link from "next/link";

import type { RecommendationNeeds } from "@/lib/types/wardrobe";

type EmptyWardrobeProps = {
  needs: RecommendationNeeds;
  /** Show the "upload a try-on photo" prompt (profile loaded and photo missing). */
  showTryOnPrompt: boolean;
};

/** Empty state when the wardrobe lacks items in one or more categories. */
export function EmptyWardrobe({ needs, showTryOnPrompt }: EmptyWardrobeProps) {
  return (
    <>
      <section className="app-card rounded-3xl p-9 text-center">
        <div className="flex flex-col items-center gap-4">
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 18,
              background: "var(--surface-subtle)",
              border: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
            }}
          >
            👕
          </div>
          <div className="space-y-2">
            <p className="text-lg font-bold tracking-tight text-foreground">
              Build your wardrobe first
            </p>
            <p className="text-sm muted-copy max-w-xs mx-auto">
              Add at least one item in each category to receive daily outfit recommendations.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {needs.top && <span className="missing-tag">+ Tops missing</span>}
            {needs.bottom && <span className="missing-tag">+ Bottoms missing</span>}
            {needs.shoe && <span className="missing-tag">+ Shoes missing</span>}
          </div>
          <Link href="/library" className="button-primary">
            Go to wardrobe →
          </Link>
        </div>
      </section>

      {showTryOnPrompt ? (
        <section className="app-card rounded-3xl p-9 text-center">
          <div className="flex flex-col items-center gap-4">
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 18,
                background: "var(--surface-subtle)",
                border: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 24,
                color: "oklch(75% 0.18 200)",
              }}
            >
              ✦
            </div>
            <div className="space-y-2">
              <p className="text-base font-bold tracking-tight text-foreground">
                AI outfit preview unavailable
              </p>
              <p className="text-sm muted-copy max-w-xs mx-auto">
                Upload a full-body photo on your Profile to enable AI-generated outfit previews.
              </p>
            </div>
            <Link href="/profile" className="button-primary">
              Go to Profile →
            </Link>
          </div>
        </section>
      ) : null}
    </>
  );
}
