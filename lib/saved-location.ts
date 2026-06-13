export type SavedLocation = {
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
};

export type LocationSource = "device" | "saved" | "manual" | null;

export function getSavedLocation(savedLocationKey: string): SavedLocation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(savedLocationKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedLocation;
    if (
      typeof parsed.name === "string" &&
      typeof parsed.latitude === "number" &&
      typeof parsed.longitude === "number"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function setSavedLocation(savedLocationKey: string, next: SavedLocation | null) {
  if (typeof window === "undefined") return;
  if (!next) {
    window.localStorage.removeItem(savedLocationKey);
    return;
  }
  window.localStorage.setItem(savedLocationKey, JSON.stringify(next));
}

export function formatLocationLabel(location: SavedLocation) {
  return [location.name, location.admin1, location.country].filter(Boolean).join(", ");
}
