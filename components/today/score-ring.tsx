"use client";

import { useEffect, useState } from "react";

import type { RecommendationOption } from "@/lib/types/wardrobe";

type ScoreRingProps = {
  option: RecommendationOption;
  displayName: string | null;
  archetypeName: string | null;
};

/**
 * Animated fit-score ring with per-factor mini bars. Render with a key that
 * changes per option (e.g. the selected index) so the count-up restarts from
 * zero on every new outfit.
 */
export function ScoreRing({ option, displayName, archetypeName }: ScoreRingProps) {
  const [scoreDisplay, setScoreDisplay] = useState(0);
  const [scoreAnimated, setScoreAnimated] = useState(false);

  useEffect(() => {
    const target = Math.round(option.totalScore * 100);
    let rafId: number | null = null;
    const timer = setTimeout(() => {
      setScoreAnimated(true);
      let val = 0;
      const step = () => {
        val = Math.min(val + 2, target);
        setScoreDisplay(val);
        if (val < target) rafId = requestAnimationFrame(step);
      };
      rafId = requestAnimationFrame(step);
    }, 300);
    return () => {
      clearTimeout(timer);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [option.totalScore]);

  return (
    <div className="score-ring-section">
      <div className="score-ring-wrap">
        <svg width="108" height="108" viewBox="0 0 108 108">
          <circle className="ring-track" cx="54" cy="54" r="46" />
          <circle
            className="ring-fill"
            cx="54"
            cy="54"
            r="46"
            style={{
              strokeDashoffset: scoreAnimated ? 289 - 289 * option.totalScore : 289,
            }}
          />
        </svg>
        <div className="score-ring-center">
          <div className="score-ring-num">{scoreDisplay}</div>
          <div className="score-ring-label">fit score</div>
        </div>
      </div>
      <div className="score-ring-details">
        <div className="score-ring-title">
          {displayName ? (
            <>
              Looking sharp, <strong>{displayName}</strong> ✦
            </>
          ) : (
            "Looking sharp ✦"
          )}
        </div>
        {archetypeName && (
          <div className="sdna-archetype-badge" style={{ marginTop: 6 }}>
            ✦ {archetypeName}
          </div>
        )}
        <div className="score-mini-bars">
          {[
            { label: "Weather", value: option.debugScores.weatherScore },
            {
              label: "Color harmony",
              value: option.debugScores.colorHarmonyScore,
              warm: true,
            },
            {
              label: "Style cohesion",
              value: option.debugScores.styleConsistencyScore,
            },
            {
              label: "Formality",
              value: option.debugScores.formalityAlignmentScore,
            },
          ].map(({ label, value, warm }) => (
            <div key={label} className="score-mini-row">
              <span className="score-mini-label">{label}</span>
              <div className="score-mini-track">
                <div
                  className={`score-mini-fill${warm ? " warm" : ""}`}
                  style={{
                    transform: scoreAnimated ? `scaleX(${value})` : "scaleX(0)",
                  }}
                />
              </div>
              <span className="score-mini-val">{Math.round(value * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
