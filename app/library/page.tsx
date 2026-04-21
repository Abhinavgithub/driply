"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import {
  colorFamilies,
  defaultItemAttributes,
  formalities,
  formatEnumLabel,
  getDefaultSubtypeForKind,
  hasUnknownAttributes,
  itemKinds,
  itemSubtypeOptions,
  MAX_UPLOAD_PHOTOS,
  patterns,
  styleProfiles,
  warmthLevels,
  type ItemAttributeValues,
} from "@/lib/itemAttributes";

type Item = {
  id: string;
  createdAt: string;
  kind: "TOP" | "BOTTOM" | "SHOE";
  subtype: string;
  photoUrl: string;
  analysisStatus: "PENDING" | "READY" | "FAILED" | "SKIPPED";
  metadataSource: "MANUAL" | "AI" | "MIXED";
  visualSummary: string | null;
  analysisConfidence: number | null;
} & ItemAttributeValues;

function kindLabel(kind: Item["kind"]) {
  switch (kind) {
    case "TOP":
      return "Tops";
    case "BOTTOM":
      return "Bottoms";
    case "SHOE":
      return "Shoes";
  }
}

function makeAttributeState(): ItemAttributeValues {
  return { ...defaultItemAttributes };
}

function StatusBadge({ tone, label }: { tone: "success" | "warning"; label: string }) {
  return (
    <span className={`pill ${tone === "success" ? "pill-success" : "pill-warning"}`}>
      {label}
    </span>
  );
}

function getItemStatus(item: Item) {
  if (item.analysisStatus === "PENDING") {
    return { tone: "warning" as const, label: "Pending analysis" };
  }
  if (item.analysisStatus === "FAILED" || hasUnknownAttributes(item)) {
    return { tone: "warning" as const, label: "Needs review" };
  }
  if (item.metadataSource === "MIXED") {
    return { tone: "success" as const, label: "Manual override" };
  }
  if (item.metadataSource === "AI") {
    return { tone: "success" as const, label: "AI filled" };
  }
  return { tone: "success" as const, label: "Ready" };
}

