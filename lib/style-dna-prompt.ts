import type { StylePreferences } from "@/lib/style-preferences";
import type { ColorFamily, Formality, StyleProfile } from "@prisma/client";

export type WardrobeSummary = {
  dominantColors: ColorFamily[];
  dominantStyles: StyleProfile[];
  dominantFormality: Formality | null;
  itemCount: number;
};

const SEED_ARCHETYPES = [
  "Clean Minimalist",
  "Retro Rebel",
  "Soft Streetwear",
  "Neo Formal",
  "Urban Monochrome",
  "Coastal Casual",
  "Dark Academia",
  "Quiet Luxury",
  "Athleisure Edge",
  "Earth Romantic",
  "Maximalist Bold",
  "Preppy Modern",
];

function describePreferences(prefs: StylePreferences): string {
  const dressMap: Record<StylePreferences["dressCode"], string> = {
    casual: "casual / relaxed",
    smart_casual: "smart casual / polished but comfortable",
    office: "professional / office-appropriate",
    formal: "formal / dressy",
  };
  const lifestyleMap: Record<StylePreferences["lifestyle"], string> = {
    wfh: "works from home",
    office: "office-based",
    active: "active and outdoors",
    mixed: "mixed lifestyle",
  };
  const priorityMap: Record<StylePreferences["priority"], string> = {
    comfort: "prioritises comfort above everything",
    balanced: "balances comfort and style equally",
    style: "prioritises style and looking sharp",
  };
  const paletteMap: Record<StylePreferences["colorPalette"], string> = {
    neutrals: "gravitates toward black, white, grey, and beige",
    earth: "loves earth tones — browns, olives, rust, cream",
    bold: "prefers bold and saturated statement colors",
    mixed: "has no strong color preference",
  };
  const tempMap: Record<StylePreferences["tempSensitivity"], string> = {
    cold: "tends to run cold and layers up",
    average: "has average temperature sensitivity",
    warm: "runs warm and prefers lighter fabrics",
  };

  return [
    `Dress code: ${dressMap[prefs.dressCode]}`,
    `Lifestyle: ${lifestyleMap[prefs.lifestyle]}`,
    `Priority: ${priorityMap[prefs.priority]}`,
    `Color: ${paletteMap[prefs.colorPalette]}`,
    `Temperature: ${tempMap[prefs.tempSensitivity]}`,
  ].join(". ");
}

function describeWardrobe(summary: WardrobeSummary): string {
  if (summary.itemCount < 3) return "";
  const colors = summary.dominantColors
    .slice(0, 3)
    .map((c) => c.toLowerCase())
    .join(", ");
  const styles = summary.dominantStyles
    .slice(0, 3)
    .map((s) => s.replace("_", " ").toLowerCase())
    .join(", ");
  const formality = summary.dominantFormality?.toLowerCase() ?? null;
  const parts = [
    colors ? `Dominant wardrobe colors: ${colors}` : null,
    styles ? `Dominant style profiles: ${styles}` : null,
    formality ? `Typical formality level: ${formality}` : null,
    `Total items: ${summary.itemCount}`,
  ].filter(Boolean);
  return parts.join(". ");
}

