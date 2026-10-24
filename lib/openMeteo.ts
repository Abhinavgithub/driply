import { getOpenMeteoApiKey, getOpenMeteoBaseUrl, getOpenMeteoGeocodingBaseUrl } from "@/lib/env";

/** Hourly forecast columns as returned by Open-Meteo with `timezone=auto`. */
export type HourlyForecast = {
  /** Local wall-clock times, e.g. "2026-10-24T08:00". */
  time: string[];
  temperature_2m: (number | null)[];
  apparent_temperature: (number | null)[];
  precipitation_probability: (number | null)[];
  precipitation: (number | null)[];
};

export type ForecastResponse = {
  current: {
    /** Local wall-clock time of the reading, e.g. "2026-10-24T09:45". */
    time: string;
    temperature_2m: number;
    apparent_temperature?: number | null;
    precipitation: number;
  };
  hourly?: HourlyForecast;
};

/**
 * What the outfit is scored against: the coldest and wettest part of the
 * day's window, not the reading at the moment the app was opened.
 */
export type DayWeather = {
  dateKey: string;
  /** "forecast" when hourly data covered the window; "current" when it fell back to the live reading. */
  source: "forecast" | "current";
  isToday: boolean;
  currentTempC: number;
  currentFeelsLikeC: number;
  /** Local hours, inclusive (0–23). */
  windowStartHour: number;
  windowEndHour: number;
  minFeelsLikeC: number;
  minFeelsLikeHour: number;
  maxFeelsLikeC: number;
  maxFeelsLikeHour: number;
  /** Highest hourly rain chance in the window, or null when the forecast has none. */
  maxRainChancePct: number | null;
  /** First hour in the window that counts as rainy, or null on a dry day. */
  rainStartHour: number | null;
  totalPrecipMm: number;
  isRainDay: boolean;
};

export type GeocodingResult = {
  name: string;
  country?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
};

export const DAY_WINDOW_START_HOUR = 8;
export const DAY_WINDOW_END_HOUR = 20;
export const RAIN_CHANCE_THRESHOLD_PCT = 40;
const RAINY_HOUR_PRECIP_MM = 0.1;

type CachedForecast = { result: ForecastResponse; fetchedAt: number };
const forecastCache = new Map<string, CachedForecast>();
const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
// The free tier has no uptime promise and rate-limits per IP (shared on
// Netlify), so an upstream failure serves the last forecast for this
// location if it is younger than this, instead of failing the request.
export const WEATHER_STALE_FALLBACK_MS = 3 * 60 * 60 * 1000; // 3 hours
// Bound per-instance memory: random coords must not grow the Map forever.
const MAX_CACHE_ENTRIES = 500;
// Callers treat weather as optional; a hung upstream request must not stall
// the whole recommendation request into the serverless function timeout.
const FETCH_TIMEOUT_MS = 5_000;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** One forecast call covers today and tomorrow (3 days absorbs timezone skew). */
export async function fetchForecast(lat: number, lon: number): Promise<ForecastResponse> {
  // 4-decimal precision (~11m): toFixed(2) collided locations ~1.1km apart.
  const cacheKey = `${lat.toFixed(4)}_${lon.toFixed(4)}`;
  const cached = forecastCache.get(cacheKey);
  // Per-key TTL check (no O(n) full-map sweep on every request). Expired
  // entries are kept as the stale fallback until the next successful fetch.
  if (cached && Date.now() - cached.fetchedAt < WEATHER_CACHE_TTL_MS) return cached.result;

  try {
    const result = await requestForecast(lat, lon);
    // Re-insert so Map order tracks recency for the eviction below.
    forecastCache.delete(cacheKey);
    if (forecastCache.size >= MAX_CACHE_ENTRIES) {
      // Evict the oldest entry (Map preserves insertion order).
      const oldest = forecastCache.keys().next();
      if (!oldest.done) forecastCache.delete(oldest.value);
    }
    forecastCache.set(cacheKey, { result, fetchedAt: Date.now() });
    return result;
  } catch (error) {
    if (cached && Date.now() - cached.fetchedAt < WEATHER_STALE_FALLBACK_MS) {
      console.warn("[weather] upstream failed, serving stale forecast", {
        ageMinutes: Math.round((Date.now() - cached.fetchedAt) / 60_000),
        message: error instanceof Error ? error.message : String(error),
      });
      return cached.result;
    }
    if (cached) forecastCache.delete(cacheKey);
    throw error;
  }
}

