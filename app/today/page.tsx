"use client";

import { useEffect, useMemo, useState } from "react";

import { EmptyWardrobe } from "@/components/today/empty-wardrobe";
import { LocationPanel } from "@/components/today/location-panel";
import { MoodBanner } from "@/components/today/mood-banner";
import { OutfitHero } from "@/components/today/outfit-hero";
import { ScoreRing } from "@/components/today/score-ring";
import { StylistChatCard } from "@/components/today/stylist-chat-card";
import { UndoToast } from "@/components/today/undo-toast";
import { WeekHistory } from "@/components/today/week-history";
import { isHandledFetchError } from "@/lib/fetch-utils";
import { useApiFetch } from "@/lib/hooks/use-api-fetch";
import { useAuthUser } from "@/lib/hooks/use-auth-user";
import { useRecommendations } from "@/lib/hooks/use-recommendations";
import type { ProfileResponse, RecommendationOption, WornHistoryItem } from "@/lib/types/wardrobe";

type UserProfile = {
  displayName: string | null;
  hasTryOnPhoto: boolean;
  archetypeName: string | null;
};

function getLocalDateKey() {
  return new Date().toLocaleDateString("en-CA");
}

function outfitKey(option: RecommendationOption) {
  return `${option.top.id}_${option.bottom.id}_${option.shoe.id}`;
}

