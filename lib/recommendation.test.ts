import { describe, expect, it } from "vitest";

import {
  formatOutfitExplanation,
  getRecommendationCandidateId,
  rankOutfits,
  recommendOutfit,
  type ItemWithAttributes,
} from "@/lib/recommendation";

function makeItem(
  overrides: Partial<ItemWithAttributes> & Pick<ItemWithAttributes, "id">,
): ItemWithAttributes {
  return {
    kind: "TOP",
    subtype: "tshirt",
    photoUrl: `storage/${overrides.id}.jpg`,
    visualSummary: null,
    colorFamily: "BLACK",
    pattern: "SOLID",
    styleProfile: "CASUAL",
    formality: "RELAXED",
    warmthLevel: "LIGHT",
    ...overrides,
  };
}

const DATE = "2026-06-13";

// A simple, fully-specified summer wardrobe (one item per slot).
const summerTop = makeItem({ id: "t1", kind: "TOP", subtype: "tshirt" });
const summerBottom = makeItem({ id: "b1", kind: "BOTTOM", subtype: "shorts" });
const summerShoe = makeItem({ id: "s1", kind: "SHOE", subtype: "sneakers" });

function rankSingle(overrides?: { wornItemIds?: Set<string> }) {
  return rankOutfits({
    dateKey: DATE,
    temperatureC: 25,
    precipitationMm: 0,
    tops: [summerTop],
    bottoms: [summerBottom],
    shoes: [summerShoe],
    wornItemIds: overrides?.wornItemIds ?? new Set(),
    offset: 0,
    limit: 1,
  });
}

describe("getRecommendationCandidateId", () => {
  it("joins the three item ids with a pipe", () => {
    expect(
      getRecommendationCandidateId({ top: summerTop, bottom: summerBottom, shoe: summerShoe }),
    ).toBe("t1|b1|s1");
  });
});

describe("rankOutfits guards", () => {
  it("returns [] when any category is empty", () => {
    expect(
      rankOutfits({
        dateKey: DATE,
        temperatureC: 25,
        precipitationMm: 0,
        tops: [],
        bottoms: [summerBottom],
        shoes: [summerShoe],
        wornItemIds: new Set(),
        offset: 0,
        limit: 5,
      }),
    ).toEqual([]);
  });

  it("returns [] for non-positive limit or negative offset", () => {
    const common = {
      dateKey: DATE,
      temperatureC: 25,
      precipitationMm: 0,
      tops: [summerTop],
      bottoms: [summerBottom],
      shoes: [summerShoe],
      wornItemIds: new Set<string>(),
    };
    expect(rankOutfits({ ...common, offset: 0, limit: 0 })).toEqual([]);
    expect(rankOutfits({ ...common, offset: -1, limit: 1 })).toEqual([]);
  });
});

describe("scoring weights", () => {
  it("totalScore equals the documented weighted sum of the debug scores", () => {
    const r = rankSingle()[0];
    const d = r.debugScores;
    const expected =
      d.weatherScore * 0.45 +
      d.colorHarmonyScore * 0.2 +
      d.styleConsistencyScore * 0.15 +
      d.formalityAlignmentScore * 0.1 +
      d.patternBalanceScore * 0.05 +
      d.warmthCoherenceScore * 0.05 -
      d.historyPenalty * 0.1 -
      d.metadataCompletenessPenalty;
    expect(r.totalScore).toBeCloseTo(expected, 10);
  });

  it("penalizes unknown attributes at 0.12 each", () => {
    const top = makeItem({
      id: "t1",
      kind: "TOP",
      subtype: "tshirt",
      colorFamily: "UNKNOWN",
      pattern: "UNKNOWN",
    });
    const r = rankOutfits({
      dateKey: DATE,
      temperatureC: 25,
      precipitationMm: 0,
      tops: [top],
      bottoms: [summerBottom],
      shoes: [summerShoe],
      wornItemIds: new Set(),
      offset: 0,
      limit: 1,
    })[0];
    expect(r.debugScores.unknownAttributeCount).toBe(2);
    expect(r.debugScores.metadataCompletenessPenalty).toBeCloseTo(0.24, 10);
  });

  it("shifts the score when style preferences re-weight the factors", () => {
    // Outfit with a non-uniform factor profile so re-weighting moves the total.
    const tops = [
      makeItem({
        id: "t1",
        kind: "TOP",
        subtype: "shirt",
        formality: "DRESSY",
        styleProfile: "FORMAL",
      }),
    ];
    const bottoms = [
      makeItem({
        id: "b1",
        kind: "BOTTOM",
        subtype: "jeans",
        formality: "DRESSY",
        styleProfile: "FORMAL",
      }),
    ];
    const shoes = [
      makeItem({
        id: "s1",
        kind: "SHOE",
        subtype: "boots",
        formality: "DRESSY",
        styleProfile: "FORMAL",
      }),
    ];
    const common = {
      dateKey: DATE,
      temperatureC: 25,
      precipitationMm: 0,
      tops,
      bottoms,
      shoes,
      wornItemIds: new Set<string>(),
      offset: 0,
      limit: 1,
    };
    const neutral = rankOutfits(common)[0];
    const formal = rankOutfits({
      ...common,
      stylePreferences: {
        dressCode: "formal",
        lifestyle: "office",
        priority: "style",
        colorPalette: "neutrals",
        tempSensitivity: "average",
      },
    })[0];
    expect(formal.totalScore).not.toBeCloseTo(neutral.totalScore, 10);
  });
});

