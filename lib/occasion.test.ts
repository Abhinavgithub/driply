import { describe, expect, it } from "vitest";

import {
  defaultOccasionFromPreferences,
  parseOccasionByWeekday,
  resolveOccasion,
  targetFormalityFor,
  weekdayKeyForDateKey,
} from "@/lib/occasion";
import type { StylePreferences } from "@/lib/style-preferences";

const prefs = (dressCode: StylePreferences["dressCode"]): StylePreferences => ({
  dressCode,
  lifestyle: "mixed",
  priority: "balanced",
  colorPalette: "mixed",
  tempSensitivity: "average",
});

describe("weekdayKeyForDateKey", () => {
  it("uses the calendar date, not the server timezone", () => {
    expect(weekdayKeyForDateKey("2026-10-24")).toBe("sat");
    expect(weekdayKeyForDateKey("2026-10-26")).toBe("mon");
  });
});

describe("parseOccasionByWeekday", () => {
  it("keeps only valid weekday/occasion pairs", () => {
    expect(
      parseOccasionByWeekday({ mon: "work", tue: "party", funday: "casual", sat: "active" }),
    ).toEqual({ mon: "work", sat: "active" });
  });

  it("returns {} for non-objects", () => {
    expect(parseOccasionByWeekday(null)).toEqual({});
    expect(parseOccasionByWeekday(["work"])).toEqual({});
    expect(parseOccasionByWeekday("work")).toEqual({});
  });
});

describe("resolveOccasion", () => {
  const monday = "2026-10-26";

  it("prefers an explicit pick", () => {
    expect(
      resolveOccasion({ requested: "active", byWeekday: { mon: "work" }, dateKey: monday }),
    ).toEqual({ occasion: "active", source: "request" });
  });

  it("falls back to the remembered pick for that weekday", () => {
    expect(resolveOccasion({ byWeekday: { mon: "going_out" }, dateKey: monday })).toEqual({
      occasion: "going_out",
      source: "weekday",
    });
  });

  it("then to the quiz dress code, then casual", () => {
    expect(
      resolveOccasion({
        byWeekday: { sat: "casual" },
        dateKey: monday,
        stylePreferences: prefs("office"),
      }),
    ).toEqual({ occasion: "work", source: "quiz" });
    expect(resolveOccasion({ byWeekday: {}, dateKey: monday })).toEqual({
      occasion: "casual",
      source: "default",
    });
  });
});

describe("defaults and targets", () => {
  it("maps quiz dress codes to an occasion", () => {
    expect(defaultOccasionFromPreferences(prefs("casual"))).toBe("casual");
    expect(defaultOccasionFromPreferences(prefs("smart_casual"))).toBe("work");
    expect(defaultOccasionFromPreferences(prefs("formal"))).toBe("work");
    expect(defaultOccasionFromPreferences(null)).toBeNull();
  });

  it("raises the Work target to dressy for a formal dress code", () => {
    expect(targetFormalityFor("work", prefs("office"))).toBe(1);
    expect(targetFormalityFor("work", prefs("formal"))).toBe(2);
    expect(targetFormalityFor("casual")).toBe(0);
    expect(targetFormalityFor("going_out")).toBe(1.5);
  });
});