export default function LibraryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<Item["kind"]>>(new Set());

  const [kind, setKind] = useState<Item["kind"]>("TOP");
  const [subtype, setSubtype] = useState<string>(getDefaultSubtypeForKind("TOP"));
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attributes, setAttributes] = useState<ItemAttributeValues>(makeAttributeState);
  const [showManualDetails, setShowManualDetails] = useState(false);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviewUrls(urls);
    return () => { urls.forEach((u) => URL.revokeObjectURL(u)); };
  }, [files]);
  const [editForm, setEditForm] = useState<{ kind: Item["kind"]; subtype: string } & ItemAttributeValues>({
    kind: "TOP",
    subtype: getDefaultSubtypeForKind("TOP"),
    ...makeAttributeState(),
  });

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/items");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load items");
      setItems(json.items ?? []);
    })().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const grouped = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc[item.kind].push(item);
        return acc;
      },
      { TOP: [] as Item[], BOTTOM: [] as Item[], SHOE: [] as Item[] },
    );
  }, [items]);

  function renderAttributeSelect<K extends keyof ItemAttributeValues>(
    field: K,
    value: ItemAttributeValues[K],
    onChange: (next: ItemAttributeValues[K]) => void,
  ) {
    const optionsMap = {
      colorFamily: colorFamilies,
      pattern: patterns,
      styleProfile: styleProfiles,
      formality: formalities,
      warmthLevel: warmthLevels,
    } satisfies Record<K | keyof ItemAttributeValues, readonly string[]>;

    return (
      <label className="field-label">
        <span>{formatEnumLabel(field)}</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as ItemAttributeValues[K])}
          className="input-base"
        >
          {optionsMap[field].map((option) => (
            <option key={option} value={option}>
              {formatEnumLabel(option)}
            </option>
          ))}
        </select>
      </label>
    );
  }

  function handleFileChange(incoming: File[]) {
    const images = incoming.filter((f) => f.type.startsWith("image/"));
    if (images.length > MAX_UPLOAD_PHOTOS) {
      setError(`Max ${MAX_UPLOAD_PHOTOS} photos.`);
      setFiles(images.slice(0, MAX_UPLOAD_PHOTOS));
    } else {
      setError(null);
      setFiles(images);
    }
  }

  async function refreshItems() {
    const listRes = await fetch("/api/items");
    const listJson = await listRes.json();
    if (!listRes.ok) throw new Error(listJson?.error || "Failed to reload items");
    setItems(listJson.items ?? []);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!files.length) throw new Error("Choose photos.");
      if (files.length > MAX_UPLOAD_PHOTOS) {
        throw new Error(`Max ${MAX_UPLOAD_PHOTOS} photos.`);
      }

      const formData = new FormData();
      for (const f of files) formData.append("photo", f);
      if (showManualDetails) {
        formData.set("kind", kind);
        formData.set("subtype", subtype);
      }
      for (const [key, value] of Object.entries(attributes)) {
        if (!showManualDetails || value === "UNKNOWN") continue;
        formData.set(key, value);
      }

      const res = await fetch("/api/items", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Upload failed");

      await refreshItems();
      setFiles([]);
      setAttributes(makeAttributeState());
      setShowManualDetails(false);
      setKind("TOP");
      setSubtype(getDefaultSubtypeForKind("TOP"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function onDeleteItem(itemId: string, itemLabel: string) {
    if (!window.confirm(`Remove "${itemLabel}"?`)) return;
    setError(null);
    setDeletingId(itemId);
    try {
      const res = await fetch("/api/items", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Delete failed");

      setItems((prev) => prev.filter((i) => i.id !== itemId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingId(null);
    }
  }

  async function onReanalyze(itemId: string) {
    setError(null);
    setAnalyzingId(itemId);
    try {
      const res = await fetch("/api/items/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Re-analysis failed");
      if (json.ok && json.item) {
        setItems((prev) => prev.map((i) => (i.id === itemId ? json.item : i)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzingId(null);
    }
  }

  function beginEdit(item: Item) {
    setEditingId(item.id);
    setEditForm({
      kind: item.kind,
      subtype: item.subtype,
      colorFamily: item.colorFamily,
      pattern: item.pattern,
      styleProfile: item.styleProfile,
      formality: item.formality,
      warmthLevel: item.warmthLevel,
    });
  }

  async function onSaveEdit(itemId: string) {
    setError(null);
    setSavingId(itemId);
    try {
      const res = await fetch("/api/items", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId, ...editForm }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Update failed");

      setItems((prev) => prev.map((item) => (item.id === itemId ? json.item : item)));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {error ? (
        <section className="app-card rounded-3xl p-4 text-sm text-danger">
          {error}
        </section>
      ) : null}

      <form onSubmit={onSubmit} className="app-card rounded-3xl p-4">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-base font-medium text-foreground">Upload Clothes</h2>
          <button type="submit" disabled={loading} className="button-primary">
            {loading ? "Uploading..." : "Upload"}
          </button>
        </div>

        <div
          className={`upload-dropzone${dragOver ? " drag-over" : ""}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFileChange(Array.from(e.dataTransfer.files));
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFileChange(Array.from(e.target.files ?? []))}
          />
          <div className="upload-dropzone-icon">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 12V4M9 4L6 7M9 4l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 14h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-medium text-foreground">
              {files.length ? `${files.length} photo${files.length > 1 ? "s" : ""} selected` : "Drop photos here"}
            </div>
            <div className="text-xs muted-copy mt-0.5">
              {files.length ? "Click to change selection" : `or click to browse · up to ${MAX_UPLOAD_PHOTOS} images`}
            </div>
          </div>
        </div>

        {previewUrls.length > 0 && (
          <div className="upload-preview-grid">
            {previewUrls.map((url, i) => (
              <div key={url} className="upload-preview-item">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={files[i]?.name ?? "preview"} />
                <button
                  type="button"
                  className="upload-preview-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFiles((prev) => prev.filter((_, idx) => idx !== i));
                  }}
                  aria-label="Remove photo"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-4">
          <div className="text-sm muted-copy">Optional details</div>
          <button
            type="button"
            onClick={() => setShowManualDetails((prev) => !prev)}
            className="button-ghost"
          >
            {showManualDetails ? "Hide" : "Add details"}
          </button>
        </div>

        {showManualDetails ? (
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="field-label">
                <span>Kind</span>
                <select
                  value={kind}
                  onChange={(e) => {
                    const nextKind = e.target.value as Item["kind"];
                    setKind(nextKind);
                    setSubtype(getDefaultSubtypeForKind(nextKind));
                  }}
                  className="input-base"
                >
                  {itemKinds.map((option) => (
                    <option key={option} value={option}>
                      {formatEnumLabel(option)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-label">
                <span>Subtype</span>
                <select
                  value={subtype}
                  onChange={(e) => setSubtype(e.target.value)}
                  className="input-base"
                >
                  {itemSubtypeOptions[kind].map((option) => (
                    <option key={option} value={option}>
                      {formatEnumLabel(option)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {renderAttributeSelect("colorFamily", attributes.colorFamily, (value) =>
              setAttributes((prev) => ({ ...prev, colorFamily: value }))
            )}
            {renderAttributeSelect("pattern", attributes.pattern, (value) =>
              setAttributes((prev) => ({ ...prev, pattern: value }))
            )}
            {renderAttributeSelect("styleProfile", attributes.styleProfile, (value) =>
              setAttributes((prev) => ({ ...prev, styleProfile: value }))
            )}
            {renderAttributeSelect("formality", attributes.formality, (value) =>
              setAttributes((prev) => ({ ...prev, formality: value }))
            )}
            {renderAttributeSelect("warmthLevel", attributes.warmthLevel, (value) =>
              setAttributes((prev) => ({ ...prev, warmthLevel: value }))
            )}
            </div>
          </div>
        ) : null}
      </form>

      {items.length === 0 ? (
        <section className="app-card rounded-3xl p-6 text-sm muted-copy">
          No items yet.
        </section>
      ) : null}

      {(["TOP", "BOTTOM", "SHOE"] as const).map((groupKind) => {
        const list = grouped[groupKind];
        const isCollapsed = collapsedGroups.has(groupKind);
        return (
          <section key={groupKind} className="space-y-3">
            <h3 className="m-0">
              <button
                type="button"
                aria-expanded={!isCollapsed}
                aria-controls={`group-${groupKind}`}
                onClick={() =>
                  setCollapsedGroups((prev) => {
                    const next = new Set(prev);
                    if (next.has(groupKind)) next.delete(groupKind);
                    else next.add(groupKind);
                    return next;
                  })
                }
                className="app-card flex w-full items-center justify-between gap-4 rounded-2xl px-5 py-4 text-left transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-foreground">{kindLabel(groupKind)}</span>
                  <span className="rounded-full bg-[var(--surface-subtle)] px-2 py-0.5 text-xs font-medium muted-copy">
                    {list.length}
                  </span>
                </div>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  className={`muted-copy flex-shrink-0 transition-transform duration-200${isCollapsed ? "" : " rotate-180"}`}
                >
                  <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </h3>

            <div id={`group-${groupKind}`} hidden={isCollapsed} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {list.map((it) => {
                const isEditing = editingId === it.id;
                const status = getItemStatus(it);

                return (
                  <article key={it.id} className="app-card overflow-hidden rounded-3xl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={it.photoUrl}
                      alt={`${it.kind} ${it.subtype}`}
                      className="h-64 w-full object-cover"
                    />
                    <div className="space-y-4 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-base font-medium text-foreground">
                            {formatEnumLabel(it.subtype)}
                          </div>
                          <div className="mt-1 text-sm muted-copy">
                            {kindLabel(it.kind)}
                            {it.metadataSource === "AI" ? " · AI picked kind/subtype" : null}
                          </div>
                          {it.visualSummary ? (
                            <div className="mt-2 text-sm muted-copy">{it.visualSummary}</div>
                          ) : null}
                        </div>
                        <StatusBadge tone={status.tone} label={status.label} />
                      </div>

                      {isEditing ? (
                        <div className="space-y-4">
                          <label className="field-label">
                            <span>Kind</span>
                            <select
                              value={editForm.kind}
                              onChange={(e) => {
                                const nextKind = e.target.value as Item["kind"];
                                setEditForm((prev) => ({
                                  ...prev,
                                  kind: nextKind,
                                  subtype: getDefaultSubtypeForKind(nextKind),
                                }));
                              }}
                              className="input-base"
                            >
                              {itemKinds.map((option) => (
                                <option key={option} value={option}>
                                  {formatEnumLabel(option)}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="field-label">
                            <span>Subtype</span>
                            <select
                              value={editForm.subtype}
                              onChange={(e) =>
                                setEditForm((prev) => ({ ...prev, subtype: e.target.value }))
                              }
                              className="input-base"
                            >
                              {itemSubtypeOptions[editForm.kind].map((option) => (
                                <option key={option} value={option}>
                                  {formatEnumLabel(option)}
                                </option>
                              ))}
                            </select>
                          </label>

                          <div className="grid gap-3">
                            {renderAttributeSelect("colorFamily", editForm.colorFamily, (value) =>
                              setEditForm((prev) => ({ ...prev, colorFamily: value }))
                            )}
                            {renderAttributeSelect("pattern", editForm.pattern, (value) =>
                              setEditForm((prev) => ({ ...prev, pattern: value }))
                            )}
                            {renderAttributeSelect("styleProfile", editForm.styleProfile, (value) =>
                              setEditForm((prev) => ({ ...prev, styleProfile: value }))
                            )}
                            {renderAttributeSelect("formality", editForm.formality, (value) =>
                              setEditForm((prev) => ({ ...prev, formality: value }))
                            )}
                            {renderAttributeSelect("warmthLevel", editForm.warmthLevel, (value) =>
                              setEditForm((prev) => ({ ...prev, warmthLevel: value }))
                            )}
                          </div>

                          <div className="flex flex-col gap-3 sm:flex-row">
                            <button
                              type="button"
                              onClick={() => onSaveEdit(it.id)}
                              disabled={savingId === it.id}
                              className="button-primary w-full"
                            >
                              {savingId === it.id ? "Saving..." : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="button-secondary w-full"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-wrap gap-2">
                            <span className="pill">{formatEnumLabel(it.colorFamily)}</span>
                            <span className="pill">{formatEnumLabel(it.styleProfile)}</span>
                          </div>

                          <div className="flex flex-col gap-3 sm:flex-row">
                            <button
                              type="button"
                              onClick={() => beginEdit(it)}
                              className="button-secondary w-full"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteItem(it.id, `${it.subtype}`)}
                              disabled={deletingId === it.id}
                              className="button-ghost w-full"
                            >
                              {deletingId === it.id ? "Removing..." : "Remove"}
                            </button>
                          </div>
                          {it.analysisStatus === "PENDING" && (
                            <button
                              type="button"
                              onClick={() => onReanalyze(it.id)}
                              disabled={analyzingId === it.id}
                              className="button-secondary w-full"
                            >
                              {analyzingId === it.id ? "Analyzing..." : "Re-analyze"}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
