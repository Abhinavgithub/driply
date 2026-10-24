import { formatHour } from "@/lib/date-utils";
import type { DayWeather } from "@/lib/openMeteo";

/**
 * One-line day timeline, e.g. "Feels 8° now · 19° by 2pm · 60% rain from 5pm".
 * Only names a later high/low when it differs from now by 2° or more.
 */
export function formatWeatherTimeline(weather: DayWeather): string | null {
  if (weather.source !== "forecast") return null;
  const round = (n: number) => Math.round(n);
  const parts: string[] = [];
  if (weather.isToday) {
    const now = round(weather.currentFeelsLikeC);
    parts.push(`Feels ${now}° now`);
    const max = round(weather.maxFeelsLikeC);
    const min = round(weather.minFeelsLikeC);
    if (weather.maxFeelsLikeHour > weather.windowStartHour && max - now >= 2) {
      parts.push(`${max}° by ${formatHour(weather.maxFeelsLikeHour)}`);
    }
    if (weather.minFeelsLikeHour > weather.windowStartHour && now - min >= 2) {
      parts.push(`${min}° at ${formatHour(weather.minFeelsLikeHour)}`);
    }
  } else {
    parts.push(
      `Feels ${round(weather.minFeelsLikeC)}° at ${formatHour(weather.minFeelsLikeHour)}, ${round(weather.maxFeelsLikeC)}° at ${formatHour(weather.maxFeelsLikeHour)}`,
    );
  }
  if (weather.isRainDay && weather.rainStartHour !== null) {
    parts.push(
      weather.maxRainChancePct !== null
        ? `${round(weather.maxRainChancePct)}% rain from ${formatHour(weather.rainStartHour)}`
        : `rain from ${formatHour(weather.rainStartHour)}`,
    );
  }
  return parts.join(" · ");
}
