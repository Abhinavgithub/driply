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
      {complete ? "Ready" : "Needs details"}
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
      if (!files.length) throw new Error("Choose photos.");
      if (files.length > MAX_UPLOAD_PHOTOS) {
        throw new Error(`Max ${MAX_UPLOAD_PHOTOS} photos.`);
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

        <div className="grid gap-4 md:grid-cols-3">
          <label className="field-label">
            <span>Photo</span>
            <input
              type="file"
              accept="image/*"
              required
              multiple
              onChange={(e) => {
                const next = Array.from(e.target.files ?? []);
                if (next.length > MAX_UPLOAD_PHOTOS) {
                  setError(`Max ${MAX_UPLOAD_PHOTOS} photos.`);
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

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
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
      </form>

      {items.length === 0 ? (
        <section className="app-card rounded-3xl p-6 text-sm muted-copy">
          No items yet.
        </section>
      ) : null}

      {(["TOP", "BOTTOM", "SHOE"] as const).map((groupKind) => {
        const list = grouped[groupKind];
        return (
          <section key={groupKind} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">{kindLabel(groupKind)}</h3>
              <span className="muted-copy text-sm">{list.length}</span>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {list.map((it) => {
                const isEditing = editingId === it.id;
                const needsDetails = hasUnknownAttributes(it);

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
                          <div className="mt-1 text-sm muted-copy">{kindLabel(it.kind)}</div>
                        </div>
                        <StatusBadge complete={!needsDetails} />
                      </div>

                      {isEditing ? (
                        <div className="space-y-4">
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
