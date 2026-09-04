"use client";

import { useEffect, useMemo, useRef } from "react";

import type { LocationSource } from "@/lib/saved-location";
import type { RecommendationOption } from "@/lib/types/wardrobe";

function getMoodConfig(tempC: number, isRaining: boolean, hour = new Date().getHours()) {
  const isNight = hour >= 20 || hour < 6;

  if (isRaining)
    return {
      gradient:
        "linear-gradient(135deg, oklch(24% 0.10 280) 0%, oklch(16% 0.08 300) 50%, oklch(10% 0.04 270) 100%)",
      glow: "radial-gradient(ellipse 65% 70% at 20% 60%, oklch(38% 0.16 285 / 0.60) 0%, transparent 70%)",
      particleColor: "oklch(78% 0.06 280)",
      desc: "Rainy",
    };
  if (isNight)
    return {
      gradient:
        "linear-gradient(135deg, oklch(18% 0.08 260) 0%, oklch(12% 0.06 280) 55%, oklch(8% 0.03 270) 100%)",
      glow: "radial-gradient(ellipse 50% 60% at 75% 25%, oklch(55% 0.10 240 / 0.35) 0%, transparent 65%)",
      particleColor: "oklch(75% 0.06 240)",
      desc: "Clear night",
    };
  if (tempC < 16)
    return {
      gradient:
        "linear-gradient(135deg, oklch(45% 0.18 245) 0%, oklch(32% 0.20 235) 55%, oklch(15% 0.06 240) 100%)",
      glow: "radial-gradient(ellipse 60% 80% at 20% 60%, oklch(62% 0.22 240 / 0.50) 0%, transparent 70%)",
      particleColor: "oklch(82% 0.18 235)",
      desc: "Cool",
    };
  return {
    gradient:
      "linear-gradient(135deg, oklch(52% 0.16 60) 0%, oklch(38% 0.18 200) 55%, oklch(18% 0.06 240) 100%)",
    glow: "radial-gradient(ellipse 60% 80% at 20% 60%, oklch(70% 0.20 60 / 0.45) 0%, transparent 70%), radial-gradient(ellipse 50% 70% at 75% 30%, oklch(65% 0.20 200 / 0.35) 0%, transparent 65%)",
    particleColor: "oklch(85% 0.18 65)",
    desc: "Sunny",
  };
}

type MoodBannerProps = {
  option: RecommendationOption;
  displayName: string | null;
  locationSource: LocationSource;
  activeLocationLabel: string | null;
};

/** Weather-mood hero banner with animated gradient, glow, and particles. */
export function MoodBanner({
  option,
  displayName,
  locationSource,
  activeLocationLabel,
}: MoodBannerProps) {
  const particlesRef = useRef<HTMLDivElement | null>(null);
  const gradientRef = useRef<HTMLDivElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);

  const localDateFormatted = useMemo(() => {
    return new Date().toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }, []);
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  const mood = useMemo(
    () => getMoodConfig(option.debugScores.temperatureC, option.debugScores.isRaining),
    [option],
  );

  useEffect(() => {
    if (!particlesRef.current || !gradientRef.current || !glowRef.current) return;
    gradientRef.current.style.background = mood.gradient;
    glowRef.current.style.background = mood.glow;
    const container = particlesRef.current;
    container.innerHTML = "";
    // Reduced motion: skip decorative particles entirely (the global CSS
    // override would kill them post-paint anyway — avoid the layout cost).
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    for (let i = 0; i < 14; i++) {
      const p = document.createElement("div");
      p.className = "mood-particle";
      p.style.cssText = `left:${Math.random() * 100}%;bottom:${Math.random() * 40}%;width:${4 + Math.random() * 6}px;height:${4 + Math.random() * 6}px;background:${mood.particleColor};--dur:${3 + Math.random() * 4}s;--delay:${Math.random() * 4}s;`;
      container.appendChild(p);
    }
  }, [mood]);

  return (
    <div className="mood-banner">
      <div className="mood-gradient" ref={gradientRef} />
      <div className="mood-glow" ref={glowRef} />
      <div className="mood-particles" ref={particlesRef} aria-hidden="true" />
      <div className="mood-overlay" />
      <div className="mood-content">
        <div>
          <div className="mood-date">
            Today · <span>{localDateFormatted}</span>
          </div>
          <div className="mood-sub">
            {displayName ? (
              <>
                {greeting}, <strong>{displayName}</strong> - Here&apos;s your look
              </>
            ) : (
              "Here's your look for today"
            )}
          </div>
        </div>
        <div className="mood-weather">
          <div className="mood-temp">{option.debugScores.temperatureC.toFixed(0)}°</div>
          <div className="mood-desc">
            {mood.desc}
            {locationSource === "device"
              ? ""
              : activeLocationLabel
                ? ` · ${activeLocationLabel.split(",")[0]}`
                : ""}
          </div>
          <div className="mood-wpills">
            {option.debugScores.isRaining && <span className="mood-wpill">Carry Umbrella</span>}
            {option.debugScores.temperatureC > 28 && <span className="mood-wpill">UV High</span>}
            {option.debugScores.temperatureC > 25 && !option.debugScores.isRaining && (
              <span className="mood-wpill">Humid</span>
            )}
            {option.debugScores.temperatureC < 10 && <span className="mood-wpill">Layer Up</span>}
            {option.decisionSource !== "ai" && <span className="mood-wpill">Fallback</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
