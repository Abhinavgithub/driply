export type WeatherResult = {
  temperatureC: number;
  precipitationMm: number;
};

export async function fetchWeather(lat: number, lon: number): Promise<WeatherResult> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat.toString());
  url.searchParams.set("longitude", lon.toString());
  url.searchParams.set("current", "temperature_2m,precipitation");
  url.searchParams.set("timezone", "auto");

  const res = await fetch(url.toString(), {
    headers: { accept: "application/json" },
    // We want fresh values for "today" recommendations.
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

