import {
  buildFallbackVisualSummary,
  getAiRecommenderDisabledReason,
  getGeminiErrorCode,
  getGeminiErrorMessage,
  isAiRecommenderEnabled,
  rerankOutfitCandidates,
} from "@/lib/gemini";
import {
  getRecommendationCandidateId,
  type ItemWithAttributes,
  type RecommendationResult,
} from "@/lib/recommendation";

export type RecommendationDecisionSource = "ai" | "algorithm_fallback";

export type RecommendationDecision = {
  options: RecommendationResult[];
  decisionSource: RecommendationDecisionSource;
  decisionConfidence: number | null;
  aiReason: string | null;
};

const SHORTLIST_LIMIT = 3;
const MIN_AI_CONFIDENCE = 0.2;

function itemSummary(item: ItemWithAttributes) {
  return {
    subtype: item.subtype,
    colorFamily: item.colorFamily,
    pattern: item.pattern,
    styleProfile: item.styleProfile,
    formality: item.formality,
    warmthLevel: item.warmthLevel,
    visualSummary:
      item.visualSummary ||
      buildFallbackVisualSummary({
        subtype: item.subtype,
        attributes: {
          colorFamily: item.colorFamily,
          pattern: item.pattern,
          styleProfile: item.styleProfile,
          formality: item.formality,
          warmthLevel: item.warmthLevel,
        },
      }),
  };
}

export async function applyAiRecommendationRerank(args: {
  temperatureC: number;
  precipitationMm: number;
  rankedOptions: RecommendationResult[];
}) {
  const { temperatureC, precipitationMm, rankedOptions } = args;

  if (!isAiRecommenderEnabled()) {
    console.info("[gemini:rerank] fallback", {
      reason: getAiRecommenderDisabledReason(),
      candidateCount: rankedOptions.length,
    });
    return {
      options: rankedOptions,
      decisionSource: "algorithm_fallback",
      decisionConfidence: null,
      aiReason: null,
    } satisfies RecommendationDecision;
  }

  if (rankedOptions.length < 2) {
    console.info("[gemini:rerank] fallback", {
      reason: "Not enough ranked candidates for reranking",
      candidateCount: rankedOptions.length,
    });
    return {
      options: rankedOptions,
      decisionSource: "algorithm_fallback",
      decisionConfidence: null,
      aiReason: null,
    } satisfies RecommendationDecision;
  }

  const shortlist = rankedOptions.slice(0, SHORTLIST_LIMIT);
  const shortlistById = new Map(
    shortlist.map((option) => [getRecommendationCandidateId(option), option] as const),
  );

  try {
    const reranked = await rerankOutfitCandidates({
      weather: { temperatureC, precipitationMm },
      candidates: shortlist.map((option) => ({
        candidateId: getRecommendationCandidateId(option),
        weatherScore: option.debugScores.weatherScore,
        recentWearCount:
          Number(option.debugScores.historyPenalty >= 1.8) +
          Number(option.debugScores.historyPenalty >= 3.6) +
          Number(option.debugScores.historyPenalty >= 5.4),
        top: itemSummary(option.top),
        bottom: itemSummary(option.bottom),
        shoe: itemSummary(option.shoe),
      })),
    });

    if (
      reranked.confidence < MIN_AI_CONFIDENCE ||
      !shortlistById.has(reranked.chosenCandidateId)
    ) {
      console.info("[gemini:rerank] fallback", {
        reason:
          reranked.confidence < MIN_AI_CONFIDENCE
            ? "Gemini confidence below minimum threshold"
            : "Gemini returned a candidate ID outside the shortlist",
        confidence: reranked.confidence,
        minConfidence: MIN_AI_CONFIDENCE,
        chosenCandidateId: reranked.chosenCandidateId,
        shortlistCandidateIds: shortlist.map((option) => getRecommendationCandidateId(option)),
      });
      return {
        options: rankedOptions,
        decisionSource: "algorithm_fallback",
        decisionConfidence: null,
        aiReason: null,
      } satisfies RecommendationDecision;
    }

    const orderedCandidateIds = [
      reranked.chosenCandidateId,
      ...reranked.orderedCandidateIds.filter((candidateId) => candidateId !== reranked.chosenCandidateId),
    ].filter((candidateId, index, all) => shortlistById.has(candidateId) && all.indexOf(candidateId) === index);

    const rerankedShortlist: RecommendationResult[] = [];
    for (const candidateId of orderedCandidateIds) {
      const option = shortlistById.get(candidateId);
      if (option) rerankedShortlist.push(option);
    }
    for (const option of shortlist) {
      if (!orderedCandidateIds.includes(getRecommendationCandidateId(option))) {
        rerankedShortlist.push(option);
      }
    }

    console.info("[gemini:rerank] ai_selected", {
      chosenCandidateId: reranked.chosenCandidateId,
      confidence: reranked.confidence,
      candidateCount: shortlist.length,
    });

    return {
      options: [...rerankedShortlist, ...rankedOptions.slice(shortlist.length)],
      decisionSource: "ai",
      decisionConfidence: reranked.confidence,
      aiReason: reranked.reason,
    } satisfies RecommendationDecision;
  } catch (error) {
    console.info("[gemini:rerank] fallback", {
      reason: "Gemini rerank request failed",
      code: getGeminiErrorCode(error),
      message: getGeminiErrorMessage(error),
      candidateCount: shortlist.length,
    });
    return {
      options: rankedOptions,
      decisionSource: "algorithm_fallback",
      decisionConfidence: null,
      aiReason: null,
    } satisfies RecommendationDecision;
  }
}
