"use client";

import { useState } from "react";

import { isHandledFetchError } from "@/lib/fetch-utils";
import { useApiFetch } from "@/lib/hooks/use-api-fetch";
import { formatLocationLabel, type SavedLocation } from "@/lib/saved-location";

type LocationPanelProps = {
  locationError: string;
  savedLocation: SavedLocation | null;
  onUseLocation: (location: SavedLocation) => void;
  onClearSavedLocation: () => void;
  onRetryDevice: () => void;
};

/** Shown when device geolocation fails: saved-location shortcut + manual city search. */
export function LocationPanel({
  locationError,
  savedLocation,
  onUseLocation,
  onClearSavedLocation,
  onRetryDevice,
}: LocationPanelProps) {
  const apiFetch = useApiFetch();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SavedLocation[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  async function onSearch() {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchError("Enter a city.");
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    setSearchError(null);
    try {
      const json = await apiFetch<{ results?: SavedLocation[] }>(
        `/api/location-search?q=${encodeURIComponent(trimmed)}`,
      );
      const results = json.results ?? [];
      setSearchResults(results);
      if (!results.length) setSearchError("No results.");
    } catch (e) {
      if (isHandledFetchError(e)) return;
      setSearchError(e instanceof Error ? e.message : String(e));
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }

  function selectLocation(result: SavedLocation) {
    setSearchError(null);
    setSearchResults([]);
    onUseLocation(result);
  }

  return (
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
              onClick={() => selectLocation(savedLocation)}
              className="button-secondary"
            >
              Use {formatLocationLabel(savedLocation)}
            </button>
            <button type="button" onClick={onClearSavedLocation} className="button-ghost">
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
            onClick={() => void onSearch()}
            disabled={searchLoading}
            className="button-secondary"
          >
            {searchLoading ? "Searching..." : "Search"}
          </button>
          <button type="button" onClick={onRetryDevice} className="button-ghost">
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
                onClick={() => selectLocation(result)}
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
  );
}
