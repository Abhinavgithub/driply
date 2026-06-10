export type WeatherResult = {
  temperatureC: number;
  precipitationMm: number;
};

export type GeocodingResult = {
  name: string;
  country?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
};

type CachedWeather = { result: WeatherResult; expiresAt: number };
const weatherCache = new Map<string, CachedWeather>();
const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
// Callers treat weather as optional; a hung upstream request must not stall
// the whole recommendation request into the serverless function timeout.
const FETCH_TIMEOUT_MS = 5_000;

function evictExpiredWeatherEntries() {
  const now = Date.now();
  for (const [key, entry] of weatherCache) {
    if (entry.expiresAt <= now) weatherCache.delete(key);
  }
}

export async function fetchWeather(lat: number, lon: number): Promise<WeatherResult> {
  evictExpiredWeatherEntries(); // sweep all stale entries on every fetch
  const cacheKey = `${lat.toFixed(2)}_${lon.toFixed(2)}`;
  const cached = weatherCache.get(cacheKey);
  if (cached) return cached.result; // guaranteed fresh after sweep

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat.toString());
  url.searchParams.set("longitude", lon.toString());
  url.searchParams.set("current", "temperature_2m,precipitation");
  url.searchParams.set("timezone", "auto");

  const res = await fetch(url.toString(), {
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error("Failed to fetch weather");

  const json = (await res.json()) as {
    current?: { temperature_2m?: number; precipitation?: number };
  };

  const temperatureC = json.current?.temperature_2m;
  const precipitationMm = json.current?.precipitation;

  if (typeof temperatureC !== "number" || typeof precipitationMm !== "number") {
    throw new Error("Weather response missing expected fields.");
  }

  const result = { temperatureC, precipitationMm };
  weatherCache.set(cacheKey, { result, expiresAt: Date.now() + WEATHER_CACHE_TTL_MS });
  return result;
}

export async function searchLocations(query: string): Promise<GeocodingResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", trimmed);
  url.searchParams.set("count", "5");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const res = await fetch(url.toString(), {
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error("Failed to search locations");

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
