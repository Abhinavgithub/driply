"use client";

import { ItemImage } from "@/components/item-image";
import { formatEnumLabel } from "@/lib/itemAttributes";
import type { OutfitItem, RecommendationOption } from "@/lib/types/wardrobe";

const COLOR_SWATCHES: Record<string, string> = {
  WHITE: "#f0ece4",
  BLACK: "#1a1a1a",
  GRAY: "#8a8a8a",
  NAVY: "#1a2d5a",
  BLUE: "#3a6eb5",
  LIGHT_BLUE: "#8abbe0",
  DENIM: "#4a6fa5",
  RED: "#c0392b",
  PINK: "#e8a0b0",
  ORANGE: "#e87722",
  YELLOW: "#f5c842",
  GREEN: "#2d7d46",
  OLIVE: "#6b7c3d",
  KHAKI: "#c4b490",
  BROWN: "#7d5a3c",
  BEIGE: "#e8d8c0",
  CREAM: "#f5edd5",
  PURPLE: "#7b5ca8",
  MAROON: "#7d2038",
};

function HeroTile({
  item,
  category,
  main,
  onSwap,
}: {
  item: OutfitItem;
  category: string;
  main?: boolean;
  onSwap: () => void;
}) {
  return (
    <div className={`outfit-hero-item${main ? " outfit-hero-main" : ""}`} onClick={onSwap}>
      <ItemImage itemId={item.id} src={item.photoUrl} alt={item.subtype} />
      <div className="outfit-item-tag">
        <div>
          <div className="outfit-item-tag-category">{category}</div>
          <div className="outfit-item-tag-name">{formatEnumLabel(item.subtype)}</div>
        </div>
        <div
          className="outfit-item-swatch"
          style={{ background: COLOR_SWATCHES[item.colorFamily] ?? "#888" }}
        />
      </div>
      <div className="outfit-swap-hint">↔ Another look</div>
    </div>
  );
}

/** Hero outfit collage: top (large) + bottom + shoes; clicking a tile swaps the look. */
export function OutfitHero({ option, onSwap }: { option: RecommendationOption; onSwap: () => void }) {
  return (
    <div className="outfit-hero">
      <HeroTile item={option.top} category="Top" main onSwap={onSwap} />
      <HeroTile item={option.bottom} category="Bottom" onSwap={onSwap} />
      <HeroTile item={option.shoe} category="Shoes" onSwap={onSwap} />
    </div>
  );
}
