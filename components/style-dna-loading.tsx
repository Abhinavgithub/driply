"use client";

import { useEffect, useRef, useState } from "react";

import { StyleDnaCard } from "@/components/style-dna-card";

type DnaStatus = {
  exists: boolean;
  textStatus?: string;
  archetypeName?: string | null;
  description?: string | null;
  traits?: string[] | null;
  colorPalette?: string[] | null;
  version?: number;
};

type StyleDnaLoadingProps = {
  onContinue: () => void;
};

const LOADING_MESSAGES = [
  "Analyzing your style instincts...",
  "Building your fashion identity...",
  "Crafting your unique archetype...",
  "Your Style DNA is almost ready ✦",
];

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 20;

export function StyleDnaLoading({ onContinue }: StyleDnaLoadingProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [dna, setDna] = useState<DnaStatus | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [generationFailed, setGenerationFailed] = useState(false);
  const [paletteVisible, setPaletteVisible] = useState<boolean[]>([]);
  const pollCount = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const messageTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    messageTimer.current = setInterval(() => {
      setMessageIndex((i) => Math.min(i + 1, LOADING_MESSAGES.length - 1));
    }, 2200);
    return () => {
      if (messageTimer.current) clearInterval(messageTimer.current);
    };
  }, []);

  useEffect(() => {
    async function poll() {
      pollCount.current++;
      try {
        const res = await fetch("/api/style-dna");
        if (!res.ok) return;
        const data = (await res.json()) as DnaStatus;
        setDna(data);

        if (data.exists && data.textStatus === "READY") {
          if (pollTimer.current) clearInterval(pollTimer.current);
          if (messageTimer.current) clearInterval(messageTimer.current);
          setMessageIndex(LOADING_MESSAGES.length - 1);
          setTimeout(() => {
            setRevealed(true);
            const count = data.colorPalette?.length ?? 0;
            for (let i = 0; i < count; i++) {
              setTimeout(() => {
                setPaletteVisible((prev) => {
                  const next = [...prev];
                  next[i] = true;
                  return next;
                });
              }, i * 150);
            }
          }, 600);
          return;
        }

        if (data.textStatus === "FAILED" || pollCount.current >= MAX_POLL_ATTEMPTS) {
          if (pollTimer.current) clearInterval(pollTimer.current);
          if (messageTimer.current) clearInterval(messageTimer.current);
          setGenerationFailed(true);
        }
      } catch {
        // Non-fatal
      }
    }

    void poll();
    pollTimer.current = setInterval(() => void poll(), POLL_INTERVAL_MS);

    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  const isTextReady = dna?.exists && dna.textStatus === "READY";
  const palette = dna?.colorPalette ?? [];

  if (generationFailed) {
    return (
      <div className="sdna-reveal-screen">
        <div className="sdna-loading-content" style={{ textAlign: "center" }}>
          <p className="sdna-cta-title" style={{ color: "#fff", marginBottom: 8 }}>
            Couldn&apos;t generate your Style DNA
          </p>
          <p className="sdna-loading-message" style={{ marginBottom: 24 }}>
            No worries — you can generate it later from your profile.
          </p>
          <button type="button" onClick={onContinue} className="sdna-continue-btn">
            Continue to wardrobe →
          </button>
        </div>
      </div>
    );
  }

  if (revealed && isTextReady && dna) {
    return (
      <div className="sdna-reveal-screen">
        <StyleDnaCard
          archetypeName={dna.archetypeName ?? ""}
          description={dna.description ?? ""}
          traits={dna.traits ?? []}
          colorPalette={dna.colorPalette ?? []}
        />
        <button
          type="button"
          onClick={onContinue}
          className="sdna-continue-btn"
        >
          Continue to wardrobe →
        </button>
      </div>
    );
  }

  return (
    <div className="sdna-loading-screen">
      {/* Aurora background */}
      <div className="sdna-aurora">
        <div className="sdna-aurora-blob b1" />
        <div className="sdna-aurora-blob b2" />
        <div className="sdna-aurora-blob b3" />
      </div>

      <div className="sdna-loading-content">
        {/* DNA helix icon */}
        <div className="sdna-icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
            <path
              d="M12 8c4 4 20 4 24 12S28 36 24 40"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
              opacity="0.6"
            />
            <path
              d="M36 8c-4 4-20 4-24 12s8 16 12 20"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
            {[14, 20, 26, 32].map((y) => (
              <line
                key={y}
                x1="15"
                y1={y}
                x2="33"
                y2={y + 2}
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                opacity="0.4"
              />
            ))}
          </svg>
        </div>

        {/* Loading message */}
        <p className="sdna-loading-message" key={messageIndex}>
          {LOADING_MESSAGES[messageIndex]}
        </p>

        {/* Palette preview (shows as swatches appear) */}
        {palette.length > 0 && (
          <div className="sdna-loading-palette">
            {palette.map((color, i) => (
              <div
                key={color}
                className={`sdna-loading-swatch ${paletteVisible[i] ? "visible" : ""}`}
                style={{ background: color, transitionDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
        )}

        {/* Dot progress */}
        <div className="sdna-dots">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}
