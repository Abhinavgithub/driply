import type { ItemAttributeValues } from "@/lib/itemAttributes";
import type { StylePreferences } from "@/lib/style-preferences";

// Client-side shapes of API responses, shared across pages so they can't
// drift apart. Server routes remain the source of truth.

export type ItemKind = "TOP" | "BOTTOM" | "SHOE";
export type AnalysisStatus = "PENDING" | "READY" | "FAILED" | "SKIPPED";
export type MetadataSource = "MANUAL" | "AI" | "MIXED";

/** Full wardrobe item as returned by GET /api/items. `photoUrl` is a signed URL. */
export type WardrobeItem = {
  id: string;
  createdAt: string;
  kind: ItemKind;
  subtype: string;
  photoUrl: string;
  analysisStatus: AnalysisStatus;
  metadataSource: MetadataSource;
  visualSummary: string | null;
  analysisConfidence: number | null;
} & ItemAttributeValues;

/** Item subset embedded in recommendation responses. */
export type OutfitItem = Pick<
  WardrobeItem,
  "id" | "kind" | "subtype" | "photoUrl" | "visualSummary"
> &
  ItemAttributeValues;

export type RecommendationDebugScores = {
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

export type RecommendationOption = {
  top: OutfitItem;
  bottom: OutfitItem;
  shoe: OutfitItem;
  explanation: string;
  decisionSource: "ai" | "algorithm_fallback";
  decisionConfidence: number | null;
  aiReason: string | null;
  totalScore: number;
  debugScores: RecommendationDebugScores;
};

/** GET /api/recommendations (plural, paginated). */
export type RecommendationOptionsResponse = {
  dateKey: string;
  options: RecommendationOption[];
  offset: number;
  limit: number;
  decisionSource: "ai" | "algorithm_fallback";
  decisionConfidence: number | null;
  aiReason: string | null;
};

/** Per-category gaps reported on the recommendations error body. */
export type RecommendationNeeds = { top: boolean; bottom: boolean; shoe: boolean };

/** Entry in GET /api/outfits `history`. Photo URLs are null for deleted items. */
export type WornHistoryItem = {
  id: string;
  dateKey: string;
  topPhotoUrl: string | null;
  bottomPhotoUrl: string | null;
  shoePhotoUrl: string | null;
};

/** GET /api/profile. */
export type ProfileResponse = {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  aiTryOnPhotoUrl: string | null;
  hasTryOnPhoto: boolean;
  stylePreferences: StylePreferences | null;
};
