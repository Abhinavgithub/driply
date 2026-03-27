import type {
  ColorFamily,
  Formality,
  Item,
  ItemKind,
  Pattern,
  StyleProfile,
  WarmthLevel,
} from "@prisma/client";

type ItemWithAttributes = Pick<
  Item,
  | "id"
  | "kind"
  | "subtype"
  | "photoUrl"
  | "colorFamily"
  | "pattern"
  | "styleProfile"
  | "formality"
  | "warmthLevel"
>;

type ScoreBreakdown = {
  temperatureC: number;
  precipitationMm: number;
  isRaining: boolean;
  weatherScore: number;
  colorHarmonyScore: number;
  styleConsistencyScore: number;
  formalityAlignmentScore: number;
  patternBalanceScore: number;
  warmthCoherenceScore: number;
  historyPenalty: number;
  unknownAttributeCount: number;
  metadataCompletenessPenalty: number;
  tieBreakerHash: number;
};

export type RecommendationResult = {
  top: ItemWithAttributes;
  bottom: ItemWithAttributes;
  shoe: ItemWithAttributes;
  totalScore: number;
  debugScores: ScoreBreakdown;
};

const WEATHER_WEIGHT = 0.45;
const COLOR_WEIGHT = 0.2;
const STYLE_WEIGHT = 0.15;
const FORMALITY_WEIGHT = 0.1;
const PATTERN_WEIGHT = 0.05;
const WARMTH_WEIGHT = 0.05;

const UNKNOWN_ATTRIBUTE_PENALTY = 0.12;

const neutralColors = new Set<ColorFamily>(["BLACK", "WHITE", "GREY", "BEIGE", "BROWN"]);
const accentColors = new Set<ColorFamily>(["RED", "PINK", "YELLOW", "GREEN"]);

const formalityScale: Record<Formality, number> = {
  RELAXED: 0,
  ELEVATED: 1,
  DRESSY: 2,
  UNKNOWN: 1,
};

