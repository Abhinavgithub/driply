"use client";

import { useCallback, useEffect, useRef } from "react";

export type Coordinates = {
  lat: number;
  lon: number;
};

const GEOLOCATION_RETRY_DELAYS_MS = [1200, 2200];

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
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });
}

/** Device geolocation with retries on transient failures; throws Error with a user-facing message. */
export async function getGeolocationWithRetry(): Promise<Coordinates> {
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

/**
 * Starts geolocation on mount so it resolves in parallel with auth/data
 * loading. `takePendingGeolocation()` hands the in-flight promise to the
 * first caller (or null afterwards) — callers fall back to a fresh
 * getGeolocationWithRetry() when it's been consumed.
 */
export function useEagerGeolocation() {
  const pendingGeoRef = useRef<Promise<Coordinates> | null>(null);

  useEffect(() => {
    const geo = getGeolocationWithRetry();
    geo.catch(() => {}); // suppress unhandledrejection if never awaited (e.g. empty wardrobe)
    pendingGeoRef.current = geo;
  }, []);

  return useCallback(() => {
    const pending = pendingGeoRef.current;
    pendingGeoRef.current = null;
    return pending;
  }, []);
}
