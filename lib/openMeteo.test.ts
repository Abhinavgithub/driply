import { describe, expect, it } from "vitest";

import { summarizeDayWeather, type ForecastResponse } from "@/lib/openMeteo";

// Shape of an Open-Meteo `timezone=auto` response: local wall-clock times,
// 24 hourly rows per day. Values are built per hour so each test can read
// off the expected window min/max.
function buildForecast(args: {
  now: string;
  days: string[];
  feelsLike: (day: number, hour: number) => number | null;
  rainChance?: (day: number, hour: number) => number | null;
  precip?: (day: number, hour: number) => number | null;
  currentPrecipMm?: number;
}): ForecastResponse {
  const hourly = {
    time: [] as string[],
    temperature_2m: [] as (number | null)[],
    apparent_temperature: [] as (number | null)[],
    precipitation_probability: [] as (number | null)[],
    precipitation: [] as (number | null)[],
  };
  args.days.forEach((date, day) => {
    for (let hour = 0; hour < 24; hour++) {
      const feels = args.feelsLike(day, hour);
      hourly.time.push(`${date}T${String(hour).padStart(2, "0")}:00`);
      hourly.apparent_temperature.push(feels);
      hourly.temperature_2m.push(feels === null ? null : feels + 1);
      hourly.precipitation_probability.push(args.rainChance?.(day, hour) ?? 0);
      hourly.precipitation.push(args.precip?.(day, hour) ?? 0);
    }
  });
  return {
    current: {
      time: args.now,
      temperature_2m: 9,
      apparent_temperature: 8,
      precipitation: args.currentPrecipMm ?? 0,
    },
    hourly,
  };
}

// Cold morning, warm afternoon peak at 2pm, cooling into the evening.
const curve = (_day: number, hour: number) => 20 - Math.abs(hour - 14) * 1.5;

describe("summarizeDayWeather", () => {
  it("dresses a 7am check for the whole 8am–8pm window", () => {
    const day = summarizeDayWeather(
      buildForecast({ now: "2026-10-24T07:10", days: ["2026-10-24"], feelsLike: curve }),
      "2026-10-24",
    );
    expect(day.source).toBe("forecast");
    expect(day.isToday).toBe(true);
    expect(day.windowStartHour).toBe(8);
    expect(day.windowEndHour).toBe(20);
    expect(day.minFeelsLikeC).toBe(11); // 8am and 8pm are both 6h from the peak
    expect(day.minFeelsLikeHour).toBe(8);
    expect(day.maxFeelsLikeC).toBe(20);
    expect(day.maxFeelsLikeHour).toBe(14);
    expect(day.isRainDay).toBe(false);
  });

  it("starts today's window at the current hour so an evening check skips the morning", () => {
    const day = summarizeDayWeather(
      buildForecast({ now: "2026-10-24T17:30", days: ["2026-10-24"], feelsLike: curve }),
      "2026-10-24",
    );
    expect(day.windowStartHour).toBe(17);
    expect(day.minFeelsLikeHour).toBe(20);
    expect(day.maxFeelsLikeHour).toBe(17);
  });

  it("uses the hours left after 8pm", () => {
    const day = summarizeDayWeather(
      buildForecast({ now: "2026-10-24T21:05", days: ["2026-10-24"], feelsLike: curve }),
      "2026-10-24",
    );
    expect(day.windowStartHour).toBe(21);
    expect(day.windowEndHour).toBe(23);
    expect(day.minFeelsLikeHour).toBe(23);
  });

  it("plans tomorrow on the full window from the same response", () => {
    const day = summarizeDayWeather(
      buildForecast({
        now: "2026-10-24T21:05",
        days: ["2026-10-24", "2026-10-25"],
        feelsLike: (d, h) => (d === 1 ? 5 + h * 0.5 : 30),
      }),
      "2026-10-25",
    );
    expect(day.isToday).toBe(false);
    expect(day.windowStartHour).toBe(8);
    expect(day.minFeelsLikeC).toBe(9);
    expect(day.maxFeelsLikeC).toBe(15);
  });

  it("uses the location's local date, not the server's, across midnight", () => {
    // Server (UTC) may already be on the 25th; the location's clock says the
    // 24th, so "2026-10-25" is tomorrow there.
    const day = summarizeDayWeather(
      buildForecast({
        now: "2026-10-24T23:30",
        days: ["2026-10-24", "2026-10-25"],
        feelsLike: curve,
      }),
      "2026-10-25",
    );
    expect(day.isToday).toBe(false);
    expect(day.windowStartHour).toBe(8);
  });

  it("flags a rain day when any window hour reaches a 40% chance", () => {
    const day = summarizeDayWeather(
      buildForecast({
        now: "2026-10-24T07:00",
        days: ["2026-10-24"],
        feelsLike: curve,
        rainChance: (_d, h) => (h >= 17 ? 60 : 10),
        precip: (_d, h) => (h >= 18 ? 0.4 : 0),
      }),
      "2026-10-24",
    );
    expect(day.isRainDay).toBe(true);
    expect(day.rainStartHour).toBe(17);
    expect(day.maxRainChancePct).toBe(60);
    expect(day.totalPrecipMm).toBe(1.2); // 6pm, 7pm, 8pm
  });

  it("ignores rain outside the window", () => {
    const day = summarizeDayWeather(
      buildForecast({
        now: "2026-10-24T07:00",
        days: ["2026-10-24"],
        feelsLike: curve,
        rainChance: (_d, h) => (h >= 22 ? 90 : 0),
        precip: (_d, h) => (h >= 22 ? 3 : 0),
      }),
      "2026-10-24",
    );
    expect(day.isRainDay).toBe(false);
    expect(day.totalPrecipMm).toBe(0);
  });

  it("skips missing hours and falls back to air temperature", () => {
    const forecast = buildForecast({
      now: "2026-10-24T07:00",
      days: ["2026-10-24"],
      feelsLike: (_d, h) => (h === 8 ? null : 15),
    });
    forecast.hourly!.temperature_2m[8] = 4;
    forecast.hourly!.temperature_2m[9] = null;
    forecast.hourly!.apparent_temperature[9] = null;
    const day = summarizeDayWeather(forecast, "2026-10-24");
    expect(day.minFeelsLikeC).toBe(4);
    expect(day.minFeelsLikeHour).toBe(8);
  });

  it("falls back to the live reading without hourly data", () => {
    const forecast = buildForecast({
      now: "2026-10-24T07:00",
      days: [],
      feelsLike: curve,
      currentPrecipMm: 0.5,
    });
    delete forecast.hourly;
    const day = summarizeDayWeather(forecast, "2026-10-24");
    expect(day.source).toBe("current");
    expect(day.minFeelsLikeC).toBe(8);
    expect(day.isRainDay).toBe(true);
  });

  it("falls back to the live reading for a past date", () => {
    const day = summarizeDayWeather(
      buildForecast({ now: "2026-10-24T07:00", days: ["2026-10-24"], feelsLike: curve }),
      "2026-10-20",
    );
    expect(day.source).toBe("current");
    expect(day.isToday).toBe(false);
  });
});