/** Test hook: clears the per-instance forecast cache. */
export function clearForecastCache() {
  forecastCache.clear();
}

async function requestForecast(lat: number, lon: number): Promise<ForecastResponse> {
  const url = new URL(`${getOpenMeteoBaseUrl()}/v1/forecast`);
  url.searchParams.set("latitude", lat.toString());
  url.searchParams.set("longitude", lon.toString());
  url.searchParams.set("current", "temperature_2m,apparent_temperature,precipitation");
  url.searchParams.set(
    "hourly",
    "temperature_2m,apparent_temperature,precipitation_probability,precipitation",
  );
  url.searchParams.set("forecast_days", "3");
  url.searchParams.set("timezone", "auto");
  const apiKey = getOpenMeteoApiKey();
  if (apiKey) url.searchParams.set("apikey", apiKey);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error("Weather request timed out (open-meteo).");
    }
    throw error;
  }

  if (!res.ok) throw new Error(`Failed to fetch weather (open-meteo status ${res.status}).`);

  const json = (await res.json()) as Partial<ForecastResponse>;
  const current = json.current;
  if (
    !current ||
    typeof current.time !== "string" ||
    !isFiniteNumber(current.temperature_2m) ||
    !isFiniteNumber(current.precipitation)
  ) {
    throw new Error("Weather response missing expected fields.");
  }

  return { current, hourly: json.hourly };
}

/**
 * Reduces an hourly forecast to the day summary for `dateKey`. Pure (the
 * location's "now" comes from `current.time`), so it is unit-tested directly.
 *
 * Window: 8am–8pm for a future day. For today it starts at the current hour,
 * so an evening check doesn't dress for the morning's cold; after 8pm it is
 * the hours left. A past date, or missing hourly data, falls back to the
 * live reading.
 */