export function buildStyleDnaTextPrompt(
  prefs: StylePreferences,
  wardrobeSummary?: WardrobeSummary,
): string {
  const prefDesc = describePreferences(prefs);
  const wardrobeDesc = wardrobeSummary ? describeWardrobe(wardrobeSummary) : "";

  return `You are a fashion identity analyst for a Gen-Z fashion app called Driply. Your job is to generate a personalized Style DNA profile for a user based on their quiz answers and optional wardrobe data.

USER PROFILE:
${prefDesc}${wardrobeDesc ? `\n\nWARDROBE DATA:\n${wardrobeDesc}` : ""}

KNOWN ARCHETYPES (choose the best fit, or invent a new 1–3 word archetype if none fit):
${SEED_ARCHETYPES.join(", ")}

Generate a Style DNA profile as a JSON object with these exact fields:
- archetypeName: string — 1 to 3 words, title-case, punchy and evocative
- description: string — exactly 2 sentences, Gen-Z friendly tone, under 200 characters total. Describe their vibe and what makes their style unique.
- traits: array of 3 to 5 strings — short descriptors (max 20 chars each), like "Minimal", "Relaxed silhouettes", "Neutral palette"
- colorPalette: array of exactly 5 hex color codes — real fashion-relevant colors that match this archetype (format: "#RRGGBB")
- imagePromptHints: array of 3 to 5 strings — aesthetic descriptors for an AI moodboard image generator, like "editorial high-contrast", "film grain texture", "clean white space", "moody shadows"

Rules:
- archetypeName must be 1–3 words, no punctuation
- description must be 2 sentences max, conversational Gen-Z tone
- traits must be 3–5 items, each under 20 characters
- colorPalette must be exactly 5 valid hex codes
- imagePromptHints must be 3–5 fashion-editorial descriptors, no brand names
- Respond ONLY with valid JSON — no markdown, no explanation`;
}

export function buildStyleDnaImagePrompt(dna: {
  archetypeName: string;
  traits: string[];
  colorPalette: string[];
  imagePromptHints: string[];
}): string {
  const namedColors = dna.colorPalette
    .slice(0, 3)
    .map((hex) => hexToColorName(hex))
    .join(", ");

  const hints = dna.imagePromptHints.join(", ");
  const traits = dna.traits.join(", ");

  return `Fashion moodboard, editorial magazine spread aesthetic. Style archetype: ${dna.archetypeName}. Mood and visual style: ${hints}. Key fashion elements: ${traits}. Color palette: predominantly ${namedColors}. Composition: asymmetric grid, premium fashion-tech look, clean geometric shapes, no faces, no people, no readable text, no watermarks, no brand logos. Pure fashion objects, textures, and abstract shapes only. Ultra high quality, 8K detail.`;
}

export function hexToColorName(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  const l = (max + min) / 2 / 255;
  const s = chroma === 0 ? 0 : chroma / (1 - Math.abs(2 * l - 1)) / 255;

  // Achromatic / near-neutral (low saturation)
  if (s < 0.12) {
    if (l < 0.1) return "jet black";
    if (l < 0.22) return "charcoal";
    if (l < 0.38) return "dark grey";
    if (l < 0.54) return "mid grey";
    if (l < 0.68) return "cool grey";
    if (l < 0.8) return "silver";
    // Distinguish warm near-whites (cream/ivory) from cool near-whites
    if (r > b + 10) return l > 0.9 ? "ivory" : "warm white";
    return l > 0.9 ? "pure white" : "pearl";
  }

  // Compute hue (0–360)
  let hue = 0;
  if (max === r) hue = (((g - b) / chroma + 6) % 6) * 60;
  else if (max === g) hue = ((b - r) / chroma + 2) * 60;
  else hue = ((r - g) / chroma + 4) * 60;

  // Light / pastel range
  if (l > 0.72) {
    if (hue < 30 || hue >= 330) return "blush";
    if (hue < 65) return "cream";
    if (hue < 150) return "sage";
    if (hue < 255) return "powder blue";
    return "lavender";
  }

  // Saturated / mid-dark
  if (hue < 20 || hue >= 345) return l < 0.3 ? "deep red" : "red";
  if (hue < 40) return "burnt orange";
  if (hue < 65) return "warm amber";
  if (hue < 80) return "gold";
  if (hue < 100) return "olive";
  if (hue < 155) return l < 0.35 ? "forest green" : "green";
  if (hue < 195) return l < 0.35 ? "teal" : "seafoam";
  if (hue < 255) return l < 0.28 ? "navy" : "sky blue";
  if (hue < 285) return l < 0.28 ? "deep indigo" : "periwinkle";
  if (hue < 320) return l < 0.35 ? "plum" : "violet";
  return l < 0.35 ? "wine" : "mauve";
}

