"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { getBrowserSupabaseClient } from "@/lib/supabase/browser";

type Item = {
  id: string;
  kind: "TOP" | "BOTTOM" | "SHOE";
  subtype: string;
  photoUrl: string;
  colorFamily: string;
  pattern: string;
  styleProfile: string;
  formality: string;
  warmthLevel: string;
};

type RecommendationOption = {
  top: Item;
  bottom: Item;
  shoe: Item;
  explanation: string;
  totalScore: number;
  debugScores: {
    temperatureC: number;
    precipitationMm: number;
    isRaining: boolean;
    weatherScore: number;
    colorHarmonyScore: number;
    styleConsistencyScore: number;
    formalityAlignmentScore: number;
    patternBalanceScore: number;
    warmthCoherenceScore: number;
    historyPenalty: number;
    unknownAttributeCount: number;
    metadataCompletenessPenalty: number;
    tieBreakerHash: number;
  };
};

type RecommendationOptionsResponse = {
  dateKey: string;
  options: RecommendationOption[];
  offset: number;
  limit: number;
};

type Coordinates = {
  lat: number;
  lon: number;
};

type SavedLocation = {
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
};

type LocationResult = SavedLocation;

type LocationSource = "device" | "saved" | "manual" | null;

const GEOLOCATION_RETRY_DELAYS_MS = [1200, 2200];

function formatEnumLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getLocalDateKey() {
  return new Date().toLocaleDateString("en-CA");
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getGeolocationErrorMessage(error: GeolocationPositionError) {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "Location blocked.";
    case error.POSITION_UNAVAILABLE:
      return "Location unavailable.";
    case error.TIMEOUT:
      return "Location timed out.";
    default:
      return error.message || "Location failed.";
  }
}

function isGeolocationPositionError(error: unknown): error is GeolocationPositionError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "number" &&
    "message" in error &&
    typeof error.message === "string"
  );
}

function isRetryableGeolocationError(error: GeolocationPositionError) {
  return (
    error.code === error.POSITION_UNAVAILABLE ||
    error.code === error.TIMEOUT ||
    error.message.toLowerCase().includes("locationunknown")
  );
}

function getSavedLocation(savedLocationKey: string): SavedLocation | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(savedLocationKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedLocation;
    if (
      typeof parsed.name === "string" &&
      typeof parsed.latitude === "number" &&
      typeof parsed.longitude === "number"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function setSavedLocation(savedLocationKey: string, next: SavedLocation | null) {
  if (typeof window === "undefined") return;
  if (!next) {
    window.localStorage.removeItem(savedLocationKey);
    return;
  }
  window.localStorage.setItem(savedLocationKey, JSON.stringify(next));
}

function formatLocationLabel(location: SavedLocation) {
  return [location.name, location.admin1, location.country].filter(Boolean).join(", ");
}

async function getGeolocationAttempt(): Promise<Coordinates> {
  if (!("geolocation" in navigator)) {
    throw new Error("Geolocation not supported.");
  }

  return await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  });
}

async function getGeolocationWithRetry(): Promise<Coordinates> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= GEOLOCATION_RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await getGeolocationAttempt();
    } catch (error) {
      lastError = error;
      if (!isGeolocationPositionError(error) || !isRetryableGeolocationError(error)) {
        throw new Error(
          isGeolocationPositionError(error) ? getGeolocationErrorMessage(error) : String(error),
        );
      }

      if (attempt === GEOLOCATION_RETRY_DELAYS_MS.length) break;
      await sleep(GEOLOCATION_RETRY_DELAYS_MS[attempt]);
    }
  }

  if (isGeolocationPositionError(lastError)) {
    throw new Error(getGeolocationErrorMessage(lastError));
  }

  throw new Error("Location failed.");
}

async function fetchRecommendationPage(args: {
  coords: Coordinates;
  dateKey: string;
  offset: number;
  limit: number;
}) {
  const { coords, dateKey, offset, limit } = args;
  const res = await fetch(
    `/api/recommendations?lat=${coords.lat}&lon=${coords.lon}&date=${encodeURIComponent(dateKey)}&offset=${offset}&limit=${limit}`,
  );
  const json = await res.json();
  return { res, json };
}

