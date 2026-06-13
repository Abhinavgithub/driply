import { describe, expect, it } from "vitest";

import {
  countKnownAttributes,
  defaultItemAttributes,
  formatEnumLabel,
  getDefaultSubtypeForKind,
  hasUnknownAttributes,
  isValidSubtypeForKind,
  itemAttributePatchSchema,
  itemAttributesSchema,
  mergeItemAttributes,
  pickProvidedItemAttributes,
} from "@/lib/itemAttributes";

describe("itemAttributesSchema", () => {
  const valid = {
    colorFamily: "BLUE",
    pattern: "SOLID",
    styleProfile: "CASUAL",
    formality: "RELAXED",
    warmthLevel: "MID",
  };

  it("accepts a fully-specified valid object", () => {
    expect(itemAttributesSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an invalid enum value", () => {
    expect(itemAttributesSchema.safeParse({ ...valid, colorFamily: "TEAL" }).success).toBe(false);
  });

  it("rejects a missing key (non-partial schema)", () => {
    const missing = {
      pattern: "SOLID",
      styleProfile: "CASUAL",
      formality: "RELAXED",
      warmthLevel: "MID",
    };
    expect(itemAttributesSchema.safeParse(missing).success).toBe(false);
  });

  it("patch schema accepts a partial subset", () => {
    expect(itemAttributePatchSchema.safeParse({ pattern: "STRIPED" }).success).toBe(true);
    expect(itemAttributePatchSchema.safeParse({}).success).toBe(true);
  });

  it("patch schema still rejects invalid values", () => {
    expect(itemAttributePatchSchema.safeParse({ pattern: "PLAID" }).success).toBe(false);
  });
});

describe("mergeItemAttributes", () => {
  it("returns all-UNKNOWN defaults when nothing provided", () => {
    expect(mergeItemAttributes()).toEqual(defaultItemAttributes);
  });

  it("overrides only the provided fields, defaulting the rest", () => {
    expect(mergeItemAttributes({ colorFamily: "RED", warmthLevel: "WARM" })).toEqual({
      colorFamily: "RED",
      pattern: "UNKNOWN",
      styleProfile: "UNKNOWN",
      formality: "UNKNOWN",
      warmthLevel: "WARM",
    });
  });
});

describe("hasUnknownAttributes / countKnownAttributes", () => {
  it("flags any UNKNOWN field", () => {
    expect(hasUnknownAttributes(defaultItemAttributes)).toBe(true);
    expect(
      hasUnknownAttributes({
        colorFamily: "BLACK",
        pattern: "SOLID",
        styleProfile: "CASUAL",
        formality: "RELAXED",
        warmthLevel: "LIGHT",
      }),
    ).toBe(false);
  });

  it("counts only known (non-UNKNOWN) fields", () => {
    expect(countKnownAttributes(defaultItemAttributes)).toBe(0);
    expect(
      countKnownAttributes({
        colorFamily: "BLACK",
        pattern: "SOLID",
        styleProfile: "UNKNOWN",
        formality: "UNKNOWN",
        warmthLevel: "UNKNOWN",
      }),
    ).toBe(2);
  });
});

describe("pickProvidedItemAttributes", () => {
  it("returns {} for undefined input", () => {
    expect(pickProvidedItemAttributes()).toEqual({});
  });

  it("strips undefined values but keeps explicit ones", () => {
    expect(pickProvidedItemAttributes({ colorFamily: "BLUE", pattern: undefined })).toEqual({
      colorFamily: "BLUE",
    });
  });
});

describe("subtype helpers", () => {
  it("returns the first subtype as the default per kind", () => {
    expect(getDefaultSubtypeForKind("TOP")).toBe("tshirt");
    expect(getDefaultSubtypeForKind("BOTTOM")).toBe("shorts");
    expect(getDefaultSubtypeForKind("SHOE")).toBe("sneakers");
  });

  it("validates subtype membership for a kind", () => {
    expect(isValidSubtypeForKind("TOP", "hoodie")).toBe(true);
    expect(isValidSubtypeForKind("TOP", "jeans")).toBe(false); // valid subtype, wrong kind
    expect(isValidSubtypeForKind("SHOE", "nonsense")).toBe(false);
  });
});

describe("formatEnumLabel", () => {
  it("title-cases and replaces underscores", () => {
    expect(formatEnumLabel("SMART_CASUAL")).toBe("Smart Casual");
    expect(formatEnumLabel("BLACK")).toBe("Black");
    expect(formatEnumLabel("long_sleeve")).toBe("Long Sleeve");
  });
});