export function buildRuleBasedDna(prefs: StylePreferences): {
  archetypeName: string;
  description: string;
  traits: string[];
  colorPalette: string[];
  imagePromptHints: string[];
} {
  const { dressCode, priority, colorPalette, lifestyle } = prefs;

  if (dressCode === "formal" && priority === "style") {
    return {
      archetypeName: "Neo Formal",
      description:
        "You bring serious tailoring energy to every room you enter. Sharp lines, elevated fits, and zero compromise.",
      traits: ["Tailored fits", "Monochrome", "Dressy", "Sharp cuts", "Statement pieces"],
      colorPalette: ["#1a1a1a", "#2c2c2c", "#f5f5f0", "#8b7355", "#d4af37"],
      imagePromptHints: [
        "editorial high-contrast",
        "clean geometric composition",
        "premium fashion-tech",
        "dramatic shadows",
      ],
    };
  }
  if (colorPalette === "neutrals" && priority !== "comfort") {
    return {
      archetypeName: "Clean Minimalist",
      description:
        "You keep it stripped back and intentional — every piece earns its place. Less noise, more impact.",
      traits: ["Minimal", "Neutral palette", "Clean lines", "Effortless", "Timeless"],
      colorPalette: ["#f0f0ee", "#c8c4bc", "#2a2a2a", "#8c8880", "#e8e0d5"],
      imagePromptHints: [
        "high-key lighting",
        "clean white space",
        "minimalist composition",
        "fine editorial details",
      ],
    };
  }
  if (lifestyle === "active" || dressCode === "casual") {
    return {
      archetypeName: "Soft Streetwear",
      description:
        "You mix comfort and cool like it's second nature — relaxed but always on point. Drip that moves with you.",
      traits: ["Streetwear", "Relaxed fit", "Layered", "Casual", "Urban"],
      colorPalette: ["#2d2d2d", "#8b9e87", "#d4cfc8", "#5c5247", "#a0937d"],
      imagePromptHints: [
        "urban textures",
        "film grain",
        "street photography aesthetic",
        "layered composition",
      ],
    };
  }
  if (colorPalette === "earth") {
    return {
      archetypeName: "Earth Romantic",
      description:
        "Warm tones and natural textures are your language. You dress like the outdoors feel when it's golden hour.",
      traits: ["Earth tones", "Natural fabrics", "Warm palette", "Relaxed", "Organic"],
      colorPalette: ["#8b6914", "#c4955a", "#d4b896", "#6b5a3e", "#e8d5b0"],
      imagePromptHints: [
        "warm golden light",
        "natural linen textures",
        "organic composition",
        "earthy editorial",
      ],
    };
  }
  if (colorPalette === "bold") {
    return {
      archetypeName: "Maximalist Bold",
      description:
        "You walk in and the room notices — no accidental outfit, every choice is a statement. Bold or nothing.",
      traits: ["Bold colors", "Maximalist", "Statement looks", "Expressive", "High-impact"],
      colorPalette: ["#c0392b", "#2980b9", "#f39c12", "#27ae60", "#8e44ad"],
      imagePromptHints: [
        "saturated editorial",
        "overlapping elements",
        "pattern mixing",
        "maximalist grid",
        "vibrant color blocking",
      ],
    };
  }
  return {
    archetypeName: "Urban Monochrome",
    description:
      "You move through the city in clean, considered looks that do the talking. Smart, modern, unfussy.",
    traits: ["Monochrome", "Smart casual", "Polished", "Modern", "Structured"],
    colorPalette: ["#1c1c1c", "#4a4a4a", "#8a8a8a", "#d0d0d0", "#f2f2f2"],
    imagePromptHints: [
      "editorial monochrome",
      "clean shadows",
      "urban fashion photography",
      "structured minimalism",
    ],
  };
}
