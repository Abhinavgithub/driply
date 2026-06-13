"use client";

import { useCallback, useState } from "react";

import { ApiError, isHandledFetchError } from "@/lib/fetch-utils";
import { useApiFetch, type ApiFetch } from "@/lib/hooks/use-api-fetch";
import {
  useEagerGeolocation,
  getGeolocationWithRetry,
  type Coordinates,
} from "@/lib/hooks/use-geolocation";
import {
  formatLocationLabel,
  getSavedLocation,
  setSavedLocation,
  type LocationSource,
  type SavedLocation,
} from "@/lib/saved-location";
import type {
  RecommendationNeeds,
  RecommendationOption,
  RecommendationOptionsResponse,
} from "@/lib/types/wardrobe";

const PAGE_LIMIT = 6;

function fetchRecommendationPage(
  apiFetch: ApiFetch,
  args: { coords: Coordinates; dateKey: string; offset: number; limit: number },
) {
  const { coords, dateKey, offset, limit } = args;
  return apiFetch<RecommendationOptionsResponse>(
    `/api/recommendations?lat=${coords.lat}&lon=${coords.lon}&date=${encodeURIComponent(dateKey)}&offset=${offset}&limit=${limit}`,
  );
}

/**
 * Outfit recommendation state for /today: resolves a location (device →
 * saved fallback → manual search), loads pages of options, and tracks the
 * selected option. `savedLocationKey` is per-user; pass null until auth
 * resolves.
 */
export function useRecommendations(args: { savedLocationKey: string | null; dateKey: string }) {
  const { savedLocationKey, dateKey } = args;
  const apiFetch = useApiFetch();
  const takePendingGeolocation = useEagerGeolocation();

  const [options, setOptions] = useState<RecommendationOption[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [needs, setNeeds] = useState<RecommendationNeeds | null>(null);
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [locationSource, setLocationSource] = useState<LocationSource>(null);
  const [activeLocationLabel, setActiveLocationLabel] = useState<string | null>(null);
  const [savedLocation, setSavedLocationState] = useState<SavedLocation | null>(null);

  const loadForCoordinates = useCallback(
    async (nextCoords: Coordinates, source: LocationSource, locationLabel?: string) => {
      setCoords(nextCoords);
      setLocationSource(source);
      setActiveLocationLabel(locationLabel ?? null);
      let data: RecommendationOptionsResponse;
      try {
        data = await fetchRecommendationPage(apiFetch, {
          coords: nextCoords,
          dateKey,
          offset: 0,
          limit: PAGE_LIMIT,
        });
      } catch (err) {
        // The API reports an empty wardrobe via `needs` on the error body.
        if (err instanceof ApiError) {
          const errNeeds = (err.body as { needs?: RecommendationNeeds } | null)?.needs;
          if (errNeeds) setNeeds(errNeeds);
        }
        throw err;
      }
      setOptions(data.options ?? []);
      setCursor(data.offset + (data.options?.length ?? 0));
    },
    [apiFetch, dateKey],
  );

  const loadInitial = useCallback(async () => {
    if (!savedLocationKey) return;
    setError(null);
    setLocationError(null);
    setNeeds(null);
    setOptions([]);
    setSelectedIndex(0);
    setCursor(0);
    const storedLocation = getSavedLocation(savedLocationKey);
    setSavedLocationState(storedLocation);

    setLoading(true);
    try {
      const nextCoords = await (takePendingGeolocation() ?? getGeolocationWithRetry());
      await loadForCoordinates(nextCoords, "device");
    } catch (e) {
      if (isHandledFetchError(e)) return;
      const message = e instanceof Error ? e.message : String(e);
      setLocationError(message);
      if (storedLocation) {
        try {
          await loadForCoordinates(
            { lat: storedLocation.latitude, lon: storedLocation.longitude },
            "saved",
            formatLocationLabel(storedLocation),
          );
          setLoading(false);
          return;
        } catch (fallbackError) {
          if (isHandledFetchError(fallbackError)) return;
          setError(fallbackError instanceof Error ? fallbackError.message : String(fallbackError));
        }
      }
    } finally {
      setLoading(false);
    }
  }, [loadForCoordinates, savedLocationKey, takePendingGeolocation]);

  /** Loads a manually chosen (or saved) location and persists it. */
  const useLocation = useCallback(
    async (result: SavedLocation) => {
      if (!savedLocationKey) return;
      setLoading(true);
      setError(null);
      try {
        await loadForCoordinates(
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
      } catch (e) {
        if (isHandledFetchError(e)) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [loadForCoordinates, savedLocation, savedLocationKey],
  );

  const clearSavedLocation = useCallback(() => {
    if (!savedLocationKey) return;
    setSavedLocation(savedLocationKey, null);
    setSavedLocationState(null);
    setLocationSource((prev) => (prev === "saved" ? null : prev));
  }, [savedLocationKey]);

  /** Advances to the next option, fetching another page when exhausted. */
  const showAnother = useCallback(async () => {
    if (loading) return;
    const nextIndex = selectedIndex + 1;
    if (nextIndex < options.length) {
      setSelectedIndex(nextIndex);
      return;
    }
    if (!coords) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRecommendationPage(apiFetch, {
        coords,
        dateKey,
        offset: cursor,
        limit: PAGE_LIMIT,
      });
      if (!data.options?.length) return;
      setOptions((prev) => [...prev, ...data.options]);
      setCursor(data.offset + data.options.length);
      setSelectedIndex(nextIndex);
    } catch (e) {
      if (isHandledFetchError(e)) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [apiFetch, coords, cursor, dateKey, loading, options.length, selectedIndex]);

  return {
    options,
    selectedIndex,
    current: options[selectedIndex] ?? null,
    loading,
    error,
    locationError,
    needs,
    locationSource,
    activeLocationLabel,
    savedLocation,
    loadInitial,
    useLocation,
    clearSavedLocation,
    showAnother,
  };
}
