'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import { getBrowserSupabaseClient } from '@/lib/supabase/browser';
import {
  TryOnPreview,
  type TryOnPreviewHandle,
} from '@/components/tryon-preview';
import { formatEnumLabel } from '@/lib/itemAttributes';

type Item = {
  id: string;
  kind: 'TOP' | 'BOTTOM' | 'SHOE';
  subtype: string;
  photoUrl: string;
  visualSummary: string | null;
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
  decisionSource: 'ai' | 'algorithm_fallback';
  decisionConfidence: number | null;
  aiReason: string | null;
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
  decisionSource: 'ai' | 'algorithm_fallback';
  decisionConfidence: number | null;
  aiReason: string | null;
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

type LocationSource = 'device' | 'saved' | 'manual' | null;

type UserProfile = {
  displayName: string | null;
  hasTryOnPhoto: boolean;
  archetypeName?: string | null;
};

type WornHistoryItem = {
  id: string;
  dateKey: string;
  topPhotoUrl: string | null;
  bottomPhotoUrl: string | null;
  shoePhotoUrl: string | null;
};

const GEOLOCATION_RETRY_DELAYS_MS = [1200, 2200];

const COLOR_SWATCHES: Record<string, string> = {
  WHITE: '#f0ece4',
  BLACK: '#1a1a1a',
  GRAY: '#8a8a8a',
  NAVY: '#1a2d5a',
  BLUE: '#3a6eb5',
  LIGHT_BLUE: '#8abbe0',
  DENIM: '#4a6fa5',
  RED: '#c0392b',
  PINK: '#e8a0b0',
  ORANGE: '#e87722',
  YELLOW: '#f5c842',
  GREEN: '#2d7d46',
  OLIVE: '#6b7c3d',
  KHAKI: '#c4b490',
  BROWN: '#7d5a3c',
  BEIGE: '#e8d8c0',
  CREAM: '#f5edd5',
  PURPLE: '#7b5ca8',
  MAROON: '#7d2038',
};

function getMoodConfig(
  tempC: number,
  isRaining: boolean,
  hour = new Date().getHours(),
) {
  const isNight = hour >= 20 || hour < 6;

  if (isRaining)
    return {
      gradient:
        'linear-gradient(135deg, oklch(24% 0.10 280) 0%, oklch(16% 0.08 300) 50%, oklch(10% 0.04 270) 100%)',
      glow: 'radial-gradient(ellipse 65% 70% at 20% 60%, oklch(38% 0.16 285 / 0.60) 0%, transparent 70%)',
      particleColor: 'oklch(78% 0.06 280)',
      desc: 'Rainy',
    };
  if (isNight)
    return {
      gradient:
        'linear-gradient(135deg, oklch(18% 0.08 260) 0%, oklch(12% 0.06 280) 55%, oklch(8% 0.03 270) 100%)',
      glow: 'radial-gradient(ellipse 50% 60% at 75% 25%, oklch(55% 0.10 240 / 0.35) 0%, transparent 65%)',
      particleColor: 'oklch(75% 0.06 240)',
      desc: 'Clear night',
    };
  if (tempC < 16)
    return {
      gradient:
        'linear-gradient(135deg, oklch(45% 0.18 245) 0%, oklch(32% 0.20 235) 55%, oklch(15% 0.06 240) 100%)',
      glow: 'radial-gradient(ellipse 60% 80% at 20% 60%, oklch(62% 0.22 240 / 0.50) 0%, transparent 70%)',
      particleColor: 'oklch(82% 0.18 235)',
      desc: 'Cool',
    };
  return {
    gradient:
      'linear-gradient(135deg, oklch(52% 0.16 60) 0%, oklch(38% 0.18 200) 55%, oklch(18% 0.06 240) 100%)',
    glow: 'radial-gradient(ellipse 60% 80% at 20% 60%, oklch(70% 0.20 60 / 0.45) 0%, transparent 70%), radial-gradient(ellipse 50% 70% at 75% 30%, oklch(65% 0.20 200 / 0.35) 0%, transparent 65%)',
    particleColor: 'oklch(85% 0.18 65)',
    desc: 'Sunny',
  };
}

function getLocalDateKey() {
  return new Date().toLocaleDateString('en-CA');
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getGeolocationErrorMessage(error: GeolocationPositionError) {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Location blocked.';
    case error.POSITION_UNAVAILABLE:
      return 'Location unavailable.';
    case error.TIMEOUT:
      return 'Location timed out.';
    default:
      return error.message || 'Location failed.';
  }
}

function isGeolocationPositionError(
  error: unknown,
): error is GeolocationPositionError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'number' &&
    'message' in error &&
    typeof error.message === 'string'
  );
}

