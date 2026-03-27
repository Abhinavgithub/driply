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

export async function fetchWeather(lat: number, lon: number): Promise<WeatherResult> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat.toString());
  url.searchParams.set("longitude", lon.toString());
  url.searchParams.set("current", "temperature_2m,precipitation");
  url.searchParams.set("timezone", "auto");

  const res = await fetch(url.toString(), {
    headers: { accept: "application/json" },
    cache: "no-store",
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

  return { temperatureC, precipitationMm };
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