describe("repeat penalty", () => {
  it("adds 1.8 per recently-worn item and subtracts 0.1x from the total", () => {
    const base = rankSingle()[0];
    const worn = rankSingle({ wornItemIds: new Set(["t1"]) })[0];
    expect(base.debugScores.historyPenalty).toBe(0);
    expect(worn.debugScores.historyPenalty).toBe(1.8);
    expect(base.totalScore - worn.totalScore).toBeCloseTo(0.18, 10);
  });

  it("stacks the penalty across multiple worn items", () => {
    const worn = rankSingle({ wornItemIds: new Set(["t1", "b1", "s1"]) })[0];
    expect(worn.debugScores.historyPenalty).toBeCloseTo(5.4, 10);
  });
});

describe("ranking and pagination", () => {
  const tops = [
    makeItem({ id: "tshirt", kind: "TOP", subtype: "tshirt" }),
    makeItem({ id: "jacket", kind: "TOP", subtype: "jacket" }),
  ];

  it("orders candidates by descending totalScore", () => {
    const ranked = rankOutfits({
      dateKey: DATE,
      temperatureC: 30,
      precipitationMm: 0,
      tops,
      bottoms: [summerBottom],
      shoes: [summerShoe],
      wornItemIds: new Set(),
      offset: 0,
      limit: 5,
    });
    expect(ranked).toHaveLength(2);
    expect(ranked[0].totalScore).toBeGreaterThanOrEqual(ranked[1].totalScore);
    // At 30°C the t-shirt outfit must win over the jacket.
    expect(ranked[0].top.id).toBe("tshirt");
  });

  it("paginates: offset advances past the best candidate", () => {
    const common = {
      dateKey: DATE,
      temperatureC: 30,
      precipitationMm: 0,
      tops,
      bottoms: [summerBottom],
      shoes: [summerShoe],
      wornItemIds: new Set<string>(),
    };
    const first = rankOutfits({ ...common, offset: 0, limit: 1 });
    const second = rankOutfits({ ...common, offset: 1, limit: 1 });
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0].top.id).not.toBe(second[0].top.id);
    expect(first[0].totalScore).toBeGreaterThanOrEqual(second[0].totalScore);
  });
});

describe("determinism (tie-breaker)", () => {
  it("produces a stable order for equally-scored outfits across runs", () => {
    // Two tops with identical attributes but different ids tie on score and are
    // ordered by the deterministic tie-breaker hash.
    const tops = [
      makeItem({ id: "alpha", kind: "TOP", subtype: "tshirt" }),
      makeItem({ id: "bravo", kind: "TOP", subtype: "tshirt" }),
    ];
    const args = {
      dateKey: DATE,
      temperatureC: 25,
      precipitationMm: 0,
      tops,
      bottoms: [summerBottom],
      shoes: [summerShoe],
      wornItemIds: new Set<string>(),
      offset: 0,
      limit: 2,
    };
    const run1 = rankOutfits(args).map(getRecommendationCandidateId);
    const run2 = rankOutfits(args).map(getRecommendationCandidateId);
    expect(run1).toEqual(run2);
    expect(run1).toHaveLength(2);
  });
});

describe("recommendOutfit", () => {
  it("returns the single best outfit", () => {
    const result = recommendOutfit({
      dateKey: DATE,
      temperatureC: 30,
      precipitationMm: 0,
      tops: [
        makeItem({ id: "tshirt", kind: "TOP", subtype: "tshirt" }),
        makeItem({ id: "jacket", kind: "TOP", subtype: "jacket" }),
      ],
      bottoms: [summerBottom],
      shoes: [summerShoe],
      wornItemIds: new Set(),
    });
    expect(result.top.id).toBe("tshirt");
  });

  it("throws when the wardrobe is missing a category", () => {
    expect(() =>
      recommendOutfit({
        dateKey: DATE,
        temperatureC: 25,
        precipitationMm: 0,
        tops: [summerTop],
        bottoms: [],
        shoes: [summerShoe],
        wornItemIds: new Set(),
      }),
    ).toThrow();
  });
});

describe("formatOutfitExplanation", () => {
  it("describes dry weather without mentioning rain", () => {
    const text = formatOutfitExplanation({
      temperatureC: 25,
      precipitationMm: 0,
      top: summerTop,
      bottom: summerBottom,
      shoe: summerShoe,
    });
    expect(text).toContain("warm");
    expect(text).not.toMatch(/rain/i);
  });

  it("mentions rain when precipitation is present", () => {
    const text = formatOutfitExplanation({
      temperatureC: 12,
      precipitationMm: 5,
      top: summerTop,
      bottom: summerBottom,
      shoe: summerShoe,
    });
    expect(text).toMatch(/rain/i);
  });
});