const warmthScale: Record<WarmthLevel, number> = {
  LIGHT: 0,
  MID: 1,
  WARM: 2,
  UNKNOWN: 1,
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function rangeScore(value: number, min: number, max: number) {
  if (value >= min && value <= max) return 3;
  const dist = value < min ? min - value : value - max;
  return clamp(3 - dist * 0.25, -3, 3);
}

function hashString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function baseTempScore(kind: ItemKind, subtype: string, temperatureC: number) {
  const st = subtype.toLowerCase();
  switch (kind) {
    case "TOP": {
      if (st === "tshirt") return rangeScore(temperatureC, 22, 50);
      if (st === "long_sleeve") return rangeScore(temperatureC, 10, 22);
      if (st === "hoodie" || st === "sweater") return rangeScore(temperatureC, -10, 14);
      if (st === "jacket") return rangeScore(temperatureC, -50, 8);
      return rangeScore(temperatureC, 10, 22);
    }
    case "BOTTOM": {
      if (st === "shorts") return rangeScore(temperatureC, 18, 45);
      if (st === "jeans") return rangeScore(temperatureC, -10, 25);
      return rangeScore(temperatureC, -10, 25);
    }
    case "SHOE": {
      if (st === "sandals") return rangeScore(temperatureC, 22, 45);
      if (st === "boots") return rangeScore(temperatureC, -20, 14);
      if (st === "sneakers") return rangeScore(temperatureC, 5, 30);
      return rangeScore(temperatureC, 5, 30);
    }
  }
}

function rainBonusForCombo(args: {
  isRaining: boolean;
  temperatureC: number;
  precipitationMm: number;
  top: ItemWithAttributes;
  bottom: ItemWithAttributes;
  shoe: ItemWithAttributes;
}) {
  const { isRaining, temperatureC, top, bottom, shoe } = args;
  const topSt = top.subtype.toLowerCase();
  const bottomSt = bottom.subtype.toLowerCase();
  const shoeSt = shoe.subtype.toLowerCase();

  if (isRaining) {
    let score = 0;
    score += shoeSt === "boots" ? 4 : shoeSt === "sneakers" ? 1 : -4;
    score +=
      topSt === "tshirt"
        ? -2
        : topSt === "long_sleeve"
          ? -1
          : topSt === "hoodie" || topSt === "sweater" || topSt === "jacket"
            ? 2
            : 0;
    score += bottomSt === "jeans" ? 2 : bottomSt === "shorts" ? -3 : 0;

    const rainIntensity = clamp(args.precipitationMm / 10, 0, 1);
    return score * (0.7 + rainIntensity * 0.6);
  }

  let score = 0;
  score += shoeSt === "sandals" ? (temperatureC >= 22 ? 3 : -1) : shoeSt === "boots" ? -1 : 1;
  score += topSt === "tshirt" ? (temperatureC >= 22 ? 3 : -1) : topSt === "jacket" ? -1 : 1;
  score += bottomSt === "shorts" ? (temperatureC >= 18 ? 2 : -1) : bottomSt === "jeans" ? 1 : 0;
  return score;
}

function normalizeScore(value: number, min: number, max: number) {
  if (max === min) return 0;
  const scaled = ((value - min) / (max - min)) * 2 - 1;
  return clamp(scaled, -1, 1);
}

function pairColorScore(a: ColorFamily, b: ColorFamily) {
  if (a === "UNKNOWN" || b === "UNKNOWN") return 0;
  if (a === "MULTI" || b === "MULTI") return 0.15;
  if (a === b) return a === "BLACK" || a === "WHITE" || a === "GREY" ? 0.85 : 0.55;
  if (neutralColors.has(a) || neutralColors.has(b)) return 0.7;
  if ((a === "BLUE" && b === "GREEN") || (a === "GREEN" && b === "BLUE")) return 0.6;
  if ((a === "BLUE" && b === "YELLOW") || (a === "YELLOW" && b === "BLUE")) return 0.55;
  if ((a === "RED" && b === "PINK") || (a === "PINK" && b === "RED")) return 0.45;
  if (accentColors.has(a) && accentColors.has(b)) return -0.35;
  return 0.2;
}

function scoreColorHarmony(top: ItemWithAttributes, bottom: ItemWithAttributes, shoe: ItemWithAttributes) {
  const pairScores = [
    pairColorScore(top.colorFamily, bottom.colorFamily),
    pairColorScore(top.colorFamily, shoe.colorFamily),
    pairColorScore(bottom.colorFamily, shoe.colorFamily),
  ];
  return clamp((pairScores[0] * 1.2 + pairScores[1] + pairScores[2]) / 3.2, -1, 1);
}

function scorePatternBalance(top: ItemWithAttributes, bottom: ItemWithAttributes, shoe: ItemWithAttributes) {
  const patterns: Pattern[] = [top.pattern, bottom.pattern, shoe.pattern];
  const unknownCount = patterns.filter((pattern) => pattern === "UNKNOWN").length;
  if (unknownCount === patterns.length) return 0;

  const patternedCount = patterns.filter((pattern) => pattern !== "SOLID" && pattern !== "UNKNOWN").length;
  const solidCount = patterns.filter((pattern) => pattern === "SOLID").length;

  if (patternedCount === 0) return 0.35;
  if (patternedCount === 1 && solidCount >= 1) return 0.85;
  if (patternedCount === 2 && solidCount === 1) return -0.15;
  if (patternedCount === 3) return -0.7;
  return 0;
}

function pairStyleScore(a: StyleProfile, b: StyleProfile) {
  if (a === "UNKNOWN" || b === "UNKNOWN") return 0;
  if (a === b) return 1;
  if ((a === "CASUAL" && b === "SMART_CASUAL") || (a === "SMART_CASUAL" && b === "CASUAL")) return 0.55;
  if ((a === "CASUAL" && b === "ATHLEISURE") || (a === "ATHLEISURE" && b === "CASUAL")) return 0.7;
  if ((a === "SMART_CASUAL" && b === "FORMAL") || (a === "FORMAL" && b === "SMART_CASUAL")) return 0.45;
  if ((a === "ATHLEISURE" && b === "SMART_CASUAL") || (a === "SMART_CASUAL" && b === "ATHLEISURE")) return -0.2;
  if ((a === "ATHLEISURE" && b === "FORMAL") || (a === "FORMAL" && b === "ATHLEISURE")) return -0.9;
  if ((a === "CASUAL" && b === "FORMAL") || (a === "FORMAL" && b === "CASUAL")) return -0.75;
  return 0;
}

function scoreStyleConsistency(top: ItemWithAttributes, bottom: ItemWithAttributes, shoe: ItemWithAttributes) {
  return clamp(
    (pairStyleScore(top.styleProfile, bottom.styleProfile) * 1.2 +
      pairStyleScore(top.styleProfile, shoe.styleProfile) +
      pairStyleScore(bottom.styleProfile, shoe.styleProfile)) /
      3.2,
    -1,
    1,
  );
}

function scoreFormalityAlignment(top: ItemWithAttributes, bottom: ItemWithAttributes, shoe: ItemWithAttributes) {
  const values = [top.formality, bottom.formality, shoe.formality].map((value) => formalityScale[value]);
  const spread = Math.max(...values) - Math.min(...values);
  if (spread === 0) return 1;
  if (spread === 1) return 0.35;
  return -0.8;
}

function expectedWarmthForWeather(temperatureC: number, precipitationMm: number): WarmthLevel {
  if (precipitationMm >= 3 || temperatureC < 12) return "WARM";
  if (temperatureC < 22) return "MID";
  return "LIGHT";
}

function scoreWarmthCoherence(
  temperatureC: number,
  precipitationMm: number,
  top: ItemWithAttributes,
  bottom: ItemWithAttributes,
  shoe: ItemWithAttributes,
) {
  const target = warmthScale[expectedWarmthForWeather(temperatureC, precipitationMm)];
  const values = [top.warmthLevel, bottom.warmthLevel, shoe.warmthLevel].map((value) => warmthScale[value]);
  const meanDistance = values.reduce((sum, value) => sum + Math.abs(value - target), 0) / values.length;
  return clamp(1 - meanDistance * 0.75, -1, 1);
}

function countUnknownAttributes(items: ItemWithAttributes[]) {
  let total = 0;
  for (const item of items) {
    total += item.colorFamily === "UNKNOWN" ? 1 : 0;
    total += item.pattern === "UNKNOWN" ? 1 : 0;
    total += item.styleProfile === "UNKNOWN" ? 1 : 0;
    total += item.formality === "UNKNOWN" ? 1 : 0;
    total += item.warmthLevel === "UNKNOWN" ? 1 : 0;
  }
  return total;
}

function weatherSuitabilityScore(args: {
  isRaining: boolean;
  temperatureC: number;
  precipitationMm: number;
  top: ItemWithAttributes;
  bottom: ItemWithAttributes;
  shoe: ItemWithAttributes;
}) {
  const { isRaining, temperatureC, precipitationMm, top, bottom, shoe } = args;
  const topBase = baseTempScore(top.kind, top.subtype, temperatureC);
  const bottomBase = baseTempScore(bottom.kind, bottom.subtype, temperatureC);
  const shoeBase = baseTempScore(shoe.kind, shoe.subtype, temperatureC);
  const rainBonus = rainBonusForCombo({
    isRaining,
    temperatureC,
    precipitationMm,
    top,
    bottom,
    shoe,
  });

  return normalizeScore(topBase + bottomBase + shoeBase + rainBonus, -13, 13);
}

export function recommendOutfit(args: {
  dateKey: string;
  temperatureC: number;
  precipitationMm: number;
  tops: ItemWithAttributes[];
  bottoms: ItemWithAttributes[];
  shoes: ItemWithAttributes[];
  wornItemIds: Set<string>;
}): RecommendationResult {
  const ranked = rankOutfits({
    ...args,
    offset: 0,
    limit: 1,
  });
  if (!ranked.length) throw new Error("Missing wardrobe items to form an outfit.");
  return ranked[0];
}

export function rankOutfits(args: {
  dateKey: string;
  temperatureC: number;
  precipitationMm: number;
  tops: ItemWithAttributes[];
  bottoms: ItemWithAttributes[];
  shoes: ItemWithAttributes[];
  wornItemIds: Set<string>;
  offset: number;
  limit: number;
}): RecommendationResult[] {
  const { dateKey, temperatureC, precipitationMm, tops, bottoms, shoes, wornItemIds, offset, limit } = args;
  const isRaining = precipitationMm >= 0.1;

  if (offset < 0 || limit <= 0) return [];
  if (!tops.length || !bottoms.length || !shoes.length) return [];

  const maxKeep = offset + limit;
  const EPSILON = 1e-9;

  function isCandidateBetter(a: RecommendationResult, b: RecommendationResult) {
    if (a.totalScore > b.totalScore + EPSILON) return true;
    if (a.totalScore < b.totalScore - EPSILON) return false;
    return a.debugScores.tieBreakerHash < b.debugScores.tieBreakerHash;
  }

  function insertBest(arr: RecommendationResult[], cand: RecommendationResult) {
    let idx = arr.length;
    for (let i = 0; i < arr.length; i++) {
      if (isCandidateBetter(cand, arr[i])) {
        idx = i;
        break;
      }
    }
    arr.splice(idx, 0, cand);
    if (arr.length > maxKeep) arr.pop();
  }

  const bestCandidates: RecommendationResult[] = [];

  for (const top of tops) {
    for (const bottom of bottoms) {
      for (const shoe of shoes) {
        const weatherScore = weatherSuitabilityScore({
          isRaining,
          temperatureC,
          precipitationMm,
          top,
          bottom,
          shoe,
        });
        const colorHarmonyScore = scoreColorHarmony(top, bottom, shoe);
        const styleConsistencyScore = scoreStyleConsistency(top, bottom, shoe);
        const formalityAlignmentScore = scoreFormalityAlignment(top, bottom, shoe);
        const patternBalanceScore = scorePatternBalance(top, bottom, shoe);
        const warmthCoherenceScore = scoreWarmthCoherence(
          temperatureC,
          precipitationMm,
          top,
          bottom,
          shoe,
        );

        const historyPenalty =
          (wornItemIds.has(top.id) ? 1.8 : 0) +
          (wornItemIds.has(bottom.id) ? 1.8 : 0) +
          (wornItemIds.has(shoe.id) ? 1.8 : 0);

        const unknownAttributeCount = countUnknownAttributes([top, bottom, shoe]);
        const metadataCompletenessPenalty = unknownAttributeCount * UNKNOWN_ATTRIBUTE_PENALTY;

        const totalScore =
          weatherScore * WEATHER_WEIGHT +
          colorHarmonyScore * COLOR_WEIGHT +
          styleConsistencyScore * STYLE_WEIGHT +
          formalityAlignmentScore * FORMALITY_WEIGHT +
          patternBalanceScore * PATTERN_WEIGHT +
          warmthCoherenceScore * WARMTH_WEIGHT -
          historyPenalty * 0.1 -
          metadataCompletenessPenalty;

        const tieBreakerHash = hashString([top.id, bottom.id, shoe.id, dateKey].join("|"));

        const cand: RecommendationResult = {
          top,
          bottom,
          shoe,
          totalScore,
          debugScores: {
            temperatureC,
            precipitationMm,
            isRaining,
            weatherScore,
            colorHarmonyScore,
            styleConsistencyScore,
            formalityAlignmentScore,
            patternBalanceScore,
            warmthCoherenceScore,
            historyPenalty,
            unknownAttributeCount,
            metadataCompletenessPenalty,
            tieBreakerHash,
          },
        };

        if (bestCandidates.length < maxKeep) {
          insertBest(bestCandidates, cand);
          continue;
        }

        const worst = bestCandidates[bestCandidates.length - 1];
        if (isCandidateBetter(cand, worst)) insertBest(bestCandidates, cand);
      }
    }
  }

  return bestCandidates.slice(offset, offset + limit);
}

function explainColor(top: ItemWithAttributes, bottom: ItemWithAttributes, shoe: ItemWithAttributes) {
  const colors = [top.colorFamily, bottom.colorFamily, shoe.colorFamily];
  if (colors.every((value) => value === "UNKNOWN")) return null;
  if (colors.includes("MULTI")) return "the multi-color piece is grounded by simpler supporting colors";
  if (colors.filter((value) => value === "UNKNOWN").length > 0) return null;
  if (top.colorFamily === bottom.colorFamily || top.colorFamily === shoe.colorFamily) {
    return `the repeated ${top.colorFamily.toLowerCase()} tones keep the palette cohesive`;
  }
  if (neutralColors.has(bottom.colorFamily) || neutralColors.has(shoe.colorFamily)) {
    return "the neutral base keeps the outfit balanced";
  }
  return "the colors complement each other without fighting for attention";
}

function explainStyle(top: ItemWithAttributes, bottom: ItemWithAttributes, shoe: ItemWithAttributes) {
  const profiles = [top.styleProfile, bottom.styleProfile, shoe.styleProfile];
  if (profiles.every((value) => value === "UNKNOWN")) return null;
  if (profiles[0] === profiles[1] && profiles[1] === profiles[2] && profiles[0] !== "UNKNOWN") {
    return `all three pieces stay in a ${profiles[0].toLowerCase().replaceAll("_", " ")} lane`;
  }
  if (pairStyleScore(top.styleProfile, bottom.styleProfile) > 0.4) {
    return "the top and bottom share a compatible style profile";
  }
  return null;
}

function explainPattern(top: ItemWithAttributes, bottom: ItemWithAttributes, shoe: ItemWithAttributes) {
  const score = scorePatternBalance(top, bottom, shoe);
  if (score >= 0.7) return "one patterned piece stands out without making the outfit feel busy";
  if (score <= -0.3) return "the pattern mix is the weakest part of this look";
  return null;
}

export function formatOutfitExplanation(args: {
  temperatureC: number;
  precipitationMm: number;
  top: ItemWithAttributes;
  bottom: ItemWithAttributes;
  shoe: ItemWithAttributes;
}) {
  const { temperatureC, precipitationMm, top, bottom, shoe } = args;
  const isRaining = precipitationMm >= 0.1;

  const tempLabel =
    temperatureC < 0
      ? "freezing"
      : temperatureC < 10
        ? "cold"
        : temperatureC < 18
          ? "cool"
          : temperatureC < 25
            ? "mild"
            : "warm";

  const reasons = [explainColor(top, bottom, shoe), explainStyle(top, bottom, shoe), explainPattern(top, bottom, shoe)]
    .filter((value): value is string => Boolean(value))
    .slice(0, 2);

  const weatherLead = isRaining
    ? `It’s ${tempLabel} with rain, so this combo stays weather-appropriate.`
    : `It’s ${tempLabel}, and this combo fits the weather.`;

  if (!reasons.length) return weatherLead;

  return `${weatherLead} It also works because ${reasons.join(" and ")}.`;
}
