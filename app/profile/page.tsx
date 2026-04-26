"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { fetchJson } from "@/lib/fetch-utils";
import { validateImageFile } from "@/lib/file-utils";
import {
  QUIZ_QUESTIONS,
  parseStylePreferences,
  type StylePreferences,
} from "@/lib/style-preferences";

type ProfileData = {
  displayName: string | null;
  avatarUrl: string | null;
  aiTryOnPhotoUrl: string | null;
  hasTryOnPhoto: boolean;
  stylePreferences: StylePreferences | null;
};

function AvatarPlaceholder({ letter }: { letter?: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-surface text-2xl font-semibold text-foreground">
      {letter ?? (
        <svg viewBox="0 0 24 24" className="h-10 w-10 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" strokeLinecap="round" />
        </svg>
      )}
    </div>
  );
}

async function checkLandscape(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img.width > img.height * 1.2); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(false); };
    img.src = url;
  });
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [tryOnFile, setTryOnFile] = useState<File | null>(null);
  const [tryOnPreview, setTryOnPreview] = useState<string | null>(null);
  const [tryOnError, setTryOnError] = useState<string | null>(null);
  const [tryOnLandscapeWarn, setTryOnLandscapeWarn] = useState(false);

  const [localPrefs, setLocalPrefs] = useState<Partial<StylePreferences>>({});
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsSuccess, setPrefsSuccess] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const tryOnInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const data = await fetchJson<ProfileData>("/api/profile");
        setProfile(data);
        setDisplayName(data.displayName ?? "");
        setLocalPrefs(data.stylePreferences ?? {});
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Derived: save button appears only when all 5 answers are filled and at least one differs from saved
  const isComplete = QUIZ_QUESTIONS.every((q) => localPrefs[q.field] !== undefined);
  const isDirty =
    isComplete &&
    QUIZ_QUESTIONS.some((q) => localPrefs[q.field] !== (profile?.stylePreferences?.[q.field] ?? undefined));

  function onAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateImageFile(file);
    if (err) { setAvatarError(err); return; }
    setAvatarError(null);
    setAvatarFile(file);
    const prev = avatarPreview;
    const url = URL.createObjectURL(file);
    setAvatarPreview(url);
    if (prev) URL.revokeObjectURL(prev);
  }

  async function onTryOnChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateImageFile(file);
    if (err) { setTryOnError(err); return; }
    setTryOnError(null);
    setTryOnFile(file);
    const prev = tryOnPreview;
    const url = URL.createObjectURL(file);
    setTryOnPreview(url);
    if (prev) URL.revokeObjectURL(prev);
    const isLandscape = await checkLandscape(file);
    setTryOnLandscapeWarn(isLandscape);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const hasChanges = displayName !== (profile?.displayName ?? "") || avatarFile || tryOnFile;
    if (!hasChanges) {
      setError("No changes to save.");
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      if (displayName.trim() && displayName !== (profile?.displayName ?? "")) {
        formData.set("displayName", displayName.trim());
      }
      if (avatarFile) formData.set("avatar", avatarFile);
      if (tryOnFile) formData.set("aiTryOnPhoto", tryOnFile);

      const res = await fetch("/api/profile", { method: "PATCH", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Save failed.");

      setProfile((prev) => ({
        ...prev!,
        displayName: json.displayName,
        avatarUrl: json.avatarUrl,
        aiTryOnPhotoUrl: json.aiTryOnPhotoUrl,
        hasTryOnPhoto: json.hasTryOnPhoto,
      }));
      setAvatarFile(null);
      setTryOnFile(null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function onSavePrefs(prefs: StylePreferences) {
    setPrefsSaving(true);
    try {
      const formData = new FormData();
      formData.set("stylePreferences", JSON.stringify(prefs));
      const res = await fetch("/api/profile", { method: "PATCH", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Save failed.");
      // Update saved state so isDirty becomes false
      setProfile((prev) => ({ ...prev!, stylePreferences: parseStylePreferences(prefs) }));
      setPrefsSuccess(true);
      setTimeout(() => setPrefsSuccess(false), 3000);
    } catch {
      // Non-fatal — leave local state so user can retry
    } finally {
      setPrefsSaving(false);
    }
  }

  const effectiveAvatarSrc = avatarPreview ?? profile?.avatarUrl ?? null;
  const effectiveTryOnSrc = tryOnPreview ?? profile?.aiTryOnPhotoUrl ?? null;
  const displayInitial = (displayName || profile?.displayName || "").charAt(0).toUpperCase() || undefined;

  if (loading) {
    return (
      <section className="app-card shimmer rounded-3xl p-6 text-sm muted-copy">
        Loading...
      </section>
    );
  }

  return (
    <form onSubmit={onSave} className="space-y-6">
      {error ? (
        <section className="app-card rounded-3xl p-4 text-sm text-danger">{error}</section>
      ) : null}

      {success ? (
        <section className="app-card rounded-3xl p-4 text-sm text-foreground">
          Profile saved.
        </section>
      ) : null}

      {/* Account — avatar + display name side by side */}
      <section className="app-card rounded-3xl p-4">
        <h2 className="mb-4 text-base font-medium text-foreground">Account</h2>
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            aria-label="Upload profile picture"
            className="relative h-28 w-28 flex-shrink-0 overflow-hidden rounded-full border border-border bg-surface transition hover:opacity-80"
          >
            {effectiveAvatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={effectiveAvatarSrc} alt="Profile picture" className="h-full w-full object-cover" />
            ) : (
              <AvatarPlaceholder letter={displayInitial} />
            )}
          </button>

          {/* Name + change photo */}
          <div className="flex flex-1 flex-col gap-3">
            <label className="field-label">
              <span>Display name</span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                maxLength={80}
                className="input-base"
              />
            </label>
            <div>
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="button-primary"
              >
                {effectiveAvatarSrc ? "Change photo" : "Upload photo"}
              </button>
              <p className="mt-1 text-xs muted-copy">JPG, PNG, or WEBP · Max 10 MB</p>
              {avatarError ? <p className="mt-1 text-xs text-danger">{avatarError}</p> : null}
            </div>
          </div>
        </div>

        <input
          ref={avatarInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={onAvatarChange}
        />
      </section>

      {/* Style Preferences — inside form for visual ordering; type="button" prevents submit */}
      <section className="app-card rounded-3xl p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-medium text-foreground">Style preferences</h2>
          {prefsSuccess ? <span className="text-xs muted-copy">Saved</span> : null}
        </div>

        <div className="space-y-3">
          {QUIZ_QUESTIONS.map((q) => (
            <div key={q.field} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
              <span className="text-xs font-medium muted-copy sm:w-24 sm:shrink-0 sm:font-normal">{q.shortLabel}</span>
              <div className="flex flex-wrap gap-1.5">
                {q.options.map((option) => {
                  const isSelected = localPrefs[q.field] === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setLocalPrefs((prev) => ({ ...prev, [q.field]: option.value }))}
                      className={`rounded-full border px-3 py-1 text-xs transition ${
                        isSelected
                          ? "border-[oklch(72%_0.14_200)] bg-transparent font-bold text-[oklch(75%_0.18_200)]"
                          : "border-border font-medium text-foreground hover:border-foreground/50"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {isDirty ? (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              disabled={prefsSaving}
              onClick={() => void onSavePrefs(localPrefs as StylePreferences)}
              className="button-primary"
            >
              {prefsSaving ? "Saving..." : "Save preferences"}
            </button>
          </div>
        ) : null}
      </section>

      {/* AI try-on photo */}
      <section className="app-card rounded-3xl p-4">
        <div className="mb-1 flex items-center gap-2">
          <h2 className="text-base font-medium text-foreground">AI try-on photo</h2>
          {profile?.hasTryOnPhoto ? (
            <span className="pill pill-success">Uploaded</span>
          ) : null}
        </div>

        <p className="mb-1 text-sm muted-copy">
          Upload a clear full-body photo from head to toe. This image will be used for AI outfit previews and helps generate more accurate results.
        </p>
        <p className="mb-4 text-xs muted-copy">
          Used only for AI-generated outfit previews · Not shared with other users
        </p>

        <div className="space-y-4">
          {tryOnLandscapeWarn ? (
            <p className="text-xs text-foreground">
              This photo appears landscape-oriented. For best results, upload a portrait-oriented full-body image.
            </p>
          ) : null}
          {tryOnError ? <p className="text-xs text-danger">{tryOnError}</p> : null}

          {effectiveTryOnSrc ? (
            <div className="relative overflow-hidden rounded-2xl border border-border bg-surface-subtle">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={effectiveTryOnSrc}
                alt="AI try-on photo preview"
                className="mx-auto max-h-72 w-auto object-contain"
              />
            </div>
          ) : (
            <div className="flex h-40 items-center justify-center rounded-2xl border border-border bg-surface-subtle">
              <div className="text-center">
                <svg viewBox="0 0 24 24" className="mx-auto mb-2 h-8 w-8 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" strokeLinecap="round" />
                  <circle cx="12" cy="7" r="4" />
                  <path d="M12 3v4M10 5h4" strokeLinecap="round" />
                </svg>
                <p className="text-sm muted-copy">No try-on photo yet</p>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => tryOnInputRef.current?.click()}
            className="button-primary"
          >
            {profile?.hasTryOnPhoto || tryOnFile ? "Change photo" : "Upload full-body photo"}
          </button>
          <p className="text-xs muted-copy">
            For best results: stand in a neutral pose with good lighting, visible head to toe. JPG, PNG, or WEBP · Max 10 MB
          </p>
        </div>

        <input
          ref={tryOnInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={onTryOnChange}
        />
      </section>

      <div className="flex justify-end">
        <button type="submit" disabled={saving} className="button-primary">
          {saving ? "Saving..." : "Save profile"}
        </button>
      </div>
    </form>
  );
}