function isRetryableGeolocationError(error: GeolocationPositionError) {
  return (
    error.code === error.POSITION_UNAVAILABLE ||
    error.code === error.TIMEOUT ||
    error.message.toLowerCase().includes('locationunknown')
  );
}

function getSavedLocation(savedLocationKey: string): SavedLocation | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(savedLocationKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedLocation;
    if (
      typeof parsed.name === 'string' &&
      typeof parsed.latitude === 'number' &&
      typeof parsed.longitude === 'number'
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function setSavedLocation(
  savedLocationKey: string,
  next: SavedLocation | null,
) {
  if (typeof window === 'undefined') return;
  if (!next) {
    window.localStorage.removeItem(savedLocationKey);
    return;
  }
  window.localStorage.setItem(savedLocationKey, JSON.stringify(next));
}

function formatLocationLabel(location: SavedLocation) {
  return [location.name, location.admin1, location.country]
    .filter(Boolean)
    .join(', ');
}

async function getGeolocationAttempt(): Promise<Coordinates> {
  if (!('geolocation' in navigator)) {
    throw new Error('Geolocation not supported.');
  }
  return await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });
}

async function getGeolocationWithRetry(): Promise<Coordinates> {
  let lastError: unknown;
  for (
    let attempt = 0;
    attempt <= GEOLOCATION_RETRY_DELAYS_MS.length;
    attempt++
  ) {
    try {
      return await getGeolocationAttempt();
    } catch (error) {
      lastError = error;
      if (
        !isGeolocationPositionError(error) ||
        !isRetryableGeolocationError(error)
      ) {
        throw new Error(
          isGeolocationPositionError(error)
            ? getGeolocationErrorMessage(error)
            : String(error),
        );
      }
      if (attempt === GEOLOCATION_RETRY_DELAYS_MS.length) break;
      await sleep(GEOLOCATION_RETRY_DELAYS_MS[attempt]);
    }
  }
  if (isGeolocationPositionError(lastError)) {
    throw new Error(getGeolocationErrorMessage(lastError));
  }
  throw new Error('Location failed.');
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
  // Use .catch so HTML error pages (e.g. Next.js 500) don't throw before the
  // caller can inspect res.ok and surface the right error message.
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

async function searchManualLocations(query: string) {
  const res = await fetch(
    `/api/location-search?q=${encodeURIComponent(query)}`,
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || 'Location search failed.');
  return ((json as { results?: LocationResult[] }).results ?? []) as LocationResult[];
}

export default function TodayPage() {
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [options, setOptions] = useState<RecommendationOption[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [marked, setMarked] = useState(false);
  const [needs, setNeeds] = useState<{
    top: boolean;
    bottom: boolean;
    shoe: boolean;
  } | null>(null);
  const [cursor, setCursor] = useState(0);
  const [locationSource, setLocationSource] = useState<LocationSource>(null);
  const [savedLocation, setSavedLocationState] = useState<SavedLocation | null>(
    null,
  );
  const [activeLocationLabel, setActiveLocationLabel] = useState<string | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LocationResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // v2 state
  const [wornDateKeys, setWornDateKeys] = useState<Set<string>>(new Set());
  const [wornHistory, setWornHistory] = useState<WornHistoryItem[]>([]);
  const [undoRecord, setUndoRecord] = useState<{ id: string; timerId: ReturnType<typeof setTimeout> } | null>(null);
  const [selectedHistoryDay, setSelectedHistoryDay] = useState<string | null>(null);
  const [scoreDisplay, setScoreDisplay] = useState(0);
  const [scoreAnimated, setScoreAnimated] = useState(false);
  const [chatText, setChatText] = useState('');
  const [chatPhase, setChatPhase] = useState<'dots' | 'typing' | 'done'>(
    'dots',
  );

  const particlesRef = useRef<HTMLDivElement | null>(null);
  const gradientRef = useRef<HTMLDivElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const tryOnRef = useRef<TryOnPreviewHandle | null>(null);
  // Pre-start geolocation on mount so it runs in parallel with auth
  const pendingGeoRef = useRef<Promise<Coordinates> | null>(null);

  const pageLimit = 6;
  const localDateKey = useMemo(() => getLocalDateKey(), []);
  const localDateFormatted = useMemo(() => {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }, []);
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);
  const current = options[selectedIndex] ?? null;
  const savedLocationKey = authUserId
    ? `driply-saved-location:${authUserId}`
    : null;

  const mood = useMemo(
    () =>
      current
        ? getMoodConfig(
            current.debugScores.temperatureC,
            current.debugScores.isRaining,
          )
        : null,
    [current],
  );

  const tryOnOutfit = useMemo(
    () =>
      current
        ? { top: current.top, bottom: current.bottom, shoe: current.shoe }
        : null,
    [current],
  );

  // Week history derived state
  const weekDays = useMemo(() => {
    const today = new Date();
    const todayKey = today.toLocaleDateString('en-CA');
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - 6 + i);
      const key = d.toLocaleDateString('en-CA');
      const isPast = key < todayKey;
      return {
        key,
        label: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3),
        state:
          key === todayKey
            ? 'today'
            : wornDateKeys.has(key)
              ? 'worn'
              : isPast
                ? 'missed'
                : 'future',
      };
    });
  }, [wornDateKeys]);

  const streak = useMemo(() => {
    let count = 0;
    const today = new Date();
    for (let i = 0; i <= 30; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      if (!wornDateKeys.has(d.toLocaleDateString('en-CA'))) break;
      count++;
    }
    return count;
  }, [wornDateKeys]);

  // Pre-start geolocation immediately (runs in parallel with auth)
  useEffect(() => {
    const geo = getGeolocationWithRetry();
    geo.catch(() => {}); // suppress unhandledrejection if wardrobe is empty and geo is never awaited
    pendingGeoRef.current = geo;
  }, []);

  // Auth
  useEffect(() => {
    if (typeof window === 'undefined') return;
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

  // Profile + week history
  useEffect(() => {
    if (!authUserId) return;
    let active = true;
    void Promise.all([
      fetch('/api/profile').then((r) => r.json()).catch(() => ({})),
      fetch('/api/style-dna').then((r) => r.json()).catch(() => null),
    ]).then(([profileJson, dnaJson]) => {
      if (!active) return;
      setUserProfile({
        displayName: profileJson.displayName ?? null,
        hasTryOnPhoto: Boolean(profileJson.hasTryOnPhoto),
        archetypeName:
          dnaJson?.exists && dnaJson.textStatus === 'READY' ? (dnaJson.archetypeName ?? null) : null,
      });
    });
    void fetch(`/api/outfits?date=${localDateKey}`)
      .then((r) => r.json())
      .then((json) => {
        if (!active) return;
        setWornDateKeys(new Set((json.dateKeys ?? []) as string[]));
        setWornHistory((json.history ?? []) as WornHistoryItem[]);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [authUserId]);

  // Score ring animation
  useEffect(() => {
    if (!current) return;
    const target = Math.round(current.totalScore * 100);
    setScoreDisplay(0);
    setScoreAnimated(false);
    const timer = setTimeout(() => {
      setScoreAnimated(true);
      let val = 0;
      const step = () => {
        val = Math.min(val + 2, target);
        setScoreDisplay(val);
        if (val < target) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, 300);
    return () => clearTimeout(timer);
  }, [current]);

  // Chat typewriter effect
  useEffect(() => {
    if (!current) return;
    setChatText('');
    setChatPhase('dots');
    const message = current.aiReason ?? current.explanation;
    let rafId: number | null = null;
    const MS_PER_CHAR = 22;
    const timeout = setTimeout(() => {
      setChatPhase('typing');
      let i = 0;
      let startTime: number | null = null;
      const tick = (now: DOMHighResTimeStamp) => {
        if (startTime === null) startTime = now;
        const target = Math.min(
          Math.floor((now - startTime) / MS_PER_CHAR),
          message.length,
        );
        if (target > i) {
          i = target;
          setChatText(message.slice(0, i));
        }
        if (i < message.length) {
          rafId = requestAnimationFrame(tick);
        } else {
          setChatPhase('done');
        }
      };
      rafId = requestAnimationFrame(tick);
    }, 1600);
    return () => {
      clearTimeout(timeout);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [current]);

  // Mood banner particles
  useEffect(() => {
    if (
      !mood ||
      !particlesRef.current ||
      !gradientRef.current ||
      !glowRef.current
    )
      return;
    gradientRef.current.style.background = mood.gradient;
    glowRef.current.style.background = mood.glow;
    const container = particlesRef.current;
    container.innerHTML = '';
    for (let i = 0; i < 14; i++) {
      const p = document.createElement('div');
      p.className = 'mood-particle';
      p.style.cssText = `left:${Math.random() * 100}%;bottom:${Math.random() * 40}%;width:${4 + Math.random() * 6}px;height:${4 + Math.random() * 6}px;background:${mood.particleColor};--dur:${3 + Math.random() * 4}s;--delay:${Math.random() * 4}s;`;
      container.appendChild(p);
    }
  }, [mood]);

  const loadRecommendationsForCoordinates = useCallback(
    async (
      nextCoords: Coordinates,
      source: LocationSource,
      locationLabel?: string,
    ) => {
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
        throw new Error(json?.error || 'Recommendation failed.');
      }
      const data = json as RecommendationOptionsResponse;
      setOptions(data.options ?? []);
      setCursor(data.offset + (data.options?.length ?? 0));
    },
    [localDateKey],
  );

  const loadInitialRecommendation = useCallback(async () => {
    if (!savedLocationKey) return;
    setError(null);
    setLocationError(null);
    setMarked(false);
    setNeeds(null);
    setOptions([]);
    setSelectedIndex(0);
    setCursor(0);
    const storedLocation = getSavedLocation(savedLocationKey);
    setSavedLocationState(storedLocation);

    setLoading(true);
    try {
      const nextCoords = await (pendingGeoRef.current ??
        getGeolocationWithRetry());
      pendingGeoRef.current = null;
      await loadRecommendationsForCoordinates(nextCoords, 'device');
    } catch (e) {
      pendingGeoRef.current = null; // clear so "Retry device" calls geolocation fresh
      const message = e instanceof Error ? e.message : String(e);
      setLocationError(message);
      if (storedLocation) {
        try {
          await loadRecommendationsForCoordinates(
            { lat: storedLocation.latitude, lon: storedLocation.longitude },
            'saved',
            formatLocationLabel(storedLocation),
          );
          setLoading(false);
          return;
        } catch (fallbackError) {
          setError(
            fallbackError instanceof Error
              ? fallbackError.message
              : String(fallbackError),
          );
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
  }, [selectedIndex]);

  async function onMarkWorn() {
    if (!current) return;
    setError(null);
    try {
      const res = await fetch('/api/outfits', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          dateKey: localDateKey,
          topItemId: current.top.id,
          bottomItemId: current.bottom.id,
          shoeItemId: current.shoe.id,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Save failed.');
      const historyId: string = json.history?.id;
      setMarked(true);
      setWornDateKeys((prev) => new Set([...prev, localDateKey]));

      // Set up undo record with auto-dismiss after 5s
      if (undoRecord) clearTimeout(undoRecord.timerId);
      const timerId = setTimeout(() => setUndoRecord(null), 5000);
      setUndoRecord({ id: historyId, timerId });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onUndo() {
    if (!undoRecord) return;
    clearTimeout(undoRecord.timerId);
    setUndoRecord(null);
    try {
      await fetch('/api/outfits', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: undoRecord.id }),
      });
      setMarked(false);
      setWornDateKeys((prev) => {
        const next = new Set(prev);
        next.delete(localDateKey);
        return next;
      });
    } catch {
      // silently fail — user can re-check history
    }
  }

  async function onShowAnother() {
    if (loading) return;
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
      if (!res.ok) throw new Error(json?.error || 'Load failed.');
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
      setSearchError('Enter a city.');
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    setSearchError(null);
    try {
      const results = await searchManualLocations(trimmed);
      setSearchResults(results);
      if (!results.length) setSearchError('No results.');
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
          ? 'saved'
          : 'manual',
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
    setLocationSource((prev) => (prev === 'saved' ? null : prev));
  }

  if (!authReady) {
    return (
      <section className='app-card rounded-3xl p-6 text-sm muted-copy'>
        Loading...
      </section>
    );
  }

  return (
    <div className='space-y-5'>
      {/* ── Mood Banner ── */}
      {current ? (
        <div className='mood-banner'>
          <div className='mood-gradient' ref={gradientRef} />
          <div className='mood-glow' ref={glowRef} />
          <div className='mood-particles' ref={particlesRef} />
          <div className='mood-overlay' />
          <div className='mood-content'>
            <div>
              <div className='mood-date'>
                Today · <span>{localDateFormatted}</span>
              </div>
              <div className='mood-sub'>
                {userProfile?.displayName ? (
                  <>
                    {greeting}, <strong>{userProfile.displayName}</strong> -
                    Here&apos;s your look
                  </>
                ) : (
                  "Here's your look for today"
                )}
              </div>
            </div>
            <div className='mood-weather'>
              <div className='mood-temp'>
                {current.debugScores.temperatureC.toFixed(0)}°
              </div>
              <div className='mood-desc'>
                {mood?.desc}
                {locationSource === 'device'
                  ? ''
                  : activeLocationLabel
                    ? ` · ${activeLocationLabel.split(',')[0]}`
                    : ''}
              </div>
              <div className='mood-wpills'>
                {current.debugScores.isRaining && (
                  <span className='mood-wpill'>Carry Umbrella</span>
                )}
                {current.debugScores.temperatureC > 28 && (
                  <span className='mood-wpill'>UV High</span>
                )}
                {current.debugScores.temperatureC > 25 &&
                  !current.debugScores.isRaining && (
                    <span className='mood-wpill'>Humid</span>
                  )}
                {current.debugScores.temperatureC < 10 && (
                  <span className='mood-wpill'>Layer Up</span>
                )}
                {current.decisionSource !== 'ai' && (
                  <span className='mood-wpill'>Fallback</span>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : !needs ? (
        /* Fallback date header when no outfit yet */
        <div className='flex items-center justify-between'>
          <span
            style={{
              fontFamily: "var(--lp-font-display, 'Space Grotesk', sans-serif)",
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '-0.03em',
              color: 'var(--foreground)',
            }}
          >
            Today ·{' '}
            <span style={{ color: 'oklch(75% 0.18 200)' }}>
              {localDateFormatted}
            </span>
          </span>
        </div>
      ) : null}

      {/* ── Location error ── */}
      {locationError && !needs ? (
        <section className='app-card rounded-3xl p-4'>
          <div className='space-y-4'>
            <div>
              <div className='text-sm text-foreground'>
                Location unavailable
              </div>
              <div className='mt-1 text-sm muted-copy'>{locationError}</div>
            </div>
            {savedLocation ? (
              <div className='flex flex-col gap-3 sm:flex-row sm:items-center'>
                <button
                  type='button'
                  onClick={() => void onUseLocation(savedLocation)}
                  className='button-secondary'
                >
                  Use {formatLocationLabel(savedLocation)}
                </button>
                <button
                  type='button'
                  onClick={onClearSavedLocation}
                  className='button-ghost'
                >
                  Clear saved location
                </button>
              </div>
            ) : null}
            <div className='flex flex-col gap-3 sm:flex-row'>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder='Search city'
                className='input-base w-full'
              />
              <button
                type='button'
                onClick={() => void onSearchLocation()}
                disabled={searchLoading}
                className='button-secondary'
              >
                {searchLoading ? 'Searching...' : 'Search'}
              </button>
              <button
                type='button'
                onClick={() => void loadInitialRecommendation()}
                className='button-ghost'
              >
                Retry device
              </button>
            </div>
            {searchError ? (
              <div className='text-sm muted-copy'>{searchError}</div>
            ) : null}
            {searchResults.length > 0 ? (
              <div className='space-y-2'>
                {searchResults.map((result) => (
                  <button
                    key={`${result.name}-${result.latitude}-${result.longitude}`}
                    type='button'
                    onClick={() => void onUseLocation(result)}
                    className='subtle-card flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left'
                  >
                    <span className='text-sm text-foreground'>
                      {formatLocationLabel(result)}
                    </span>
                    <span className='muted-copy text-xs'>Use</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* ── Empty wardrobe state ── */}
      {needs ? (
        <>
          <section className='app-card rounded-3xl p-9 text-center'>
            <div className='flex flex-col items-center gap-4'>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 18,
                  background: 'var(--surface-subtle)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                }}
              >
                👕
              </div>
              <div className='space-y-2'>
                <p className='text-lg font-bold tracking-tight text-foreground'>
                  Build your wardrobe first
                </p>
                <p className='text-sm muted-copy max-w-xs mx-auto'>
                  Add at least one item in each category to receive daily outfit
                  recommendations.
                </p>
              </div>
              <div className='flex flex-wrap justify-center gap-2'>
                {needs.top && (
                  <span className='missing-tag'>+ Tops missing</span>
                )}
                {needs.bottom && (
                  <span className='missing-tag'>+ Bottoms missing</span>
                )}
                {needs.shoe && (
                  <span className='missing-tag'>+ Shoes missing</span>
                )}
              </div>
              <Link href='/library' className='button-primary'>
                Go to wardrobe →
              </Link>
            </div>
          </section>

          {userProfile !== null && !userProfile.hasTryOnPhoto ? (
            <section className='app-card rounded-3xl p-9 text-center'>
              <div className='flex flex-col items-center gap-4'>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 18,
                    background: 'var(--surface-subtle)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 24,
                    color: 'oklch(75% 0.18 200)',
                  }}
                >
                  ✦
                </div>
                <div className='space-y-2'>
                  <p className='text-base font-bold tracking-tight text-foreground'>
                    AI outfit preview unavailable
                  </p>
                  <p className='text-sm muted-copy max-w-xs mx-auto'>
                    Upload a full-body photo on your Profile to enable
                    AI-generated outfit previews.
                  </p>
                </div>
                <Link href='/profile' className='button-primary'>
                  Go to Profile →
                </Link>
              </div>
            </section>
          ) : null}
        </>
      ) : error ? (
        <section className='app-card rounded-3xl p-4'>
          <div className='space-y-2'>
            <div className='text-sm text-danger'>{error}</div>
            <button
              type='button'
              onClick={() => void loadInitialRecommendation()}
              className='button-secondary'
            >
              Retry
            </button>
          </div>
        </section>
      ) : null}

      {/* ── Loading shimmer ── */}
      {loading && !current ? (
        <div className='outfit-hero'>
          <div className='outfit-hero-item outfit-hero-main shimmer' />
          <div className='outfit-hero-item shimmer' />
          <div className='outfit-hero-item shimmer' />
        </div>
      ) : null}

      {/* ── Hero Outfit Collage ── */}
      {current ? (
        <div className='outfit-hero'>
          {/* Main — Top (spans 2 rows) */}
          <div
            className='outfit-hero-item outfit-hero-main'
            onClick={() => void onShowAnother()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current.top.photoUrl} alt={current.top.subtype} />
            <div className='outfit-item-tag'>
              <div>
                <div className='outfit-item-tag-category'>Top</div>
                <div className='outfit-item-tag-name'>
                  {formatEnumLabel(current.top.subtype)}
                </div>
              </div>
              <div
                className='outfit-item-swatch'
                style={{
                  background: COLOR_SWATCHES[current.top.colorFamily] ?? '#888',
                }}
              />
            </div>
            <div className='outfit-swap-hint'>↔ Another look</div>
          </div>
          {/* Bottom */}
          <div
            className='outfit-hero-item'
            onClick={() => void onShowAnother()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current.bottom.photoUrl} alt={current.bottom.subtype} />
            <div className='outfit-item-tag'>
              <div>
                <div className='outfit-item-tag-category'>Bottom</div>
                <div className='outfit-item-tag-name'>
                  {formatEnumLabel(current.bottom.subtype)}
                </div>
              </div>
              <div
                className='outfit-item-swatch'
                style={{
                  background:
                    COLOR_SWATCHES[current.bottom.colorFamily] ?? '#888',
                }}
              />
            </div>
            <div className='outfit-swap-hint'>↔ Another look</div>
          </div>
          {/* Shoes */}
          <div
            className='outfit-hero-item'
            onClick={() => void onShowAnother()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current.shoe.photoUrl} alt={current.shoe.subtype} />
            <div className='outfit-item-tag'>
              <div>
                <div className='outfit-item-tag-category'>Shoes</div>
                <div className='outfit-item-tag-name'>
                  {formatEnumLabel(current.shoe.subtype)}
                </div>
              </div>
              <div
                className='outfit-item-swatch'
                style={{
                  background:
                    COLOR_SWATCHES[current.shoe.colorFamily] ?? '#888',
                }}
              />
            </div>
            <div className='outfit-swap-hint'>↔ Another look</div>
          </div>
        </div>
      ) : null}

      {/* ── Fit Score Ring ── */}
      {current ? (
        <div className='score-ring-section'>
          <div className='score-ring-wrap'>
            <svg width='108' height='108' viewBox='0 0 108 108'>
              <circle className='ring-track' cx='54' cy='54' r='46' />
              <circle
                className='ring-fill'
                cx='54'
                cy='54'
                r='46'
                style={{
                  strokeDashoffset: scoreAnimated
                    ? 289 - 289 * current.totalScore
                    : 289,
                }}
              />
            </svg>
            <div className='score-ring-center'>
              <div className='score-ring-num'>{scoreDisplay}</div>
              <div className='score-ring-label'>fit score</div>
            </div>
          </div>
          <div className='score-ring-details'>
            <div className='score-ring-title'>
              {userProfile?.displayName ? (
                <>
                  Looking sharp, <strong>{userProfile.displayName}</strong> ✦
                </>
              ) : (
                'Looking sharp ✦'
              )}
            </div>
            {userProfile?.archetypeName && (
              <div className="sdna-archetype-badge" style={{ marginTop: 6 }}>
                ✦ {userProfile.archetypeName}
              </div>
            )}
            <div className='score-mini-bars'>
              {[
                { label: 'Weather', value: current.debugScores.weatherScore },
                {
                  label: 'Color harmony',
                  value: current.debugScores.colorHarmonyScore,
                  warm: true,
                },
                {
                  label: 'Style cohesion',
                  value: current.debugScores.styleConsistencyScore,
                },
                {
                  label: 'Formality',
                  value: current.debugScores.formalityAlignmentScore,
                },
              ].map(({ label, value, warm }) => (
                <div key={label} className='score-mini-row'>
                  <span className='score-mini-label'>{label}</span>
                  <div className='score-mini-track'>
                    <div
                      className={`score-mini-fill${warm ? ' warm' : ''}`}
                      style={{
                        transform: scoreAnimated
                          ? `scaleX(${value})`
                          : 'scaleX(0)',
                      }}
                    />
                  </div>
                  <span className='score-mini-val'>
                    {Math.round(value * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── AI Chat Card ── */}
      {current && userProfile !== null ? (
        <div className='ai-chat-card'>
          {/* Header */}
          <div className='ai-chat-header'>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className='ai-orb'>✦</div>
              <div>
                <div
                  style={{
                    fontFamily:
                      "var(--lp-font-display, 'Space Grotesk', sans-serif)",
                    fontSize: 14,
                    fontWeight: 600,
                    letterSpacing: '-0.01em',
                  }}
                >
                  Stylist AI
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--muted-foreground)',
                    fontWeight: 300,
                  }}
                >
                  Personalized reasoning
                </div>
              </div>
            </div>
            {userProfile.hasTryOnPhoto ? (
              <button
                type='button'
                className='btn-ootd'
                onClick={() => tryOnRef.current?.generate()}
              >
                OOTD ↗
              </button>
            ) : (
              <Link
                href='/profile'
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'oklch(75% 0.18 200)',
                  color: 'oklch(9% 0.008 240)',
                  fontFamily:
                    "var(--lp-font-display, 'Space Grotesk', sans-serif)",
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '7px 14px',
                  borderRadius: 100,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  textDecoration: 'none',
                }}
              >
                Set up
              </Link>
            )}
          </div>

          {/* Embedded TryOnPreview (only shows when loading/success/fallback) */}
          {tryOnOutfit && (
            <TryOnPreview
              ref={tryOnRef}
              outfit={tryOnOutfit}
              hasTryOnPhoto={userProfile.hasTryOnPhoto}
              displayName={userProfile.displayName}
              embedded
            />
          )}

          {/* Chat bubble */}
          <div style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 9,
                  background: 'oklch(75% 0.18 200 / 0.1)',
                  border: '1px solid oklch(75% 0.18 200 / 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  flexShrink: 0,
                  marginTop: 14,
                }}
              >
                ✦
              </div>
              <div className='ai-chat-bubble'>
                {chatPhase === 'dots' ? (
                  <div className='typing-dots'>
                    <div className='typing-dot' />
                    <div className='typing-dot' />
                    <div className='typing-dot' />
                  </div>
                ) : (
                  <>
                    {chatText}
                    <span
                      className={`ai-chat-cursor${chatPhase === 'done' ? ' done' : ''}`}
                    />
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Action row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10,
              padding: '16px 20px 20px',
              borderTop: '1px solid var(--border)',
            }}
          >
            <button
              type='button'
              onClick={() => void onMarkWorn()}
              disabled={marked}
              className='button-primary'
              style={{
                borderRadius: 100,
                padding: '13px 20px',
                fontSize: 14,
                fontWeight: 600,
                fontFamily:
                  "var(--lp-font-display, 'Space Grotesk', sans-serif)",
              }}
            >
              {marked ? 'Worn today ✓' : 'Mark as worn'}
            </button>
            <button
              type='button'
              onClick={() => void onShowAnother()}
              disabled={loading}
              className='button-secondary'
              style={{
                borderRadius: 100,
                padding: '13px 20px',
                fontSize: 14,
                fontWeight: 600,
                fontFamily:
                  "var(--lp-font-display, 'Space Grotesk', sans-serif)",
              }}
            >
              Another look
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Week History ── */}
      {current ? (
        <div className='week-section'>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
            }}
          >
            <span
              style={{
                fontFamily:
                  "var(--lp-font-display, 'Space Grotesk', sans-serif)",
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: '-0.01em',
              }}
            >
              This week
            </span>
            {streak > 0 && (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontFamily:
                    "var(--lp-font-display, 'Space Grotesk', sans-serif)",
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--warning)',
                }}
              >
                🔥 {streak}-day streak
              </span>
            )}
          </div>
          <div className='week-days'>
            {weekDays.map((day) => (
              <div key={day.key} className='week-day'>
                <div className='week-day-label'>{day.label}</div>
                <button
                  type='button'
                  disabled={day.state !== 'worn'}
                  onClick={() => day.state === 'worn' && setSelectedHistoryDay(
                    selectedHistoryDay === day.key ? null : day.key
                  )}
                  className={`week-dot-wrap ${day.state}${selectedHistoryDay === day.key ? ' selected' : ''}`}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: day.state === 'worn' ? 'pointer' : 'default' }}
                  aria-label={day.state === 'worn' ? `View outfit worn on ${day.label}` : undefined}
                >
                  <div className='week-dot' />
                </button>
              </div>
            ))}
          </div>

          {/* Inline outfit detail for selected day */}
          {selectedHistoryDay && (() => {
            const entry = wornHistory.find((h) => h.dateKey === selectedHistoryDay);
            if (!entry) return null;
            const photos = [
              { url: entry.topPhotoUrl, label: 'Top' },
              { url: entry.bottomPhotoUrl, label: 'Bottom' },
              { url: entry.shoePhotoUrl, label: 'Shoes' },
            ];
            return (
              <div
                style={{
                  marginTop: 12,
                  padding: '12px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  {photos.map(({ url, label }) => (
                    <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <div
                        style={{
                          width: '100%',
                          aspectRatio: '1',
                          borderRadius: 12,
                          overflow: 'hidden',
                          background: 'var(--background)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        {url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={url} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)', fontSize: 20 }}>?</div>
                        )}
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--muted-foreground)', fontFamily: "var(--lp-font-display, 'Space Grotesk', sans-serif)" }}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      ) : null}

      {/* Undo toast — fixed above bottom nav */}
      {undoRecord ? (
        <div
          style={{
            position: 'fixed',
            bottom: 'calc(64px + 16px)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 9999,
            padding: '10px 16px 10px 20px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
            whiteSpace: 'nowrap',
            minWidth: 240,
            maxWidth: 'calc(100vw - 32px)',
          }}
        >
          <span style={{ flex: 1, fontSize: 13, fontWeight: 500, fontFamily: "var(--lp-font-display, 'Space Grotesk', sans-serif)" }}>
            Outfit logged ✓
          </span>
          <button
            type='button'
            onClick={() => void onUndo()}
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: 'oklch(75% 0.18 200)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: 9999,
              fontFamily: "var(--lp-font-display, 'Space Grotesk', sans-serif)",
            }}
          >
            Undo
          </button>
        </div>
      ) : null}
    </div>
  );
}