export function summarizeDayWeather(forecast: ForecastResponse, dateKey: string): DayWeather {
  const { current } = forecast;
  const currentDateKey = current.time.slice(0, 10);
  const currentHour = Number(current.time.slice(11, 13)) || 0;
  const currentFeelsLikeC = isFiniteNumber(current.apparent_temperature)
    ? current.apparent_temperature
    : current.temperature_2m;
  const isToday = dateKey === currentDateKey;

  let windowStartHour = DAY_WINDOW_START_HOUR;
  let windowEndHour = DAY_WINDOW_END_HOUR;
  if (isToday) {
    windowStartHour = Math.max(DAY_WINDOW_START_HOUR, currentHour);
    if (currentHour > DAY_WINDOW_END_HOUR) windowEndHour = 23;
  }

  const fallback: DayWeather = {
    dateKey,
    source: "current",
    isToday,
    currentTempC: current.temperature_2m,
    currentFeelsLikeC,
    windowStartHour: currentHour,
    windowEndHour: currentHour,
    minFeelsLikeC: currentFeelsLikeC,
    minFeelsLikeHour: currentHour,
    maxFeelsLikeC: currentFeelsLikeC,
    maxFeelsLikeHour: currentHour,
    maxRainChancePct: null,
    rainStartHour: current.precipitation >= RAINY_HOUR_PRECIP_MM ? currentHour : null,
    totalPrecipMm: current.precipitation,
    isRainDay: current.precipitation >= RAINY_HOUR_PRECIP_MM,
  };

  // Dates already past can't be forecast; keep the live reading.
  if (dateKey < currentDateKey) return fallback;

  const hourly = forecast.hourly;
  if (!hourly || !Array.isArray(hourly.time)) return fallback;

  let minFeels: { value: number; hour: number } | null = null;
  let maxFeels: { value: number; hour: number } | null = null;
  let maxRainChancePct: number | null = null;
  let rainStartHour: number | null = null;
  let totalPrecipMm = 0;

  for (let i = 0; i < hourly.time.length; i++) {
    const time = hourly.time[i];
    if (typeof time !== "string" || time.slice(0, 10) !== dateKey) continue;
    const hour = Number(time.slice(11, 13));
    if (!Number.isInteger(hour) || hour < windowStartHour || hour > windowEndHour) continue;

    const feels = hourly.apparent_temperature?.[i];
    const temp = hourly.temperature_2m?.[i];
    const feelsLike = isFiniteNumber(feels) ? feels : isFiniteNumber(temp) ? temp : null;
    if (feelsLike !== null) {
      if (!minFeels || feelsLike < minFeels.value) minFeels = { value: feelsLike, hour };
      if (!maxFeels || feelsLike > maxFeels.value) maxFeels = { value: feelsLike, hour };
    }

    const chance = hourly.precipitation_probability?.[i];
    const precip = hourly.precipitation?.[i];
    if (isFiniteNumber(chance)) {
      maxRainChancePct = maxRainChancePct === null ? chance : Math.max(maxRainChancePct, chance);
    }
    if (isFiniteNumber(precip)) totalPrecipMm += precip;
    const rainyHour =
      (isFiniteNumber(chance) && chance >= RAIN_CHANCE_THRESHOLD_PCT) ||
      (isFiniteNumber(precip) && precip >= RAINY_HOUR_PRECIP_MM);
    if (rainyHour && rainStartHour === null) rainStartHour = hour;
  }

  if (!minFeels || !maxFeels) return fallback;

  return {
    dateKey,
    source: "forecast",
    isToday,
    currentTempC: current.temperature_2m,
    currentFeelsLikeC,
    windowStartHour,
    windowEndHour,
    minFeelsLikeC: minFeels.value,
    minFeelsLikeHour: minFeels.hour,
    maxFeelsLikeC: maxFeels.value,
    maxFeelsLikeHour: maxFeels.hour,
    maxRainChancePct,
    rainStartHour,
    totalPrecipMm: Math.round(totalPrecipMm * 10) / 10,
    isRainDay: rainStartHour !== null,
  };
}

export async function fetchDayWeather(
  lat: number,
  lon: number,
  dateKey: string,
): Promise<DayWeather> {
  return summarizeDayWeather(await fetchForecast(lat, lon), dateKey);
}

export async function searchLocations(query: string): Promise<GeocodingResult[]> {
  const trimmed = query.trim().slice(0, 100);
  if (!trimmed) return [];

  const url = new URL(`${getOpenMeteoGeocodingBaseUrl()}/v1/search`);
  url.searchParams.set("name", trimmed);
  url.searchParams.set("count", "5");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  const apiKey = getOpenMeteoApiKey();
  if (apiKey) url.searchParams.set("apikey", apiKey);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error("Location search timed out (open-meteo).");
    }
    throw error;
  }

  if (!res.ok) throw new Error(`Failed to search locations (open-meteo status ${res.status}).`);

  const json = (await res.json()) as {
    results?: Array<{
      name?: string;
      country?: string;
      admin1?: string;
      latitude?: number;
      longitude?: number;
    }>;
  };

  return (json.results ?? [])
    .filter(
      (entry) =>
        typeof entry.name === "string" &&
        typeof entry.latitude === "number" &&
        typeof entry.longitude === "number",
    )
    .map((entry) => ({
      name: entry.name as string,
      country: entry.country,
      admin1: entry.admin1,
      latitude: entry.latitude as number,
      longitude: entry.longitude as number,
    }));
}
