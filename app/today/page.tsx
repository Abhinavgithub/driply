"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-t border-border py-3 text-sm">
      <span className="muted-copy">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

export default function TodayPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<RecommendationOption[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [marked, setMarked] = useState(false);
  const [needs, setNeeds] = useState<{ top: boolean; bottom: boolean; shoe: boolean } | null>(null);
  const [cursor, setCursor] = useState(0);
  const [showDetails, setShowDetails] = useState(false);

  const pageLimit = 6;
  const localDateKey = useMemo(() => getLocalDateKey(), []);
  const current = options[selectedIndex] ?? null;

  const loadInitialRecommendation = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMarked(false);
    setNeeds(null);
    setOptions([]);
    setSelectedIndex(0);
    setCursor(0);

    try {
      const nextCoords = await getGeolocationWithRetry();
      setCoords(nextCoords);

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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [localDateKey]);

  useEffect(() => {
    void loadInitialRecommendation();
  }, [loadInitialRecommendation]);

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
          {coords ? (
            <span className="pill">
              {coords.lat.toFixed(1)}, {coords.lon.toFixed(1)}
            </span>
          ) : null}
        </div>
      </div>

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
            <div
              key={index}
              className="app-card shimmer rounded-3xl"
            >
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
