"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

type ItemKind = "TOP" | "BOTTOM" | "SHOE";
type WizardStep = 1 | 2;
type ItemCounts = { TOP: number; BOTTOM: number; SHOE: number };
type Previews = { TOP: string | null; BOTTOM: string | null; SHOE: string | null };

function validateImageFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return "Please upload a JPG, PNG, or WEBP image.";
  if (file.size > MAX_BYTES) return "File is too large (max 10 MB).";
  return null;
}

function ArrowRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M11 7H3M6 10l-3-3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M9 12V4M6 7l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 21c0-4 3-7 7-7s7 3 7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.5L2 4v4c0 3.3 2.5 6.4 6 7 3.5-.6 6-3.7 6-7V4L8 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M5.5 8l2 2 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(1);
  const [counts, setCounts] = useState<ItemCounts>({ TOP: 0, BOTTOM: 0, SHOE: 0 });
  const [previews, setPreviews] = useState<Previews>({ TOP: null, BOTTOM: null, SHOE: null });
  const [uploading, setUploading] = useState<Partial<Record<ItemKind, boolean>>>({});
  const [uploadErrors, setUploadErrors] = useState<Partial<Record<ItemKind, string>>>({});
  const [tryOnPreview, setTryOnPreview] = useState<string | null>(null);
  const [tryOnFile, setTryOnFile] = useState<File | null>(null);
  const [tryOnSaved, setTryOnSaved] = useState(false);
  const [tryOnUploading, setTryOnUploading] = useState(false);
  const [tryOnError, setTryOnError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const topInputRef = useRef<HTMLInputElement>(null);
  const bottomInputRef = useRef<HTMLInputElement>(null);
  const shoeInputRef = useRef<HTMLInputElement>(null);
  const tryOnInputRef = useRef<HTMLInputElement>(null);

  const inputRefMap: Record<ItemKind, React.RefObject<HTMLInputElement | null>> = {
    TOP: topInputRef,
    BOTTOM: bottomInputRef,
    SHOE: shoeInputRef,
  };

  useEffect(() => {
    void (async () => {
      try {
        const [itemsRes, profileRes] = await Promise.all([
          fetch("/api/items"),
          fetch("/api/profile"),
        ]);
        if (itemsRes.ok) {
          const { items = [] } = (await itemsRes.json()) as { items: { kind: ItemKind }[] };
          const next: ItemCounts = { TOP: 0, BOTTOM: 0, SHOE: 0 };
          for (const item of items) {
            if (item.kind in next) next[item.kind]++;
          }
          setCounts(next);
        }
        if (profileRes.ok) {
          const profile = await profileRes.json();
          if (Boolean(profile.hasTryOnPhoto)) setTryOnSaved(true);
        }
      } catch {
        // Non-fatal
      }
    })();
  }, []);

  async function onItemFileSelected(kind: ItemKind, file: File) {
    const err = validateImageFile(file);
    if (err) {
      setUploadErrors((prev) => ({ ...prev, [kind]: err }));
      return;
    }
    setUploadErrors((prev) => ({ ...prev, [kind]: undefined }));

    // Show preview immediately
    const previewUrl = URL.createObjectURL(file);
    setPreviews((prev) => {
      if (prev[kind]) URL.revokeObjectURL(prev[kind]!);
      return { ...prev, [kind]: previewUrl };
    });

    setUploading((prev) => ({ ...prev, [kind]: true }));
    try {
      const formData = new FormData();
      formData.append("photo", file);
      formData.set("kind", kind);
      const res = await fetch("/api/items", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Upload failed.");
      setCounts((prev) => ({ ...prev, [kind]: prev[kind] + 1 }));
    } catch (e) {
      setUploadErrors((prev) => ({
        ...prev,
        [kind]: e instanceof Error ? e.message : "Upload failed. Please try again.",
      }));
      setPreviews((prev) => {
        if (prev[kind]) URL.revokeObjectURL(prev[kind]!);
        return { ...prev, [kind]: null };
      });
    } finally {
      setUploading((prev) => ({ ...prev, [kind]: false }));
    }
  }

  function removePreview(kind: ItemKind) {
    setPreviews((prev) => {
      if (prev[kind]) URL.revokeObjectURL(prev[kind]!);
      return { ...prev, [kind]: null };
    });
  }

  function onTryOnFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const err = validateImageFile(file);
    if (err) { setTryOnError(err); return; }
    setTryOnError(null);
    setTryOnFile(file);
    const prev = tryOnPreview;
    setTryOnPreview(URL.createObjectURL(file));
    if (prev) URL.revokeObjectURL(prev);
    setTryOnSaved(false);
  }

  async function saveTryOn() {
    if (!tryOnFile) return;
    setTryOnUploading(true);
    setTryOnError(null);
    try {
      const formData = new FormData();
      formData.set("aiTryOnPhoto", tryOnFile);
      const res = await fetch("/api/profile", { method: "PATCH", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Upload failed.");
      setTryOnSaved(true);
      setTryOnFile(null);
    } catch (e) {
      setTryOnError(e instanceof Error ? e.message : "Upload failed. Please try again.");
    } finally {
      setTryOnUploading(false);
    }
  }

  function removeTryOnPreview() {
    if (tryOnPreview) URL.revokeObjectURL(tryOnPreview);
    setTryOnPreview(null);
    setTryOnFile(null);
    setTryOnSaved(false);
  }

  function goToApp() {
    setShowSuccess(true);
    setTimeout(() => { router.push("/today"); }, 1800);
  }

  const isAnyUploading = Object.values(uploading).some(Boolean);

  const categories: { kind: ItemKind; label: string }[] = [
    { kind: "TOP", label: "Tops" },
    { kind: "BOTTOM", label: "Bottoms" },
    { kind: "SHOE", label: "Shoes" },
  ];

  const isStep1Done = step > 1;
  const isStep1Active = step === 1;
  const isStep2Active = step === 2;

  return (
    <div className="lp-auth-page">
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Nav */}
      <div className="lp-auth-nav-wrap">
        <nav className="lp-auth-nav" style={{ justifyContent: "space-between" }}>
          <Link href="/" className="lp-auth-logo">
            drip<span>ly</span>
          </Link>
          <button
            type="button"
            onClick={goToApp}
            disabled={isAnyUploading || showSuccess}
            className="lp-onboarding-skip-link"
          >
            Skip for now
            <ArrowRightIcon />
          </button>
        </nav>
      </div>

      {/* Main */}
      <main className="lp-auth-main" style={{ alignItems: "flex-start", paddingTop: 40 }}>
        <div className="lp-onboarding-card">

          {/* Progress */}
          {!showSuccess && (
            <div className="lp-onboarding-progress">
              <div className="lp-onboarding-progress-steps">
                <div className={`lp-onboarding-progress-step${isStep1Done ? " done" : isStep1Active ? " active" : ""}`}>
                  <div className="lp-onboarding-progress-fill" />
                </div>
                <div className={`lp-onboarding-progress-step${isStep2Active ? " active" : ""}`}>
                  <div className="lp-onboarding-progress-fill" />
                </div>
              </div>
              <div className="lp-onboarding-progress-labels">
                <div className={`lp-onboarding-progress-label${isStep1Done ? " done" : isStep1Active ? " active" : ""}`}>
                  Your wardrobe
                </div>
                <div className={`lp-onboarding-progress-label${isStep2Active ? " active" : ""}`}>
                  AI preview
                </div>
              </div>
            </div>
          )}

          {/* Success screen */}
          {showSuccess && (
            <div className="lp-onboarding-success">
              <div className="lp-onboarding-success-icon">✦</div>
              <h2 className="lp-onboarding-title">You&apos;re all set.</h2>
              <p className="lp-onboarding-sub" style={{ textAlign: "center" }}>
                driply is scanning your wardrobe and will have your first outfit ready shortly.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--lp-muted)" }}>
                <div style={{
                  width: 16, height: 16, borderRadius: "50%",
                  border: "2px solid var(--lp-border)",
                  borderTopColor: "var(--lp-accent)",
                  animation: "spin 0.7s linear infinite",
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: 13 }}>Loading your wardrobe…</span>
              </div>
            </div>
          )}

          {/* Step 1 — Wardrobe */}
          {!showSuccess && step === 1 && (
            <>
              <div className="lp-onboarding-body">
                <div className="lp-onboarding-eyebrow">Step 1 of 2</div>
                <h2 className="lp-onboarding-title">Add your wardrobe</h2>
                <p className="lp-onboarding-sub">
                  Upload at least one photo per category to get daily outfit recommendations.
                  You can always add more later.
                </p>

                <div className="lp-onboarding-upload-grid">
                  {categories.map(({ kind, label }) => (
                    <div key={kind} className="lp-onboarding-upload-zone">
                      <div className="lp-onboarding-upload-label">{label}</div>
                      <button
                        type="button"
                        onClick={() => inputRefMap[kind].current?.click()}
                        disabled={Boolean(uploading[kind])}
                        className={`lp-onboarding-upload-area${previews[kind] ? " has-preview" : ""}`}
                        aria-label={`Upload ${label}`}
                      >
                        {previews[kind] ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={previews[kind]!}
                              alt={label}
                              className="lp-onboarding-upload-preview"
                            />
                            <button
                              type="button"
                              className="lp-onboarding-upload-remove"
                              onClick={(e) => { e.stopPropagation(); removePreview(kind); }}
                              aria-label={`Remove ${label} photo`}
                            >
                              <CloseIcon />
                            </button>
                          </>
                        ) : (
                          <div className="lp-onboarding-upload-icon-wrap">
                            {uploading[kind] ? (
                              <div style={{
                                width: 24, height: 24, borderRadius: "50%",
                                border: "2px solid var(--lp-border)",
                                borderTopColor: "var(--lp-accent)",
                                animation: "spin 0.7s linear infinite",
                              }} />
                            ) : (
                              <div className="lp-onboarding-upload-icon">
                                <UploadIcon />
                              </div>
                            )}
                            <span className="lp-onboarding-upload-text">
                              {uploading[kind] ? "Uploading…" : "Add photo"}
                            </span>
                          </div>
                        )}
                      </button>
                      <div className={`lp-onboarding-upload-count${counts[kind] > 0 ? " has-items" : ""}`}>
                        {counts[kind] > 0 ? `${counts[kind]} added` : "None yet"}
                      </div>
                      {uploadErrors[kind] ? (
                        <p className="lp-onboarding-error">{uploadErrors[kind]}</p>
                      ) : null}
                      <input
                        ref={inputRefMap[kind]}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          e.target.value = "";
                          void onItemFileSelected(kind, file);
                        }}
                      />
                    </div>
                  ))}
                </div>

                <div className="lp-onboarding-btn-row">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    disabled={isAnyUploading}
                    className="lp-onboarding-btn-primary"
                  >
                    Next
                    <ArrowRightIcon />
                  </button>
                </div>
              </div>
              <div className="lp-onboarding-note">
                You can also add items anytime from your{" "}
                <Link href="/library">Wardrobe</Link>.
              </div>
            </>
          )}

          {/* Step 2 — AI try-on photo */}
          {!showSuccess && step === 2 && (
            <>
              <div className="lp-onboarding-body">
                <div className="lp-onboarding-eyebrow">
                  Step 2 of 2
                  <span style={{ marginLeft: 4, opacity: 0.6, fontWeight: 400, letterSpacing: "0.04em", textTransform: "none" }}>
                    · Optional
                  </span>
                </div>
                <h2 className="lp-onboarding-title">AI outfit preview</h2>
                <p className="lp-onboarding-sub">
                  Upload a full-body photo to see how each outfit recommendation looks on you.
                  Used only for AI previews — never shared.
                </p>

                {/* Full-body upload zone */}
                <button
                  type="button"
                  onClick={() => tryOnInputRef.current?.click()}
                  disabled={tryOnUploading}
                  className={`lp-onboarding-fullbody-area${tryOnPreview ? " has-preview" : ""}`}
                  aria-label="Upload full-body photo"
                >
                  {tryOnPreview ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={tryOnPreview}
                        alt="Try-on photo preview"
                        className="lp-onboarding-fullbody-preview"
                      />
                      <button
                        type="button"
                        className="lp-onboarding-fullbody-remove"
                        onClick={(e) => { e.stopPropagation(); removeTryOnPreview(); }}
                        aria-label="Remove try-on photo"
                      >
                        <CloseIcon />
                      </button>
                    </>
                  ) : (
                    <div className="lp-onboarding-fullbody-icon-wrap">
                      <div className="lp-onboarding-fullbody-icon">
                        {tryOnUploading ? (
                          <div style={{
                            width: 24, height: 24, borderRadius: "50%",
                            border: "2px solid var(--lp-border)",
                            borderTopColor: "var(--lp-accent)",
                            animation: "spin 0.7s linear infinite",
                          }} />
                        ) : (
                          <PersonIcon />
                        )}
                      </div>
                      <div className="lp-onboarding-fullbody-title">
                        {tryOnUploading ? "Uploading…" : "Upload full-body photo"}
                      </div>
                      <div className="lp-onboarding-fullbody-hint">JPG, PNG or WEBP · Max 10 MB</div>
                    </div>
                  )}
                </button>

                {tryOnError ? <p className="lp-onboarding-error" style={{ marginBottom: 12 }}>{tryOnError}</p> : null}

                {/* Save button — shown when a new file is picked but not yet saved */}
                {tryOnFile && !tryOnSaved ? (
                  <button
                    type="button"
                    onClick={() => void saveTryOn()}
                    disabled={tryOnUploading}
                    className="lp-onboarding-btn-primary"
                    style={{ marginBottom: 16 }}
                  >
                    {tryOnUploading ? "Saving…" : "Save photo"}
                    {!tryOnUploading && <ArrowRightIcon />}
                  </button>
                ) : null}

                {/* Privacy note */}
                <div className="lp-onboarding-privacy">
                  <span className="lp-onboarding-privacy-icon">
                    <ShieldIcon />
                  </span>
                  <p className="lp-onboarding-privacy-text">
                    <strong>Private by design.</strong> Your photo is used only to generate outfit previews and is never shared with third parties or used for advertising.
                  </p>
                </div>

                <div className="lp-onboarding-btn-row">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    disabled={showSuccess}
                    className="lp-onboarding-btn-back"
                  >
                    <ArrowLeftIcon />
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={goToApp}
                    disabled={tryOnUploading || showSuccess}
                    className="lp-onboarding-btn-primary"
                  >
                    Go to app
                    <ArrowRightIcon />
                  </button>
                </div>
              </div>
              <div className="lp-onboarding-note">
                You can set up the try-on photo anytime from your{" "}
                <Link href="/profile">Profile</Link>.
              </div>
              <input
                ref={tryOnInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={onTryOnFileChange}
              />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
