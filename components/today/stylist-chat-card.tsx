"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { TryOnPreview, type TryOnPreviewHandle } from "@/components/tryon-preview";
import type { RecommendationOption } from "@/lib/types/wardrobe";

/**
 * Typewriter chat bubble. Render keyed by the message so a new message
 * restarts the dots → typing → done sequence from clean state.
 */
function prefersReducedMotion() {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function ChatBubble({ message }: { message: string }) {
  // Reduced motion: initialize to the final state (the parent keys by message,
  // so a new message remounts from clean state).
  const [chatText, setChatText] = useState(() => (prefersReducedMotion() ? message : ""));
  const [chatPhase, setChatPhase] = useState<"dots" | "typing" | "done">(() =>
    prefersReducedMotion() ? "done" : "dots",
  );

  useEffect(() => {
    // Reduced motion handled by initial state above — no animation to run.
    if (prefersReducedMotion()) return;
    let rafId: number | null = null;
    const MS_PER_CHAR = 22;
    const timeout = setTimeout(() => {
      setChatPhase("typing");
      let i = 0;
      let startTime: number | null = null;
      const tick = (now: DOMHighResTimeStamp) => {
        if (startTime === null) startTime = now;
        const target = Math.min(Math.floor((now - startTime) / MS_PER_CHAR), message.length);
        if (target > i) {
          i = target;
          setChatText(message.slice(0, i));
        }
        if (i < message.length) {
          rafId = requestAnimationFrame(tick);
        } else {
          setChatPhase("done");
        }
      };
      rafId = requestAnimationFrame(tick);
    }, 1600);
    return () => {
      clearTimeout(timeout);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [message]);

  return (
    <div className="ai-chat-bubble" aria-live="polite" aria-busy={chatPhase !== "done"}>
      {chatPhase === "dots" ? (
        <div className="typing-dots">
          <div className="typing-dot" />
          <div className="typing-dot" />
          <div className="typing-dot" />
        </div>
      ) : (
        <>
          {chatText}
          <span className={`ai-chat-cursor${chatPhase === "done" ? " done" : ""}`} />
        </>
      )}
    </div>
  );
}

type StylistChatCardProps = {
  option: RecommendationOption;
  displayName: string | null;
  hasTryOnPhoto: boolean;
  marked: boolean;
  loading: boolean;
  onMarkWorn: () => void;
  onShowAnother: () => void;
};

/** Stylist AI card: try-on trigger, typewriter reasoning, and mark-worn / swap actions. */
export function StylistChatCard({
  option,
  displayName,
  hasTryOnPhoto,
  marked,
  loading,
  onMarkWorn,
  onShowAnother,
}: StylistChatCardProps) {
  const tryOnRef = useRef<TryOnPreviewHandle | null>(null);

  const tryOnOutfit = useMemo(
    () => ({ top: option.top, bottom: option.bottom, shoe: option.shoe }),
    [option],
  );
  const message = option.aiReason ?? option.explanation;

  return (
    <div className="ai-chat-card">
      {/* Header */}
      <div className="ai-chat-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="ai-orb">✦</div>
          <div>
            <div
              style={{
                fontFamily: "var(--lp-font-display, 'Space Grotesk', sans-serif)",
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: "-0.01em",
              }}
            >
              Stylist AI
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--muted-foreground)",
                fontWeight: 300,
              }}
            >
              Personalized reasoning
            </div>
          </div>
        </div>
        {hasTryOnPhoto ? (
          <button type="button" className="btn-ootd" onClick={() => tryOnRef.current?.generate()}>
            OOTD ↗
          </button>
        ) : (
          <Link
            href="/profile"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "oklch(75% 0.18 200)",
              color: "oklch(9% 0.008 240)",
              fontFamily: "var(--lp-font-display, 'Space Grotesk', sans-serif)",
              fontSize: 11,
              fontWeight: 700,
              padding: "7px 14px",
              borderRadius: 100,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              textDecoration: "none",
            }}
          >
            Set up
          </Link>
        )}
      </div>

      {/* Embedded TryOnPreview (only shows when loading/success/fallback) */}
      <TryOnPreview
        ref={tryOnRef}
        outfit={tryOnOutfit}
        hasTryOnPhoto={hasTryOnPhoto}
        displayName={displayName}
        embedded
      />

      {/* Chat bubble */}
      <div style={{ padding: "18px 20px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 9,
              background: "oklch(75% 0.18 200 / 0.1)",
              border: "1px solid oklch(75% 0.18 200 / 0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              flexShrink: 0,
              marginTop: 14,
            }}
          >
            ✦
          </div>
          <ChatBubble key={message} message={message} />
        </div>
      </div>

      {/* Action row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          padding: "16px 20px 20px",
          borderTop: "1px solid var(--border)",
        }}
      >
        <button
          type="button"
          onClick={onMarkWorn}
          disabled={marked}
          className="button-primary"
          style={{
            borderRadius: 100,
            padding: "13px 20px",
            fontSize: 14,
            fontWeight: 600,
            fontFamily: "var(--lp-font-display, 'Space Grotesk', sans-serif)",
          }}
        >
          {marked ? "Worn today ✓" : "Mark as worn"}
        </button>
        <button
          type="button"
          onClick={onShowAnother}
          disabled={loading}
          className="button-secondary"
          style={{
            borderRadius: 100,
            padding: "13px 20px",
            fontSize: 14,
            fontWeight: 600,
            fontFamily: "var(--lp-font-display, 'Space Grotesk', sans-serif)",
          }}
        >
          Another look
        </button>
      </div>
    </div>
  );
}
