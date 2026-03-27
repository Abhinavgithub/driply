"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  colorFamilies,
  defaultItemAttributes,
  formalities,
  formatEnumLabel,
  hasUnknownAttributes,
  itemSubtypeOptions,
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

function StatusBadge({ complete }: { complete: boolean }) {
  return (
    <span className={`pill ${complete ? "pill-success" : "pill-warning"}`}>
      {complete ? "Tagged" : "Needs details"}
    </span>
  );
}

function AttributePill({
  itemId,
  label,
  value,
}: {
  itemId: string;
  label: string;
  value: string;
}) {
  return (
    <span className="pill" key={`${itemId}-${label}-${value}`}>
      <span className="text-[0.65rem] tracking-[0.12em] uppercase">{label}</span>
      <span className="text-foreground">{formatEnumLabel(value)}</span>
    </span>
  );
}

export default function LibraryPage() {
  const MAX_UPLOAD_PHOTOS = 10;
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [kind, setKind] = useState<Item["kind"]>("TOP");
  const [subtype, setSubtype] = useState<string>(itemSubtypeOptions.TOP[0]);
  const [files, setFiles] = useState<File[]>([]);
  const [attributes, setAttributes] = useState<ItemAttributeValues>(makeAttributeState);
  const [editForm, setEditForm] = useState<{ subtype: string } & ItemAttributeValues>({
    subtype: itemSubtypeOptions.TOP[0],
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

  const wardrobeStats = useMemo(() => {
    const incomplete = items.filter((item) => hasUnknownAttributes(item)).length;
    return {
      total: items.length,
      incomplete,
      complete: items.length - incomplete,
    };
  }, [items]);

  useEffect(() => {
    setSubtype(itemSubtypeOptions[kind][0]);
  }, [kind]);

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
      if (!files.length) throw new Error("Choose one or more photos first.");
      if (files.length > MAX_UPLOAD_PHOTOS) {
        throw new Error(`You can upload up to ${MAX_UPLOAD_PHOTOS} photos at once.`);
      }

      const formData = new FormData();
      for (const f of files) formData.append("photo", f);
      formData.set("kind", kind.toLowerCase());
      formData.set("subtype", subtype);
      for (const [key, value] of Object.entries(attributes)) {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function onDeleteItem(itemId: string, itemLabel: string) {
    if (!window.confirm(`Remove "${itemLabel}" from your library?`)) return;
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

  function beginEdit(item: Item) {
    setEditingId(item.id);
    setEditForm({
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
    <div className="space-y-8 pb-6">
      <section className="hero-card lift-in overflow-hidden rounded-[2rem] px-5 py-6 sm:px-8 sm:py-8">
        <div className="grid gap-6 lg:grid-cols-[1.3fr_0.95fr]">
          <div className="space-y-5">
            <div className="eyebrow">Wardrobe Studio</div>
            <div className="max-w-3xl">
              <h2 className="display-title font-semibold text-foreground">
                Build a wardrobe library that can actually style you well.
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 muted-copy sm:text-lg">
                Every item photo, color family, pattern, and style tag gives Driply
                more confidence in what works together. Treat this page like the styling floor.
              </p>
            </div>
          </div>

          <div className="glass-card rounded-[1.7rem] p-5 sm:p-6">
            <div className="eyebrow">Wardrobe Health</div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              <div className="rounded-[1.2rem] border border-border bg-surface px-4 py-4">
                <div className="text-[0.72rem] uppercase tracking-[0.16em] text-muted-foreground">
                  Total Items
                </div>
                <div className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
                  {wardrobeStats.total}
                </div>
              </div>
              <div className="rounded-[1.2rem] border border-border bg-surface px-4 py-4">
                <div className="text-[0.72rem] uppercase tracking-[0.16em] text-muted-foreground">
                  Fully Tagged
                </div>
                <div className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
                  {wardrobeStats.complete}
                </div>
              </div>
              <div className="rounded-[1.2rem] border border-border bg-surface px-4 py-4">
                <div className="text-[0.72rem] uppercase tracking-[0.16em] text-muted-foreground">
                  Needs Details
                </div>
                <div className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
                  {wardrobeStats.incomplete}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <section className="status-panel border-danger/30 bg-danger-soft text-danger lift-in">
          <div className="eyebrow text-danger">Library Error</div>
          <p className="mt-2 text-sm leading-6 text-danger">{error}</p>
        </section>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
        <form
          onSubmit={onSubmit}
          className="section-card lift-in rounded-[2rem] p-5 sm:p-6"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="eyebrow">Item Composer</div>
              <h3 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                Add wardrobe pieces with intent.
              </h3>
            </div>
            <span className="pill">Up to {MAX_UPLOAD_PHOTOS} matching photos per batch</span>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <label className="field-label md:col-span-1">
              <span>Photo</span>
              <input
                type="file"
                accept="image/*"
                required
                multiple
                onChange={(e) => {
                  const next = Array.from(e.target.files ?? []);
                  if (next.length > MAX_UPLOAD_PHOTOS) {
                    setError(`You can upload up to ${MAX_UPLOAD_PHOTOS} photos at once.`);
                    setFiles(next.slice(0, MAX_UPLOAD_PHOTOS));
                    return;
                  }
                  setError(null);
                  setFiles(next);
                }}
                className="input-base pt-3"
              />
            </label>

            <label className="field-label">
              <span>Kind</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as Item["kind"])}
                className="input-base"
              >
                <option value="TOP">Top</option>
                <option value="BOTTOM">Bottom</option>
                <option value="SHOE">Shoe</option>
              </select>
            </label>

            <label className="field-label">
              <span>Subtype</span>
              <select
                value={subtype}
                onChange={(e) => setSubtype(e.target.value)}
                className="input-base"
              >
                {itemSubtypeOptions[kind].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
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

          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm leading-6 muted-copy">
              Selected {files.length} photo{files.length === 1 ? "" : "s"}. Group uploads
              only when the items share the same subtype and styling attributes.
            </div>
            <button type="submit" disabled={loading} className="button-primary">
              {loading ? "Uploading..." : "Upload to wardrobe"}
            </button>
          </div>
        </form>

        <section className="section-card lift-in rounded-[2rem] p-5 sm:p-6">
          <div className="eyebrow">Styling Guidance</div>
          <h3 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
            Make recommendations look smarter faster.
          </h3>
          <div className="mt-5 space-y-4 text-sm leading-6 muted-copy">
            <p>
              Prioritize complete metadata on your most-worn staples first. Strong base items
              sharpen the ranking model more than fringe wardrobe pieces.
            </p>
            <p>
              If a piece is visually loud, tag the pattern accurately. That gives the outfit
              engine better control over balance instead of over-pairing competing prints.
            </p>
            <p>
              Keep color families broad and consistent. The recommendation engine is tuned for
              coherent palettes, not ultra-granular shades.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <span className="pill pill-accent">Color + style drive pairing</span>
            <span className="pill">Unknown fields weaken ranking confidence</span>
          </div>
        </section>
      </section>

      <section className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="eyebrow">Collection</div>
            <h3 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
              Browse and refine your wardrobe.
            </h3>
          </div>
          <div className="pill">
            {wardrobeStats.incomplete > 0
              ? `${wardrobeStats.incomplete} items still need richer styling details`
              : "Every item is fully tagged"}
          </div>
        </div>

        {items.length === 0 ? (
          <div className="section-card rounded-[1.8rem] p-8 text-center">
            <div className="eyebrow">Empty Wardrobe</div>
            <h4 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
              Nothing styled yet.
            </h4>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 muted-copy">
              Upload your first top, bottom, and shoe to give Driply enough wardrobe context to
              build daily looks.
            </p>
          </div>
        ) : null}

        {(["TOP", "BOTTOM", "SHOE"] as const).map((groupKind) => {
          const list = grouped[groupKind];
          return (
            <section key={groupKind} className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[0.72rem] uppercase tracking-[0.16em] text-muted-foreground">
                    {kindLabel(groupKind)}
                  </div>
                  <div className="mt-1 text-xl font-semibold tracking-tight text-foreground">
                    {list.length} item{list.length === 1 ? "" : "s"}
                  </div>
                </div>
                {list.length === 0 ? <span className="pill pill-warning">Category is empty</span> : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {list.map((it, index) => {
                  const isEditing = editingId === it.id;
                  const needsDetails = hasUnknownAttributes(it);

                  return (
                    <article
                      key={it.id}
                      className="image-card lift-in overflow-hidden rounded-[1.6rem]"
                      style={{ animationDelay: `${index * 55}ms` }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={it.photoUrl}
                        alt={`${it.kind} ${it.subtype}`}
                        className="h-64 w-full object-cover"
                      />
                      <div className="space-y-4 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-[0.72rem] uppercase tracking-[0.16em] text-muted-foreground">
                              {kindLabel(it.kind)}
                            </div>
                            <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                              {formatEnumLabel(it.subtype)}
                            </div>
                          </div>
                          <StatusBadge complete={!needsDetails} />
                        </div>

                        {isEditing ? (
                          <div className="space-y-4 rounded-[1.2rem] border border-border bg-surface p-4">
                            <label className="field-label">
                              <span>Subtype</span>
                              <select
                                value={editForm.subtype}
                                onChange={(e) =>
                                  setEditForm((prev) => ({ ...prev, subtype: e.target.value }))
                                }
                                className="input-base"
                              >
                                {itemSubtypeOptions[it.kind].map((option) => (
                                  <option key={option} value={option}>
                                    {option}
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
                                {savingId === it.id ? "Saving..." : "Save details"}
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
                              <AttributePill itemId={it.id} label="Color" value={it.colorFamily} />
                              <AttributePill itemId={it.id} label="Pattern" value={it.pattern} />
                              <AttributePill itemId={it.id} label="Style" value={it.styleProfile} />
                              <AttributePill itemId={it.id} label="Formality" value={it.formality} />
                              <AttributePill itemId={it.id} label="Warmth" value={it.warmthLevel} />
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row">
                              <button
                                type="button"
                                onClick={() => beginEdit(it)}
                                className="button-secondary w-full"
                              >
                                Edit details
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteItem(it.id, `${it.subtype}`)}
                                disabled={deletingId === it.id}
                                aria-label={`Remove ${it.subtype}`}
                                className="button-ghost w-full rounded-full border border-border px-4 py-3 text-foreground hover:border-danger/40 hover:text-danger"
                              >
                                {deletingId === it.id ? "Removing..." : "Remove item"}
                              </button>
                            </div>
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
      </section>
    </div>
  );
}
