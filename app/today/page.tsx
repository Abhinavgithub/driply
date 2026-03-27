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

function formatReadableDate(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getGeolocationErrorMessage(error: GeolocationPositionError) {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "Location access is blocked. Allow location permission in your browser or system settings and try again.";
    case error.POSITION_UNAVAILABLE:
      return "Your device could not determine a location yet. Check location services and try again.";
    case error.TIMEOUT:
      return "Getting your location timed out. Try again in a moment.";
    default:
      return error.message || "Unable to determine your location right now.";
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
    throw new Error("Geolocation is not supported in this browser.");
  }

  return await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
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

  throw new Error("Unable to determine your location right now.");
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

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="pill">
      <span className="font-semibold text-foreground">{value}</span>
      <span>{label}</span>
    </div>
  );
}

function ScoreChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="pill">
      <span className="text-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value.toFixed(2)}</span>
    </div>
  );
}

function ItemBadge({ label, value, itemId }: { label: string; value: string; itemId: string }) {
  return (
    <span
      key={`${itemId}-${label}-${value}`}
      className="pill"
    >
      <span className="text-[0.65rem] tracking-[0.12em] uppercase">{label}</span>
      <span className="text-foreground">{formatEnumLabel(value)}</span>
    </span>
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
        throw new Error(json?.error || "Failed to get recommendation");
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
      if (!res.ok) throw new Error(json?.error || "Failed to save outfit history");
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
      if (!res.ok) throw new Error(json?.error || "Failed to load more outfits");
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
    <div className="space-y-8 pb-6">
      <section className="hero-card lift-in overflow-hidden rounded-[2rem] px-5 py-6 sm:px-8 sm:py-8">
        <div className="grid gap-8 lg:grid-cols-[1.35fr_0.9fr] lg:items-end">
          <div className="space-y-5">
            <div className="eyebrow">Today&apos;s Look</div>
            <div className="max-w-3xl space-y-4">
              <h2 className="display-title font-semibold text-foreground">
                {current
                  ? `A sharper outfit for ${formatReadableDate(localDateKey)}`
                  : `Styling the day for ${formatReadableDate(localDateKey)}`}
              </h2>
              <p className="max-w-2xl text-base leading-7 muted-copy sm:text-lg">
                Weather, wardrobe attributes, and outfit balance are working together here,
                so your daily pick feels less mechanical and more styled.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {coords ? (
                <StatPill
                  label="location locked"
                  value={`${coords.lat.toFixed(1)}°, ${coords.lon.toFixed(1)}°`}
                />
              ) : (
                <StatPill label="location" value="Looking up" />
              )}
              <StatPill label="date" value={formatReadableDate(localDateKey)} />
              {current ? (
                <StatPill
                  label={current.debugScores.isRaining ? "rain-aware" : "dry-day"}
                  value={`${current.debugScores.temperatureC.toFixed(1)}°C`}
                />
              ) : null}
            </div>
          </div>

          <div className="glass-card rounded-[1.7rem] p-5 sm:p-6">
            <div className="eyebrow">Recommendation Notes</div>
            <div className="mt-4 space-y-3">
              <div className="text-sm uppercase tracking-[0.14em] text-muted-foreground">
                Status
              </div>
              <div className="text-2xl font-semibold tracking-tight text-foreground">
                {loading
                  ? "Building your look"
                  : current
                    ? `${current.top.subtype} + ${current.bottom.subtype}`
                    : "Waiting for wardrobe data"}
              </div>
              <p className="text-sm leading-6 muted-copy">
                {loading
                  ? "Pulling location, checking weather, and ranking outfit combinations."
                  : current
                    ? current.explanation
                    : "Once wardrobe data is available, Driply will surface a styled combination here."}
              </p>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <section className="status-panel border-danger/30 bg-danger-soft text-danger lift-in">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="eyebrow text-danger">Location or Recommendation Error</div>
              <p className="max-w-2xl text-sm leading-6 text-danger">{error}</p>
              {needs ? (
                <p className="text-sm leading-6 text-danger">
                  Missing:{" "}
                  {[
                    needs.top ? "top" : null,
                    needs.bottom ? "bottom" : null,
                    needs.shoe ? "shoe" : null,
                  ]
                    .filter(Boolean)
                    .join(", ")}{" "}
                  . Add them in{" "}
                  <Link className="font-semibold underline underline-offset-4" href="/library">
                    Library
                  </Link>
                  .
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => void loadInitialRecommendation()}
              className="button-secondary self-start"
            >
              Try again
            </button>
          </div>
        </section>
      ) : null}

      {loading || !current ? (
        <section className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="image-card shimmer min-h-[28rem] bg-surface" />
          <div className="space-y-5">
            <div className="section-card shimmer min-h-[12rem] rounded-[1.7rem]" />
            <div className="section-card shimmer min-h-[14rem] rounded-[1.7rem]" />
          </div>
        </section>
      ) : (
        <>
          <section className="grid gap-5 lg:grid-cols-[1.35fr_0.95fr]">
            <div className="section-card lift-in rounded-[2rem] p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="eyebrow">The Outfit</div>
                  <h3 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                    Styled around your wardrobe.
                  </h3>
                </div>
                <div className="pill pill-accent">
                  Option {selectedIndex + 1}
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {[
                  { label: "Top", item: current.top },
                  { label: "Bottom", item: current.bottom },
                  { label: "Shoes", item: current.shoe },
                ].map((entry, index) => (
                  <article
                    key={entry.label}
                    className="image-card overflow-hidden rounded-[1.45rem] lift-in"
                    style={{ animationDelay: `${index * 70}ms` }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={entry.item.photoUrl}
                      alt={entry.item.subtype}
                      className="h-64 w-full object-cover"
                    />
                    <div className="space-y-4 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            {entry.label}
                          </div>
                          <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                            {formatEnumLabel(entry.item.subtype)}
                          </div>
                        </div>
                        <span className="pill">{formatEnumLabel(entry.item.kind)}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <ItemBadge label="Color" value={entry.item.colorFamily} itemId={entry.item.id} />
                        <ItemBadge label="Pattern" value={entry.item.pattern} itemId={entry.item.id} />
                        <ItemBadge label="Style" value={entry.item.styleProfile} itemId={entry.item.id} />
                        <ItemBadge label="Formality" value={entry.item.formality} itemId={entry.item.id} />
                        <ItemBadge label="Warmth" value={entry.item.warmthLevel} itemId={entry.item.id} />
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="space-y-5">
              <section className="section-card lift-in rounded-[1.8rem] p-5 sm:p-6">
                <div className="eyebrow">Why It Works</div>
                <p className="mt-4 text-base leading-7 text-foreground/90">
                  {current.explanation}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <StatPill
                    label={current.debugScores.isRaining ? "precipitation" : "dry forecast"}
                    value={`${current.debugScores.precipitationMm.toFixed(1)} mm`}
                  />
                  <StatPill label="temperature" value={`${current.debugScores.temperatureC.toFixed(1)}°C`} />
                  <StatPill label="unknown attrs" value={String(current.debugScores.unknownAttributeCount)} />
                </div>
              </section>

              <section className="section-card lift-in rounded-[1.8rem] p-5 sm:p-6">
                <div className="eyebrow">Scoring Breakdown</div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <ScoreChip label="Weather" value={current.debugScores.weatherScore} />
                  <ScoreChip label="Color" value={current.debugScores.colorHarmonyScore} />
                  <ScoreChip label="Style" value={current.debugScores.styleConsistencyScore} />
                  <ScoreChip label="Formality" value={current.debugScores.formalityAlignmentScore} />
                  <ScoreChip label="Pattern" value={current.debugScores.patternBalanceScore} />
                  <ScoreChip label="Warmth" value={current.debugScores.warmthCoherenceScore} />
                </div>
              </section>

              <section className="glass-card lift-in rounded-[1.8rem] p-5 sm:p-6">
                <div className="flex flex-col gap-3">
                  <button
                    onClick={onMarkWorn}
                    disabled={marked}
                    className="button-primary w-full"
                  >
                    {marked ? "Saved to your history" : "Mark as worn"}
                  </button>
                  <button
                    onClick={onShowAnother}
                    disabled={loading}
                    className="button-secondary w-full"
                  >
                    Show another outfit
                  </button>
                </div>
              </section>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="section-card lift-in rounded-[1.8rem] p-5 sm:p-6">
              <div className="eyebrow">Wardrobe Readiness</div>
              <div className="mt-3 max-w-3xl text-base leading-7 muted-copy">
                The current recommendation is driven by weather fit first, then tuned by palette,
                style alignment, and formality. Fewer unknown attributes will make the next picks more decisive.
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className={`pill ${marked ? "pill-success" : "pill-accent"}`}>
                  {marked ? "Today&apos;s look saved" : "Ready to save today&apos;s look"}
                </span>
                <span className="pill">
                  {current.debugScores.metadataCompletenessPenalty > 0
                    ? "Metadata can be improved"
                    : "Metadata looks complete"}
                </span>
              </div>
            </div>

            <div className="section-card lift-in rounded-[1.8rem] p-5 sm:p-6">
              <div className="eyebrow">Quick Action</div>
              <div className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                Need better styling inputs?
              </div>
              <p className="mt-3 text-sm leading-6 muted-copy">
                Head to the Library to tag missing wardrobe details, upload cleaner photos, or
                expand thin categories that limit the outfit mix.
              </p>
              <Link href="/library" className="button-secondary mt-5 w-full sm:w-auto">
                Open wardrobe library
              </Link>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