async function searchManualLocations(query: string) {
  const res = await fetch(`/api/location-search?q=${encodeURIComponent(query)}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || "Location search failed.");
  return (json.results ?? []) as LocationResult[];
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-t border-border py-3 text-sm">
      <span className="muted-copy">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

export default function TodayPage() {
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [options, setOptions] = useState<RecommendationOption[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [marked, setMarked] = useState(false);
  const [needs, setNeeds] = useState<{ top: boolean; bottom: boolean; shoe: boolean } | null>(null);
  const [cursor, setCursor] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  const [locationSource, setLocationSource] = useState<LocationSource>(null);
  const [savedLocation, setSavedLocationState] = useState<SavedLocation | null>(null);
  const [activeLocationLabel, setActiveLocationLabel] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<LocationResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const pageLimit = 6;
  const localDateKey = useMemo(() => getLocalDateKey(), []);
  const current = options[selectedIndex] ?? null;
  const savedLocationKey = authUserId ? `driply-saved-location:${authUserId}` : null;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const supabase = getBrowserSupabaseClient();
    let active = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setAuthUserId(data.user?.id ?? null);
      setAuthReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setAuthUserId(session?.user?.id ?? null);
      setAuthReady(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const loadRecommendationsForCoordinates = useCallback(
    async (nextCoords: Coordinates, source: LocationSource, locationLabel?: string) => {
      setCoords(nextCoords);
      setLocationSource(source);
      setActiveLocationLabel(locationLabel ?? null);

      const { res, json } = await fetchRecommendationPage({
        coords: nextCoords,
        dateKey: localDateKey,
        offset: 0,
        limit: pageLimit,
      });

      if (!res.ok) {
        if (json?.needs) setNeeds(json.needs);
        throw new Error(json?.error || "Recommendation failed.");
      }

      const data = json as RecommendationOptionsResponse;
      setOptions(data.options ?? []);
      setCursor(data.offset + (data.options?.length ?? 0));
    },
    [localDateKey],
  );

  const loadInitialRecommendation = useCallback(async () => {
    if (!savedLocationKey) return;

    setLoading(true);
    setError(null);
    setLocationError(null);
    setMarked(false);
    setNeeds(null);
    setOptions([]);
    setSelectedIndex(0);
    setCursor(0);

    const storedLocation = getSavedLocation(savedLocationKey);
    setSavedLocationState(storedLocation);

    try {
      const nextCoords = await getGeolocationWithRetry();
      await loadRecommendationsForCoordinates(nextCoords, "device");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setLocationError(message);

      if (storedLocation) {
        try {
          await loadRecommendationsForCoordinates(
            { lat: storedLocation.latitude, lon: storedLocation.longitude },
            "saved",
            formatLocationLabel(storedLocation),
          );
          setLoading(false);
          return;
        } catch (fallbackError) {
          setError(fallbackError instanceof Error ? fallbackError.message : String(fallbackError));
        }
      }
    } finally {
      setLoading(false);
    }
  }, [loadRecommendationsForCoordinates, savedLocationKey]);

  useEffect(() => {
    if (!authReady) return;
    void loadInitialRecommendation();
  }, [authReady, loadInitialRecommendation]);

  useEffect(() => {
    setMarked(false);
    setShowDetails(false);
  }, [selectedIndex]);

  async function onMarkWorn() {
    if (!current) return;
    setError(null);
    try {
      const res = await fetch("/api/outfits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dateKey: localDateKey,
          topItemId: current.top.id,
          bottomItemId: current.bottom.id,
          shoeItemId: current.shoe.id,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Save failed.");
      setMarked(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onShowAnother() {
    const nextIndex = selectedIndex + 1;
    if (nextIndex < options.length) {
      setSelectedIndex(nextIndex);
      return;
    }

    const c = coords;
    if (!c) return;
    setLoading(true);
    setError(null);
    try {
      const { res, json } = await fetchRecommendationPage({
        coords: c,
        dateKey: localDateKey,
        offset: cursor,
        limit: pageLimit,
      });
      if (!res.ok) throw new Error(json?.error || "Load failed.");
      const data = json as RecommendationOptionsResponse;
      if (!data.options?.length) return;
      setOptions((prev) => [...prev, ...data.options]);
      setCursor(data.offset + data.options.length);
      setSelectedIndex(nextIndex);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function onSearchLocation() {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchError("Enter a city.");
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);
    setSearchError(null);
    try {
      const results = await searchManualLocations(trimmed);
      setSearchResults(results);
      if (!results.length) setSearchError("No results.");
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : String(e));
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }

  async function onUseLocation(result: LocationResult) {
    if (!savedLocationKey) return;

    setLoading(true);
    setError(null);
    setSearchError(null);
    try {
      await loadRecommendationsForCoordinates(
        { lat: result.latitude, lon: result.longitude },
        savedLocation &&
          savedLocation.latitude === result.latitude &&
          savedLocation.longitude === result.longitude
          ? "saved"
          : "manual",
        formatLocationLabel(result),
      );
      setSavedLocation(savedLocationKey, result);
      setSavedLocationState(result);
      setLocationError(null);
      setSearchResults([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function onClearSavedLocation() {
    if (!savedLocationKey) return;

    setSavedLocation(savedLocationKey, null);
    setSavedLocationState(null);
    setLocationSource((prev) => (prev === "saved" ? null : prev));
    setSavedLocationState(null);
  }

  if (!authReady) {
    return (
      <section className="app-card rounded-3xl p-6 text-sm muted-copy">
        Loading...
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between text-sm">
        <span className="muted-copy">Today</span>
        <div className="flex items-center gap-2 text-xs">
          {current ? (
            <span className="pill">
              {current.debugScores.temperatureC.toFixed(1)}°C
            </span>
          ) : null}
          {locationSource ? (
            <span className="pill">
              {locationSource === "device" ? "Device" : activeLocationLabel || "Saved location"}
            </span>
          ) : null}
        </div>
      </div>

      {locationError ? (
        <section className="app-card rounded-3xl p-4">
          <div className="space-y-4">
            <div>
              <div className="text-sm text-foreground">Location unavailable</div>
              <div className="mt-1 text-sm muted-copy">{locationError}</div>
            </div>

            {savedLocation ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => void onUseLocation(savedLocation)}
                  className="button-secondary"
                >
                  Use {formatLocationLabel(savedLocation)}
                </button>
                <button
                  type="button"
                  onClick={onClearSavedLocation}
                  className="button-ghost"
                >
                  Clear saved location
                </button>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search city"
                className="input-base w-full"
              />
              <button
                type="button"
                onClick={() => void onSearchLocation()}
                disabled={searchLoading}
                className="button-secondary"
              >
                {searchLoading ? "Searching..." : "Search"}
              </button>
              <button
                type="button"
                onClick={() => void loadInitialRecommendation()}
                className="button-ghost"
              >
                Retry device
              </button>
            </div>

            {searchError ? <div className="text-sm muted-copy">{searchError}</div> : null}

            {searchResults.length > 0 ? (
              <div className="space-y-2">
                {searchResults.map((result) => (
                  <button
                    key={`${result.name}-${result.latitude}-${result.longitude}`}
                    type="button"
                    onClick={() => void onUseLocation(result)}
                    className="subtle-card flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left"
                  >
                    <span className="text-sm text-foreground">{formatLocationLabel(result)}</span>
                    <span className="muted-copy text-xs">Use</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {error ? (
        <section className="app-card rounded-3xl p-4">
          <div className="space-y-2">
            <div className="text-sm text-danger">{error}</div>
            {needs ? (
              <div className="text-sm muted-copy">
                Missing{" "}
                {[
                  needs.top ? "top" : null,
                  needs.bottom ? "bottom" : null,
                  needs.shoe ? "shoe" : null,
                ]
                  .filter(Boolean)
                  .join(", ")}{" "}
                .{" "}
                <Link className="text-foreground underline" href="/library">
                  Wardrobe
                </Link>
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => void loadInitialRecommendation()}
              className="button-secondary"
            >
              Retry
            </button>
          </div>
        </section>
      ) : null}

      {loading || !current ? (
        <section className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="app-card shimmer rounded-3xl">
              <div className="h-72 bg-surface-subtle" />
            </div>
          ))}
        </section>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            {[
              { label: "Top", item: current.top },
              { label: "Bottom", item: current.bottom },
              { label: "Shoes", item: current.shoe },
            ].map((entry) => (
              <article key={entry.label} className="app-card overflow-hidden rounded-3xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={entry.item.photoUrl}
                  alt={entry.item.subtype}
                  className="h-72 w-full object-cover"
                />
                <div className="space-y-2 p-4">
                  <div className="text-xs uppercase tracking-[0.12em] muted-copy">{entry.label}</div>
                  <div className="text-base font-medium text-foreground">
                    {formatEnumLabel(entry.item.subtype)}
                  </div>
                </div>
              </article>
            ))}
          </section>

          <section className="app-card rounded-3xl p-4">
            <div className="space-y-4">
              <div className="text-sm text-foreground">{current.explanation}</div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={onMarkWorn}
                  disabled={marked}
                  className="button-primary w-full"
                >
                  {marked ? "Saved" : "Mark as worn"}
                </button>
                <button
                  onClick={onShowAnother}
                  disabled={loading}
                  className="button-secondary w-full"
                >
                  Another look
                </button>
              </div>
            </div>
          </section>

          <section className="app-card rounded-3xl p-4">
            <button
              type="button"
              onClick={() => setShowDetails((prev) => !prev)}
              className="flex w-full items-center justify-between text-sm text-foreground"
            >
              <span>Why this works</span>
              <span className="muted-copy">{showDetails ? "Hide" : "Show"}</span>
            </button>

            {showDetails ? (
              <div className="mt-4">
                <DetailRow label="Weather" value={current.debugScores.weatherScore.toFixed(2)} />
                <DetailRow label="Color" value={current.debugScores.colorHarmonyScore.toFixed(2)} />
                <DetailRow label="Style" value={current.debugScores.styleConsistencyScore.toFixed(2)} />
                <DetailRow label="Formality" value={current.debugScores.formalityAlignmentScore.toFixed(2)} />
                <DetailRow label="Pattern" value={current.debugScores.patternBalanceScore.toFixed(2)} />
              </div>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
