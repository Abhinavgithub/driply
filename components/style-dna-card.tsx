"use client";

import { hexToColorName } from "@/lib/style-dna-prompt";

type StyleDnaCardProps = {
  archetypeName: string;
  description: string;
  traits: string[];
  colorPalette: string[];
  onRegenerate?: () => void;
  regenDisabled?: boolean;
  regenCountdown?: string | null;
  showShareButton?: boolean;
  userId?: string;
};

export function StyleDnaCard({
  archetypeName,
  description,
  traits,
  colorPalette,
  onRegenerate,
  regenDisabled,
  regenCountdown,
  showShareButton,
  userId,
}: StyleDnaCardProps) {
  const palette = colorPalette.slice(0, 5);

  async function handleShare() {
    if (!userId) return;
    const url = `${window.location.origin}/api/style-dna/og/${userId}`;
    if (navigator.share) {
      await navigator.share({ title: `My Style DNA: ${archetypeName}`, url }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url).catch(() => {});
      alert("Link copied to clipboard!");
    }
  }

  return (
    <div className="sdna-card">
      {/* Content */}
      <div className="sdna-content">
        <div className="sdna-label">STYLE DNA</div>
        <h2 className="sdna-archetype">{archetypeName}</h2>
        <p className="sdna-description">{description}</p>

        {/* Traits */}
        <div className="sdna-traits">
          {traits.map((trait) => (
            <span key={trait} className="sdna-trait">
              {trait}
            </span>
          ))}
        </div>

        {/* Color palette */}
        <div className="sdna-palette">
          {palette.map((color) => (
            <div
              key={color}
              className="sdna-swatch"
              style={{ background: color }}
              data-color-name={hexToColorName(color).replace(/\b\w/g, (c) => c.toUpperCase())}
            />
          ))}
        </div>

        {/* Actions */}
        {(onRegenerate || showShareButton) && (
          <div className="sdna-actions">
            {showShareButton && userId && (
              <button type="button" onClick={handleShare} className="sdna-btn-secondary">
                Share
              </button>
            )}
            {onRegenerate && (
              <button
                type="button"
                onClick={onRegenerate}
                disabled={regenDisabled}
                className="sdna-btn-regen"
                title={regenCountdown ? `Available in ${regenCountdown}` : undefined}
              >
                {regenDisabled && regenCountdown ? `Refresh in ${regenCountdown}` : "Refresh DNA"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
