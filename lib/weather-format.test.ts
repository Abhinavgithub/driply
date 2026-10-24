import { describe, expect, it } from "vitest";

import type { DayWeather } from "@/lib/openMeteo";
import { formatWeatherTimeline } from "@/lib/weather-format";

const base: DayWeather = {
  dateKey: "2026-10-24",
  source: "forecast",
  isToday: true,
  currentTempC: 9,
  currentFeelsLikeC: 8,
  windowStartHour: 8,
  windowEndHour: 20,
  minFeelsLikeC: 8,
  minFeelsLikeHour: 8,
  maxFeelsLikeC: 19,
  maxFeelsLikeHour: 14,
  maxRainChancePct: 60,
  rainStartHour: 17,
  totalPrecipMm: 1.2,
  isRainDay: true,
};

describe("formatWeatherTimeline", () => {
  it("shows now, the later high, and when rain starts", () => {
    expect(formatWeatherTimeline(base)).toBe("Feels 8° now · 19° by 2pm · 60% rain from 5pm");
  });

  it("names a later low that is colder than now", () => {
    expect(
      formatWeatherTimeline({
        ...base,
        currentFeelsLikeC: 15,
        maxFeelsLikeC: 15,
        maxFeelsLikeHour: 8,
        minFeelsLikeC: 7,
        minFeelsLikeHour: 20,
        isRainDay: false,
        rainStartHour: null,
      }),
    ).toBe("Feels 15° now · 7° at 8pm");
  });

  it("gives the low and high for tomorrow", () => {
    expect(
      formatWeatherTimeline({ ...base, isToday: false, isRainDay: false, rainStartHour: null }),
    ).toBe("Feels 8° at 8am, 19° at 2pm");
  });

  it("returns null without forecast data", () => {
    expect(formatWeatherTimeline({ ...base, source: "current" })).toBeNull();
  });
});