export default function TodayPage() {
  const apiFetch = useApiFetch();
  const { user, ready: authReady } = useAuthUser();
  const authUserId = user?.id ?? null;

  const localDateKey = useMemo(() => getLocalDateKey(), []);
  const localDateFormatted = useMemo(() => {
    return new Date().toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }, []);
  const savedLocationKey = authUserId ? `driply-saved-location:${authUserId}` : null;

  const rec = useRecommendations({ savedLocationKey, dateKey: localDateKey });
  const { current, loadInitial } = rec;

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [wornDateKeys, setWornDateKeys] = useState<Set<string>>(new Set());
  const [wornHistory, setWornHistory] = useState<WornHistoryItem[]>([]);
  // The outfit (by item ids) marked worn today — derived per option, so
  // swapping looks clears the checkmark and swapping back restores it.
  const [markedOutfitKey, setMarkedOutfitKey] = useState<string | null>(null);
  const [undoRecord, setUndoRecord] = useState<{
    id: string;
    timerId: ReturnType<typeof setTimeout>;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const marked = current !== null && markedOutfitKey === outfitKey(current);
  const displayError = rec.error ?? actionError;

  // Profile + week history
  useEffect(() => {
    if (!authUserId) return;
    let active = true;
    void Promise.all([
      apiFetch<ProfileResponse>("/api/profile").catch(() => null),
      apiFetch<{ exists?: boolean; textStatus?: string; archetypeName?: string | null }>(
        "/api/style-dna",
      ).catch(() => null),
    ]).then(([profileJson, dnaJson]) => {
      if (!active || !profileJson) return;
      setUserProfile({
        displayName: profileJson.displayName ?? null,
        hasTryOnPhoto: Boolean(profileJson.hasTryOnPhoto),
        archetypeName:
          dnaJson?.exists && dnaJson.textStatus === "READY"
            ? (dnaJson.archetypeName ?? null)
            : null,
      });
    });
    void apiFetch<{ dateKeys?: string[]; history?: WornHistoryItem[] }>(
      `/api/outfits?date=${localDateKey}`,
    )
      .then((json) => {
        if (!active) return;
        setWornDateKeys(new Set(json.dateKeys ?? []));
        setWornHistory(json.history ?? []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [authUserId, localDateKey, apiFetch]);

  useEffect(() => {
    if (!authReady) return;
    void loadInitial();
  }, [authReady, loadInitial]);

  async function onMarkWorn() {
    if (!current) return;
    setActionError(null);
    try {
      const json = await apiFetch<{ history?: { id: string } }>("/api/outfits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dateKey: localDateKey,
          topItemId: current.top.id,
          bottomItemId: current.bottom.id,
          shoeItemId: current.shoe.id,
        }),
      });
      const historyId = json.history?.id;
      if (!historyId) throw new Error("Save failed.");
      setMarkedOutfitKey(outfitKey(current));
      setWornDateKeys((prev) => new Set([...prev, localDateKey]));

      // Set up undo record with auto-dismiss after 5s
      if (undoRecord) clearTimeout(undoRecord.timerId);
      const timerId = setTimeout(() => setUndoRecord(null), 5000);
      setUndoRecord({ id: historyId, timerId });
    } catch (e) {
      if (isHandledFetchError(e)) return;
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onUndo() {
    if (!undoRecord) return;
    clearTimeout(undoRecord.timerId);
    setUndoRecord(null);
    try {
      await apiFetch("/api/outfits", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: undoRecord.id }),
      });
      setMarkedOutfitKey(null);
      setWornDateKeys((prev) => {
        const next = new Set(prev);
        next.delete(localDateKey);
        return next;
      });
    } catch {
      // silently fail — user can re-check history
    }
  }

  if (!authReady) {
    return <section className="app-card rounded-3xl p-6 text-sm muted-copy">Loading...</section>;
  }

  return (
    <div className="space-y-5">
      {/* ── Mood Banner ── */}
      {current ? (
        <MoodBanner
          option={current}
          displayName={userProfile?.displayName ?? null}
          locationSource={rec.locationSource}
          activeLocationLabel={rec.activeLocationLabel}
        />
      ) : !rec.needs ? (
        /* Fallback date header when no outfit yet */
        <div className="flex items-center justify-between">
          <span
            style={{
              fontFamily: "var(--lp-font-display, 'Space Grotesk', sans-serif)",
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: "var(--foreground)",
            }}
          >
            Today · <span style={{ color: "oklch(75% 0.18 200)" }}>{localDateFormatted}</span>
          </span>
        </div>
      ) : null}

      {/* ── Location error ── */}
      {rec.locationError && !rec.needs ? (
        <LocationPanel
          locationError={rec.locationError}
          savedLocation={rec.savedLocation}
          onUseLocation={(location) => void rec.useLocation(location)}
          onClearSavedLocation={rec.clearSavedLocation}
          onRetryDevice={() => void rec.loadInitial()}
        />
      ) : null}

      {/* ── Empty wardrobe state ── */}
      {rec.needs ? (
        <EmptyWardrobe
          needs={rec.needs}
          showTryOnPrompt={userProfile !== null && !userProfile.hasTryOnPhoto}
        />
      ) : displayError ? (
        <section className="app-card rounded-3xl p-4">
          <div className="space-y-2">
            <div className="text-sm text-danger">{displayError}</div>
            <button
              type="button"
              onClick={() => void rec.loadInitial()}
              className="button-secondary"
            >
              Retry
            </button>
          </div>
        </section>
      ) : null}

      {/* ── Loading shimmer ── */}
      {rec.loading && !current ? (
        <div className="outfit-hero">
          <div className="outfit-hero-item outfit-hero-main shimmer" />
          <div className="outfit-hero-item shimmer" />
          <div className="outfit-hero-item shimmer" />
        </div>
      ) : null}

      {/* ── Hero Outfit Collage ── */}
      {current ? <OutfitHero option={current} onSwap={() => void rec.showAnother()} /> : null}

      {/* ── Fit Score Ring ── */}
      {current ? (
        <ScoreRing
          key={outfitKey(current)}
          option={current}
          displayName={userProfile?.displayName ?? null}
          archetypeName={userProfile?.archetypeName ?? null}
        />
      ) : null}

      {/* ── AI Chat Card ── */}
      {current && userProfile !== null ? (
        <StylistChatCard
          option={current}
          displayName={userProfile.displayName}
          hasTryOnPhoto={userProfile.hasTryOnPhoto}
          marked={marked}
          loading={rec.loading}
          onMarkWorn={() => void onMarkWorn()}
          onShowAnother={() => void rec.showAnother()}
        />
      ) : null}

      {/* ── Week History ── */}
      {current ? <WeekHistory wornDateKeys={wornDateKeys} wornHistory={wornHistory} /> : null}

      {/* Undo toast — fixed above bottom nav */}
      {undoRecord ? <UndoToast onUndo={() => void onUndo()} /> : null}
    </div>
  );
}
